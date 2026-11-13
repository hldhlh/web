import {autoState, planAuto} from './auto-policy.mjs';
import {PLATFORMS, matchesTarget, matchesFrame, acceptSample, overview, healthy, DEFAULT_PREP_MINUTES, validPrepMinutes, timingStatus} from './logic.mjs';
import {BUILD_ID} from './build-id.mjs';
import {checkLocalUpdate, attachOpenPages} from './update.mjs';
let queue = Promise.resolve();
async function localFile(file) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try { return await fetch(chrome.runtime.getURL(file), {cache: 'no-store', signal: controller.signal}); }
  finally { clearTimeout(timer); }
}
async function checkUpdate() {
  return checkLocalUpdate({
    currentBuild: BUILD_ID,
    fetchFile: localFile,
    readBuild: async () => (await localFile('build-id.mjs')).text(),
    reload: () => chrome.runtime.reload()
  });
}
async function state() {
  const [saved, settings] = await Promise.all([chrome.storage.session.get(['monitors', 'monitor']), chrome.storage.local.get('prepMinutes')]);
  return {prepMinutes: validPrepMinutes(settings.prepMinutes) ? settings.prepMinutes : DEFAULT_PREP_MINUTES, monitors: saved.monitors || (saved.monitor ? {eleme: saved.monitor} : {})};
}
async function badge(monitors) {
  const {total, connected} = overview(monitors);
  const text = !connected ? '?' : `${Math.min(total, 99)}${connected < 2 || total > 99 ? '+' : ''}`;
  await chrome.action.setBadgeText({text});
  await chrome.action.setBadgeBackgroundColor({color: connected === 2 ? '#007aff' : '#a66000'});
  await chrome.action.setTitle({title: `外卖监控 · 已连接 ${connected}/2 个平台${connected ? ` · 待出餐 ${total} 单${connected < 2 ? '（部分平台）' : ''}` : ''}`});
}
async function openShop(platform) {
  if (!Object.hasOwn(PLATFORMS, platform)) return;
  const config = PLATFORMS[platform];
  const tabs = await chrome.tabs.query({url: config.match});
  const existing = tabs.find(tab => matchesTarget(platform, tab.url));
  if (existing) { await chrome.tabs.update(existing.id, {active: true}); await chrome.windows.update(existing.windowId, {focused: true}); }
  else await chrome.tabs.create({url: config.target});
}
async function handle(message, sender) {
  const {monitors, prepMinutes} = await state();
  const automation = autoState((await chrome.storage.local.get('automation')).automation);
  let savedAuto = JSON.stringify(automation);
  const saveAuto = async () => {
    const value = JSON.stringify(automation);
    if (value !== savedAuto) { await chrome.storage.local.set({automation}); savedAuto = value; }
  };
  if (automation.flight && Date.now() - automation.flight.at > 15000) {
    automation.paused = '上次操作结果未确认，请检查订单后恢复'; automation.flight = null; await saveAuto();
  }
  if (['autoPermit', 'autoResult'].includes(message.type)) {
    const f = automation.flight;
    if (!f || !sender.tab || f.token !== message.token || f.platform !== message.platform || f.tabId !== sender.tab.id || f.frameId !== sender.frameId || !matchesTarget(f.platform, sender.tab.url) || !matchesFrame(f.platform, sender.url)) return {allowed: false};
    if (message.type === 'autoPermit') {
      if (!automation.enabled || automation.paused || f.permitted || Date.now() - f.at > 5000) return {allowed: false};
      f.permitted = true; await saveAuto(); return {allowed: true};
    }
    const success = message.success === true && f.permitted;
    automation.last = String(message.reason || '结果未知').slice(0, 150);
    if (!success) automation.paused = automation.last;
    automation.flight = null; await saveAuto(); return {ok: true};
  }
  if (message.type === 'sample') {
    const platform = message.platform || 'eleme';
    if (!Object.hasOwn(PLATFORMS, platform) || !sender.tab || !matchesTarget(platform, sender.tab.url) || !matchesFrame(platform, sender.url)) return;
    const result = acceptSample(monitors, platform, sender.tab.id, message.sample);
    if (!result) return;
    monitors[platform] = result.monitor;
    await chrome.storage.session.set({monitors});
    await badge(monitors);
    const ready = new Set(Array.isArray(message.sample?.autoReady) ? message.sample.autoReady : []);
    const monitor = {...result.monitor, baseline: {...result.monitor.baseline, orders: (result.monitor.baseline?.orders || []).filter(order => ready.has(order.key))}};
    const command = planAuto(automation, platform, monitor, prepMinutes, sender);
    await saveAuto();
    return {command};
  }
  if (sender.tab || sender.url !== chrome.runtime.getURL('popup.html')) return;
  if (message.type === 'status') {
    // Only counts and connection status are exposed to the popup.
    const platforms = Object.fromEntries(Object.keys(PLATFORMS).map(key => [key, {connected: healthy(monitors[key]), count: healthy(monitors[key]) ? monitors[key].baseline.count : null, at: monitors[key]?.at || 0, timing: timingStatus(monitors[key], prepMinutes)}]));
    return {automation: {enabled: automation.enabled, maxDelay: automation.maxDelay, paused: automation.paused, last: automation.last, working: Boolean(automation.flight)}, prepMinutes, platforms, ...overview(monitors), build: BUILD_ID.slice(0, 12), version: chrome.runtime.getManifest().version};
  }
  if (message.type === 'autoSettings') {
    if (typeof message.enabled !== 'boolean' || !Number.isInteger(message.maxDelay) || message.maxDelay < 0 || message.maxDelay > 120) return {error: '随机延迟须为 0–120 秒'};
    automation.enabled = message.enabled; automation.maxDelay = message.maxDelay;
    // A pending attempt is never retried, even when the user resumes.
    if (!automation.flight) automation.paused = '';
    for (const [id, entry] of Object.entries(automation.ledger)) if (!entry.attempted) delete automation.ledger[id];
    await saveAuto(); return {ok: true};
  }
  if (message.type === 'prepMinutes') {
    if (!validPrepMinutes(message.value)) return {error: '请输入 1–180 的整数分钟'};
    if (automation.flight && !automation.flight.permitted) { automation.paused = '目标已更改，请检查订单后恢复'; await saveAuto(); }
    await chrome.storage.local.set({prepMinutes: message.value});
    return {ok: true, prepMinutes: message.value};
  }
  if (message.type === 'update') return {ok: true, updated: await checkUpdate()};
  if (message.type === 'open') await openShop(message.platform);
  return {ok: true};
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  queue = queue.then(() => handle(message || {}, sender)).then(result => respond(result ?? {ok: true})).catch(() => respond({error: '操作失败，请检查扩展权限或重新打开商家页'}));
  return true;
});
chrome.alarms.onAlarm.addListener(() => { queue = queue.then(async () => { const s = await state(); await badge(s.monitors); await checkUpdate(); }).catch(() => {}); });
chrome.tabs.onRemoved.addListener(tabId => {
  queue = queue.then(async () => {
    const s = await state();
    for (const monitor of Object.values(s.monitors)) if (monitor.tabId === tabId) { monitor.at = 0; monitor.known = false; }
    await chrome.storage.session.set({monitors: s.monitors});
    await badge(s.monitors);
  }).catch(() => {});
});
chrome.alarms.create('health', {periodInMinutes: 0.5});
state().then(s => badge(s.monitors)).catch(() => {});
const attach = () => attachOpenPages(chrome, PLATFORMS, matchesTarget, matchesFrame).catch(() => {});
chrome.runtime.onInstalled.addListener(attach);
chrome.runtime.onStartup.addListener(attach);
