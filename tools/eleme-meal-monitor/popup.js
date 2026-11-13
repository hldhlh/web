const $ = id => document.getElementById(id);
let busy = false;
let prepDirty = false;
let autoDirty = false;
let refreshing = false;
const orderRows = new Map();
function makeRow(id) {
  const row = document.createElement('div'); row.className = 'order-time-row';
  for (const tag of ['strong', 'span', 'small']) row.append(document.createElement(tag));
  const meter = document.createElement('div'); meter.className = 'order-meter';
  meter.innerHTML = '<div class="meter-caption"><span class="meter-label"></span><span class="meter-target"></span></div><div class="meter-track" role="progressbar"><div class="meter-range"></div><div class="meter-fill"></div></div><div class="overrun"><div class="overrun-label"></div><div class="overrun-track" role="progressbar"><div class="overrun-range"></div><div class="overrun-fill"></div></div></div>';
  row.append(meter); orderRows.set(id, row); return row;
}
function updateMeter(row, order, minutes, name) {
  const meter = row.querySelector('.order-meter');
  const p = MealProgress.describe(order, minutes);
  meter.hidden = !p || order.clockStalled;
  if (!p) return;
  meter.dataset.state = p.state;
  const format = seconds => `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
  meter.querySelector('.meter-label').textContent = p.state === 'boundary' ? '接近目标 · 时间范围跨越目标' : p.state === 'overdue' ? '已达到目标时长' : '出餐进度';
  meter.querySelector('.meter-target').textContent = `目标 ${minutes} 分钟`;
  for (const [selector, width] of [['.meter-fill',p.fill],['.meter-range',p.upper],['.overrun-fill',p.extraFill],['.overrun-range',p.extraUpper]]) meter.querySelector(selector).style.width = `${width}%`;
  const track = meter.querySelector('.meter-track');
  track.setAttribute('aria-label', `${name}出餐进度`);
  track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', String(p.target));
  if (p.ranged) track.removeAttribute('aria-valuenow'); else track.setAttribute('aria-valuenow', String(Math.min(p.target,p.min)));
  track.setAttribute('aria-valuetext', `已用 ${format(p.min)}${p.ranged ? `至${format(p.max)}` : ''}，目标 ${minutes} 分钟`);
  const extra = meter.querySelector('.overrun'); extra.hidden = p.state !== 'overdue';
  meter.querySelector('.overrun-label').textContent = `超时 ${format(p.overtime)}${p.ranged ? `–${format(p.overtimeMax)}` : ''}${p.overtimeMax > p.target ? ' · 已超出刻度' : ''}`;
  const overrun = meter.querySelector('.overrun-track'); overrun.setAttribute('aria-label', `${name}超时进度，以 ${minutes} 分钟为满刻度`);
  overrun.setAttribute('aria-valuemin','0'); overrun.setAttribute('aria-valuemax',String(p.target));
  if (p.ranged) overrun.removeAttribute('aria-valuenow'); else overrun.setAttribute('aria-valuenow',String(Math.min(p.target,p.overtime)));
  overrun.setAttribute('aria-valuetext',meter.querySelector('.overrun-label').textContent);
  overrun.title = `每条满刻度为 ${minutes} 分钟；超时时间继续累计`;
}
async function request(message) {
  let timeout;
  try {
    const result = await Promise.race([
      chrome.runtime.sendMessage(message),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('连接超时，请重试')), 5000); })
    ]);
    if (result?.error) throw new Error(result.error);
    return result;
  } finally { clearTimeout(timeout); }
}
async function refresh() {
  if (busy || refreshing) return;
  refreshing = true;
  try {
    const s = await request({type: 'status'});
    if (!prepDirty && document.activeElement !== $('prep-minutes')) $('prep-minutes').value = s.prepMinutes;
    if (!autoDirty) { $('auto-enabled').checked = s.automation.enabled; $('auto-delay').value = s.automation.maxDelay; }
    $('auto-label').textContent = !s.automation.enabled ? '已关闭' : s.automation.paused ? '已暂停' : s.automation.working ? '上报中' : s.automation.maxDelay === 0 ? '已开启 · 达标即上报' : `已开启 · 达标后延迟 0–${s.automation.maxDelay} 秒`;
    $('auto-settings').dataset.paused = String(s.automation.enabled && Boolean(s.automation.paused));
    $('save-auto').textContent = s.automation.paused ? '恢复' : '保存';
    $('auto-help').textContent = `例如目标为 ${s.prepMinutes} 分钟，${s.automation.maxDelay === 0 ? '达到该时长后立即尝试上报。' : `每单在已用时达到 ${s.prepMinutes} 分钟后，再随机等待最多 ${s.automation.maxDelay} 秒。`}页面状态异常时会暂停。`;
    $('auto-status').textContent = !s.automation.enabled ? '已关闭 · 仅监控' : s.automation.paused ? `已暂停 · ${s.automation.paused}` : s.automation.working ? '正在核对出餐结果…' : `目标出餐时长 ${s.prepMinutes} 分钟；${s.automation.maxDelay === 0 ? '达到目标后立即尝试上报' : `达到目标后，额外随机等待 0–${s.automation.maxDelay} 秒再尝试上报`}${s.automation.last ? '。' + s.automation.last : '。'}`;
    $('version').textContent = `v${s.version}`;
    $('version').title = s.build;
    $('target-label').textContent = `${s.prepMinutes} 分钟`;
    const overdueTotal = Object.values(s.platforms).reduce((sum,p) => sum + p.timing.overdue,0);
    $('overdue-total').textContent = s.connected ? String(overdueTotal) : '—';
    $('overdue-total').classList.toggle('has-overdue',overdueTotal > 0);
    $('connection').textContent = s.connected === 2 ? '监控中' : `${s.connected}/2 已连接`;
    $('connection').classList.toggle('connected', s.connected === 2);
    $('total').textContent = s.connected ? String(s.total) : '—';
    $('summary-label').textContent = s.connected === 2 ? '当前订单' : '已连接平台订单';
    $('summary-caption').textContent = s.connected === 2 ? '实时更新' : s.connected ? '数据不完整' : '等待连接';
    $('summary-status').textContent = s.connected < 2 ? '请打开未连接的商家页面' : overdueTotal ? '超时订单已置顶' : s.total ? '按剩余时间从少到多' : '当前没有待出餐订单';
    const activeRows = new Set();
    const orderList = [];
    let measured = 0;
    let syncGap = 0;
    let missing = 0;
    let elapsedMeasured = 0;
    for (const key of ['eleme', 'meituan']) {
      const p = s.platforms[key];
      $(`${key}-row`).dataset.connected = String(p.connected);
      $(`${key}-count`).textContent = p.connected ? String(p.count) : '—';
      const timing = p.timing;
      measured += timing.measured;
      syncGap += timing.syncGap || 0;
      missing += timing.missing ?? Math.max(0,p.count-timing.measured);
      elapsedMeasured += timing.elapsedMeasured;
      for (const order of timing.orders) {
        const id = `${key}:${order.label}`; activeRows.add(id);
        const row = orderRows.get(id) || makeRow(id);
        const heading = row.children[0]; heading.textContent = `${key === 'eleme' ? '饿了么' : '美团'} #${order.label}`;
        const time = row.children[1];
        const format = seconds => `${Math.floor(Math.abs(seconds) / 60)}:${String(Math.abs(seconds) % 60).padStart(2,'0')}`;
        time.textContent = order.elapsed === null ? order.platformRemaining !== null ? `平台${order.platformRemaining < 0 ? '超时' : '剩余'} ${format(order.platformRemaining)}` : '计时未识别' : `${order.targetRemaining <= 0 ? '超时' : '剩余'} ${format(order.targetRemaining)}`;
        const secondary = row.children[2];
        secondary.textContent = order.elapsed !== null ? `已用 ${format(order.elapsed)}` : '无法判断目标时长';
        if (order.elapsedRange) {
          const range = order.elapsedRange;
          time.textContent = order.judgment === 'overdue' ? `超时 ${format(range.min-s.prepMinutes*60)}–${format(range.max-s.prepMinutes*60)}` : order.judgment === 'boundary' ? '目标临界' : `剩余 ${format(s.prepMinutes*60-range.max)}–${format(s.prepMinutes*60-range.min)}`;
          secondary.textContent = `已用 ${format(range.min)}–${format(range.max)} · 分钟精度`;
        }
        row.classList.toggle('overdue',order.judgment === 'overdue');
        row.classList.toggle('boundary',order.judgment === 'boundary');
        row.orderSort = {platform:key, order};
        row.title = order.platformRemaining === null ? '平台倒计时未显示' : `平台${order.platformRemaining < 0 ? '超时' : '剩余'} ${format(order.platformRemaining)}`;
        if (order.clockStalled) {
          time.textContent = '页面计时未更新';
          secondary.textContent += ' · 待同步，暂不判超时';
          row.classList.remove('overdue', 'boundary');
        } else if (order.extrapolated) secondary.textContent += ' · 本地续计，待页面校准';
        updateMeter(row, order, s.prepMinutes, heading.textContent); orderList.push(row);
      }
      const line = $(`${key}-timing`);
      line.classList.toggle('overdue', p.connected && timing.overdue > 0);
      const notes = [];
      if (p.connected && timing.syncGap) notes.push('平台数量待同步');
      const unread = timing.missing ?? Math.max(0,p.count-timing.measured);
      if (p.connected && unread) notes.push(`${unread} 单未识别`);
      else if (p.connected && timing.uncertain) notes.push(`${timing.uncertain} 单临界`);
      line.textContent = notes.join(' · ');
      line.title = timing.syncGap ? `平台显示 ${p.count} 单，当前完整列表确认 ${p.count-timing.syncGap} 单待出餐；已出餐订单不参与计时` : '';
      line.hidden = !line.textContent;
      $(`${key}-status`).textContent = p.connected ? '已连接' : '未连接';
      $(`${key}-status`).title = p.at ? `最后更新 ${new Date(p.at).toLocaleTimeString('zh-CN')}` : '';

    }
    for (const [id,row] of orderRows) if (!activeRows.has(id)) { row.remove(); orderRows.delete(id); }
    orderList.sort((a,b) => MealProgress.compareOrders(a.orderSort,b.orderSort,s.prepMinutes));
    const list = $('order-times');
    $('empty-orders').hidden = orderList.length > 0;
    $('empty-orders').textContent = !s.connected ? '连接商家页面后显示订单' : s.total ? '请在商家页展开待出餐订单' : '暂无待出餐订单';
    orderList.forEach((row,index) => { if (list.children[index] !== row) list.insertBefore(row,list.children[index] || null); });
    $('coverage').textContent = s.connected ? `${measured}/${s.total} 已识别${missing ? ' · 存在漏读' : syncGap ? ' · 数量待同步' : ''}` : '等待连接';
    if (syncGap && s.connected === 2) $('summary-status').textContent = '平台数量待同步 · 已出餐订单已排除';
    $('coverage').title = `可判目标：${elapsedMeasured}/${s.total} 单；分钟级接单时间显示用时范围，临界时不误报。`;
  } catch { $('connection').textContent = '连接重试中'; $('connection').classList.remove('connected'); }
  finally { refreshing = false; }
}
async function action(message) {
  if (busy) return;
  busy = true;
  try {
    const result = await request(message);
    if (message.type === 'prepMinutes') prepDirty = false;
    if (message.type === 'autoSettings') autoDirty = false;
    $('feedback').textContent = message.type === 'prepMinutes' ? `已保存：${result.prepMinutes} 分钟，两个平台均适用。` : message.type === 'update' ? result.updated ? '正在更新，请稍后重新打开面板。' : '当前已是本地最新版本。' : '';
  } catch { $('feedback').textContent = message.type === 'update' ? '扩展可能正在重载，请重新打开面板查看版本。' : '操作未完成，请检查扩展权限后重试。'; }
  finally { busy = false; await refresh(); }
}
$('prep-minutes').addEventListener('input', () => { prepDirty = true; });
$('prep-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!$('prep-form').reportValidity()) return;
  action({type: 'prepMinutes', value: Number($('prep-minutes').value)});
});
$('update').addEventListener('click', () => action({type: 'update'}));
for (const button of document.querySelectorAll('[data-platform]')) button.addEventListener('click', () => action({type: 'open', platform: button.dataset.platform}));
refresh(); setInterval(refresh, 1000);

$('auto-delay').addEventListener('input', () => { autoDirty = true; });
$('auto-enabled').addEventListener('change', () => { autoDirty = true; action({type: 'autoSettings', enabled: $('auto-enabled').checked, maxDelay: Number($('auto-delay').value)}); });
$('auto-form').addEventListener('submit', event => { event.preventDefault(); if ($('auto-form').reportValidity()) action({type: 'autoSettings', enabled: $('auto-enabled').checked, maxDelay: Number($('auto-delay').value)}); });
