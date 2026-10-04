import { randomUUID } from 'node:crypto';

// 与 framework/reliable-store.js 的 split/join 契约一致。只修改内容行，
// 不触碰进度、排班或迁移标记；数据库 ts 是比较并交换（CAS）的版本号。
export const CONTENT_KEY = 'doc:academy/content.json:value';
const READY_KEY = 'doc:academy/content.json:$ready';
export class OfficeError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export class OfficeBackend {
  constructor({ url, key, name, password, session, request = fetch }) {
    const origin = new URL(url);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
      throw new OfficeError('CONFIG', 'Supabase URL 必须是 HTTPS 项目根地址');
    }
    if (!key) throw new OfficeError('CONFIG', '缺少 Supabase publishable/anon key');
    this.url = origin.origin; this.key = key; this.name = name; this.password = password;
    this.session = session; this.request = request; this.deviceId = `auto-office-mcp-${randomUUID()}`;
  }

  async http(path, { method = 'GET', body } = {}) {
    let response;
    try {
      response = await this.request(`${this.url}${path}`, {
        method, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000),
        headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch {
      // 不回传原始异常/请求体，防止密码或会话令牌出现在 AI 上下文中。
      throw new OfficeError('NETWORK', method === 'PATCH' ? '未确认保存结果；请重新读取通知核实，勿直接重复创建。' : '服务连接失败，请检查网络或配置');
    }
    if (!response.ok) throw new OfficeError('HTTP', `服务请求失败（HTTP ${response.status}）`);
    try { return await response.json(); } catch { throw new OfficeError('RESPONSE', '服务响应格式异常'); }
  }

  async rpc(action, data) {
    const result = await this.http('/rest/v1/rpc/academy_auth', { method: 'POST', body: { p_action: action, p_data: data } });
    if (result?.ok !== true) {
      // 服务端 code 也视作不可信输入，只返回已知错误码。
      const code = ['AUTH_NOT_READY','INVALID_CREDENTIALS','ACCOUNT_BLOCKED','RATE_LIMITED','SESSION_INVALID','SESSION_REPLACED','SESSION_ENDED','SESSION_EXPIRED','PASSWORD_CHANGED','FORBIDDEN'].includes(result?.code) ? result.code : 'AUTH';
      throw new OfficeError(code, `账号验证失败：${code}。请检查本机凭据；不会自动重登抢占会话。`);
    }
    return result;
  }

  async authorize() {
    // 懒登录：tools/list、resources/read 不登录。登录会遵循系统单终端规则。
    // 会话失效后绝不自动重登，以免与用户浏览器相互踢出。
    if (!this.session) {
      if (this.loginAttempted || !this.name || !this.password) throw new OfficeError('CONFIG', '请配置本机账号密码或有效会话后重启 MCP');
      this.loginAttempted = true;
      const login = await this.rpc('login', { name: this.name, password: this.password, deviceId: this.deviceId });
      this.password = undefined;
      this.session = { userId: login.user.id, sessionToken: login.sessionToken, sessionVersion: login.sessionVersion, deviceId: this.deviceId };
    }
    const { user } = await this.rpc('verify', this.session);
    // 当前工具集是运营管理接口，读写均要求店长；不把员工范围扩展成全量读取。
    if (user?.role !== 'manager' || user.access === 'blocked') throw new OfficeError('FORBIDDEN', 'MCP 运营接口仅限有效店长账号');
    return { id: user.id, name: user.name, role: user.role };
  }

  async readContent() {
    const query = new URLSearchParams({ user_id: `in.("${CONTENT_KEY}","${READY_KEY}")`, select: 'user_id,payload,ts,updated_at' });
    const rows = await this.http(`/rest/v1/academy_progress?${query}`);
    if (!Array.isArray(rows)) throw new OfficeError('RESPONSE', '内容行响应异常');
    const row = rows.find(row => row.user_id === CONTENT_KEY);
    // 拒绝自动迁移：缺少 ready 时网页仍会读旧 Storage，写入新行会制造两套数据。
    if (!rows.some(row => row.user_id === READY_KEY) || !row?.payload?.value) throw new OfficeError('NOT_READY', '请先在 Auto Office 网页完成内容同步，MCP 不会自动迁移旧文件');
    const value = row.payload.value;
    const data = value.data ?? value;
    if (!Number.isSafeInteger(row.ts) || !Array.isArray(data.notices) || !Array.isArray(data.lessons) || !Array.isArray(data.exams)) throw new OfficeError('RESPONSE', '内容结构或版本异常，已停止操作');
    return { row, value, data };
  }

  async saveContent(snapshot, data, token) {
    const version = Math.max(Date.now(), snapshot.row.ts + 1);
    const value = snapshot.value.data ? { ...snapshot.value, rev: version, data: { ...data, rev: version } } : { ...data, rev: version };
    const query = new URLSearchParams({ user_id: `eq.${CONTENT_KEY}`, ts: `eq.${snapshot.row.ts}` });
    // 服务端原子匹配 ts；空结果表示并发冲突，不重试、不覆盖其他人的新内容。
    const rows = await this.http(`/rest/v1/academy_progress?${query}`, { method: 'PATCH', body: {
      payload: { ...snapshot.row.payload, value, token }, ts: version, updated_at: new Date(version).toISOString()
    } });
    if (!Array.isArray(rows)) throw new OfficeError('RESPONSE', '未确认保存结果，请重新读取核实');
    if (rows.length !== 1) throw new OfficeError('CONFLICT', '内容已被其他终端修改，请重新读取并确认后重试');
    if (rows[0].payload?.token !== token || rows[0].ts !== version) throw new OfficeError('RESPONSE', '保存返回值不匹配，请重新读取核实');
    return version;
  }

  async people() {
    const { users } = await this.rpc('people', this.session);
    if (!Array.isArray(users)) throw new OfficeError('RESPONSE', '成员响应异常');
    // 只输出选接收人所需字段，不暴露账号散列、设备或登录记录。
    return users.map(({ id, name, role, access }) => ({ id, name, role, access }));
  }
}
