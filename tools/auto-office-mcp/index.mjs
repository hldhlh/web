#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { OfficeBackend } from './backend.mjs';
import { createServer } from './server.mjs';

// stdio 的 stdout 专供 JSON-RPC，诊断只写 stderr。凭据由宿主注入，禁止写入日志。
// 本入口不读取浏览器密码/存储，也不读取项目 HTML 或执行其脚本。
try {
  const env = process.env;
  const backend = new OfficeBackend({
    url: env.AUTO_OFFICE_SUPABASE_URL, key: env.AUTO_OFFICE_SUPABASE_ANON_KEY,
    name: env.AUTO_OFFICE_NAME, password: env.AUTO_OFFICE_PASSWORD,
    session: env.AUTO_OFFICE_SESSION_TOKEN && env.AUTO_OFFICE_USER_ID ? {
      userId: env.AUTO_OFFICE_USER_ID, sessionToken: env.AUTO_OFFICE_SESSION_TOKEN
    } : undefined
  });
  await createServer(backend, { readOnly: env.AUTO_OFFICE_READ_ONLY === 'true' }).connect(new StdioServerTransport());
} catch {
  console.error('Auto Office MCP 启动失败：请检查 HTTPS 项目地址、anon/publishable key 和本机配置。');
  process.exitCode = 1;
}
