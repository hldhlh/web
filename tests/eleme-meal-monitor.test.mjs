import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {sanitize, isTarget, validFrame, TARGET, PLATFORMS, matchesTarget, matchesFrame, acceptSample, overview, validPrepMinutes, timingStatus} from '../tools/eleme-meal-monitor/logic.mjs';
import {checkLocalUpdate, attachOpenPages} from '../tools/eleme-meal-monitor/update.mjs';
test('limits monitoring to the intended merchant and frame', () => {
  assert.equal(isTarget(TARGET), true);
  assert.equal(isTarget(TARGET.replace('536928771', '123456789')), false);
  assert.equal(isTarget(TARGET.replace('melody.shop.ele.me', 'melody.shop.ele.me.evil.test')), false);
  assert.equal(validFrame('https://napos-order-pc.faas.ele.me/app/processing/meal'), true);
  assert.equal(validFrame('https://evil.test/app/processing/meal'), false);
});
test('rejects malformed counts and excludes non-ID content', () => {
  for (const count of [-1, NaN, Infinity, '2', 1.5, 100001]) assert.equal(sanitize({count}), null);
  assert.deepEqual(sanitize({count: 2, ids: ['customer', '1000000000000000001', '1000000000000000001']}), {count: 2, orders: []});
});
test('content script reads precise badge title and handles unknown without reading cards', () => {
  const source = fs.readFileSync(new URL('../tools/eleme-meal-monitor/content.js', import.meta.url), 'utf8');
  function run({title = '2', selected = true, missing = false, noBadge = false} = {}) {
    const messages = [];
    const tab = {textContent: '待出餐 012', querySelector: () => noBadge ? null : {getAttribute: () => title}, getAttribute: () => String(selected)};
    const button = {textContent: '上报出餐', getClientRects: () => [1], closest: () => ({querySelectorAll: () => [], firstElementChild: null, id: ''})};
    vm.runInNewContext(source, {MealAuto: {observe() {}, ready: () => [], execute() {}}, 
      document: {documentElement: {}, querySelectorAll: selector => selector === 'button' ? [button] : selector.includes('order-card') ? [] : missing ? [] : [tab], addEventListener() {}},
      window: {addEventListener() {}}, chrome: {runtime: {sendMessage: message => messages.push(message)}},
      MutationObserver: class {observe() {} disconnect() {}}, setInterval() {}, setTimeout() {}, clearInterval() {}, clearTimeout() {}
    });
    return JSON.parse(JSON.stringify(messages[0].sample));
  }
  assert.deepEqual(run(), {count: 2, orders: [], autoReady: []});
  assert.deepEqual(run({selected: false}), {count: 2, orders: [], autoReady: []});
  assert.equal(run({missing: true}), null);
  assert.equal(run({title: '99+'}), null);
  assert.deepEqual(run({noBadge: true}), {count: 0, orders: [], autoReady: []});
});
test('manifest references local files and declares only the intended capabilities and hosts', () => {
  const root = new URL('../tools/eleme-meal-monitor/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', root)));
  assert.deepEqual(manifest.permissions, ['storage', 'alarms', 'scripting', 'webNavigation']);
  assert.deepEqual(manifest.host_permissions, ['https://melody.shop.ele.me/*', 'https://napos-order-pc.faas.ele.me/*', 'https://waimaie.meituan.com/*']);
  for (const file of [manifest.background.service_worker, manifest.action.default_popup, ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(s => s.js)]) assert.ok(fs.existsSync(new URL(file, root)));
});
test('local hot update reloads only a complete matching published build', async () => {
  const oldBuild = 'a'.repeat(64), newBuild = 'b'.repeat(64);
  let reloads = 0;
  async function check(build, source, ok = true) {
    return checkLocalUpdate({currentBuild: oldBuild,
      fetchFile: async file => { assert.equal(file, 'revision.json'); return {ok, json: async () => ({build})}; },
      readBuild: async () => source, reload: async () => { reloads++; }
    });
  }
  assert.equal(await check(oldBuild, ''), false);
  assert.equal(await check('https://evil.test/update.js', ''), false);
  assert.equal(await check(newBuild, '', false), false);
  assert.equal(await check(newBuild, `export const BUILD_ID = '${oldBuild}';`), false);
  assert.equal(await check(newBuild, `export const BUILD_ID = '${newBuild}';\neval('x');`), false);
  assert.equal(reloads, 0);
  assert.equal(await check(newBuild, `export const BUILD_ID = '${newBuild}';\n`), true);
  assert.equal(reloads, 1);
});
test('hot reload attaches only the intended shop and order frame, without page reload', async () => {
  const injections = [], inspected = [];
  const api = {
    tabs: {query: async () => [{id: 1, url: TARGET}, {id: 2, url: TARGET.replace('536928771', '123456789')}], get: async () => ({url: TARGET})},
    webNavigation: {getAllFrames: async ({tabId}) => { inspected.push(tabId); return [{frameId: 0, url: TARGET}, {frameId: 4, url: 'https://napos-order-pc.faas.ele.me/app/processing/meal'}, {frameId: 5, url: 'https://im.ele.me/'}]; }},
    scripting: {executeScript: async value => injections.push(value)}
  };
  await attachOpenPages(api, PLATFORMS, matchesTarget, matchesFrame);
  assert.deepEqual(inspected, [1]);
  assert.deepEqual(injections, [{target: {tabId: 1, frameIds: [4]}, files: ['timing.js', 'auto-click.js', 'content.js']}]);
  injections.length = 0;
  api.tabs.get = async () => ({url: TARGET.replace('536928771', '123456789')});
  await attachOpenPages(api, PLATFORMS, matchesTarget, matchesFrame);
  assert.equal(injections.length, 0);
});
test('re-injection disposes the previous observer, timer and event listeners', () => {
  const source = fs.readFileSync(new URL('../tools/eleme-meal-monitor/content.js', import.meta.url), 'utf8');
  let observers = 0, timers = 0;
  const events = new Set();
  const context = vm.createContext({MealAuto: {observe() {}, ready: () => [], execute() {}}, 
    document: {documentElement: {}, querySelectorAll: () => [], addEventListener: (_, fn) => events.add(fn), removeEventListener: (_, fn) => events.delete(fn)},
    window: {addEventListener() {}, removeEventListener() {}},
    chrome: {runtime: {sendMessage() {}}},
    MutationObserver: class {observe() { observers++; } disconnect() { observers--; }},
    setInterval() { timers++; return timers; }, clearInterval() { timers--; }, setTimeout() {}, clearTimeout() {}
  });
  vm.runInContext(source, context);
  vm.runInContext(source, context);
  assert.equal(observers, 1); assert.equal(timers, 1); assert.equal(events.size, 1);
  context.__mealMonitorStop();
  assert.equal(observers, 0); assert.equal(timers, 0); assert.equal(events.size, 0);
});
test('Meituan target and frame validation excludes other origins, routes and parent frame', () => {
  const target = 'https://waimaie.meituan.com/?region_id=1000330100#/new_fe/orderbusiness#/order/unprocessed';
  const frame = 'https://waimaie.meituan.com/new_fe/orderbusiness#/order/unprocessed?region_id=1000330100';
  assert.equal(matchesTarget('meituan', target), true);
  assert.equal(matchesFrame('meituan', frame), true);
  assert.equal(matchesFrame('meituan', target), false);
  assert.equal(matchesTarget('meituan', target.replace('meituan.com', 'meituan.com.evil.test')), false);
  assert.equal(matchesFrame('meituan', frame.replace('unprocessed', 'history')), false);
  assert.equal(matchesFrame('eleme', frame), false);
});
test('platform states, tab leaders and totals remain independent; unknown is never zero', () => {
  const monitors = {};
  let result = acceptSample(monitors, 'eleme', 1, {count: 2, ids: []}, 100);
  monitors.eleme = result.monitor;
  result = acceptSample(monitors, 'meituan', 2, {count: 3, ids: []}, 100);
  monitors.meituan = result.monitor;
  assert.deepEqual(overview(monitors, 101), {connected: 2, total: 5});
  result = acceptSample(monitors, 'meituan', 2, {count: 4, ids: []}, 102);
  monitors.meituan = result.monitor;
  assert.equal(monitors.eleme.baseline.count, 2);
  assert.equal(acceptSample(monitors, 'meituan', 3, {count: 4, ids: []}, 103), null);
  monitors.meituan = acceptSample(monitors, 'meituan', 2, null, 104).monitor;
  assert.deepEqual(overview(monitors, 105), {connected: 1, total: 2});
  result = acceptSample(monitors, 'meituan', 3, {count: 4, ids: []}, 106);
  assert.equal(result.monitor.tabId, 3);
  assert.deepEqual(overview(monitors, 60101), {connected: 0, total: 0});
});
test('Meituan reads only the verified pending filter, including zero and ambiguous states', () => {
  const source = fs.readFileSync(new URL('../tools/eleme-meal-monitor/meituan.js', import.meta.url), 'utf8');
  function scan(labels) {
    let message;
    vm.runInNewContext(source, {MealAuto: {observe() {}, ready: () => [], execute() {}}, 
      document: {documentElement: {}, querySelectorAll: selector => { if (selector.includes('order-card_')) return []; assert.equal(selector, '.newUnprocessedSecondTabsAncher button .roo-badge-wrap > span'); return labels.map(textContent => ({textContent})); }, addEventListener() {}},
      window: {addEventListener() {}}, chrome: {runtime: {sendMessage: value => {message = value;}}},
      MutationObserver: class {observe() {}}, setTimeout() {}, setInterval() {}, clearInterval() {}, clearTimeout() {}
    });
    return JSON.parse(JSON.stringify(message));
  }
  assert.deepEqual(scan(['待接单 8', '待出餐 0', '待取餐 10']), {type: 'sample', platform: 'meituan', sample: {count: 0, orders: [], autoReady: []}});
  assert.equal(scan(['待出餐 12']).sample.count, 12);
  for (const labels of [[], ['待出餐'], ['待出餐 99+'], ['待出餐 2', '待出餐 3'], ['出餐异常 3']]) assert.equal(scan(labels).sample, null);
});
test('reload attaches both platforms without touching chat or refreshing merchant pages', async () => {
  const injections = [];
  const target = PLATFORMS.meituan.target;
  const api = {
    tabs: {query: async () => [{id: 8, url: target}], get: async () => ({url: target})},
    webNavigation: {getAllFrames: async () => [{frameId: 0, url: target}, {frameId: 2, url: 'https://waimaie.meituan.com/new_fe/orderbusiness#/order/unprocessed'}, {frameId: 3, url: 'https://waimaie.meituan.com/new_fe/imChat_gw'}]},
    scripting: {executeScript: async value => injections.push(value)}
  };
  await attachOpenPages(api, PLATFORMS, matchesTarget, matchesFrame);
  assert.deepEqual(injections, [{target: {tabId: 8, frameIds: [2]}, files: ['timing.js', 'auto-click.js', 'meituan.js']}]);
});
test('prep setting validates minutes and overtime uses only fresh measured order durations', () => {
  for (const value of [1, 15, 180]) assert.equal(validPrepMinutes(value), true);
  for (const value of [0, -1, 181, 1.5, '15', null, NaN]) assert.equal(validPrepMinutes(value), false);
  const monitor = {known: true, at: 1000, baseline: {count: 3, orders: [{key:'1',label:'1',elapsed:899,remaining:1,source:'elapsed'}, {key:'2',label:'2',elapsed:900,remaining:0,source:'elapsed'}]}};
  assert.equal(timingStatus(monitor, 15, 1001).overdue, 1);
  assert.equal(timingStatus(monitor, 15, 1001).complete, false);
  assert.equal(timingStatus(monitor, 15, 1001).orders[0].targetRemaining, 1);
  assert.equal(timingStatus(monitor, 16, 1001).overdue, 0);
  assert.equal(timingStatus(monitor, 15, 61000).known, false);
  assert.deepEqual(sanitize({count: 1, elapsed: [-1, '900', 900, 1000]}), {count: 1, orders: []});
  assert.deepEqual(sanitize({count: 0, elapsed: [900]}), {count: 0, orders: []});
});
test('duration parser reads elapsed time before suggested duration and rejects deadlines', () => {
  const context = vm.createContext({MealAuto: {observe() {}, ready: () => [], execute() {}}, });
  vm.runInContext(fs.readFileSync(new URL('../tools/eleme-meal-monitor/timing.js', import.meta.url), 'utf8'), context);
  const parse = context.MealTiming.parse;
  assert.equal(parse('用时06:08/ 09:56'), 368);
  assert.equal(parse('出餐用时5分54秒建议时长达标'), 354);
  assert.equal(parse('出餐用时1小时2分3秒'), 3723);
  for (const text of ['13:29 前送达', '剩余 06:00', '用时', '用时06:99', '', '建议出餐15分']) assert.equal(parse(text), null);
});
test('individual platform countdowns require their own platform limits, never the configured threshold', () => {
  const context = vm.createContext({MealAuto: {observe() {}, ready: () => [], execute() {}}, });
  vm.runInContext(fs.readFileSync(new URL('../tools/eleme-meal-monitor/timing.js', import.meta.url), 'utf8'), context);
  const read = text => JSON.parse(JSON.stringify(context.MealTiming.read(text)));
  assert.deepEqual(read('用时06:08/09:56'), {elapsed:368, remaining:228, limit:596, source:'elapsed'});
  assert.deepEqual(read('剩余02:00 参考出餐时长10分'), {elapsed:480,remaining:120,limit:600,source:'countdown'});
  assert.deepEqual(read('剩余02:00 参考出餐时长15分'), {elapsed:780,remaining:120,limit:900,source:'countdown'});
  assert.equal(read('剩余02:00').elapsed, null);
  assert.equal(read('13:29前送达').elapsed, null);
  assert.equal(read('已超时01:30 参考出餐时长10分').elapsed, 690);
});
test('Meituan compact and full cards keep separate order identities and exclude completed cards', () => {
  const source = fs.readFileSync(new URL('../tools/eleme-meal-monitor/meituan.js', import.meta.url), 'utf8');
  function card(number, text, pending = true) {
    return {getClientRects:()=>[1], querySelector:selector => selector.includes('submit-button_') ? {textContent: pending ? '出餐完成' : '已出餐'} : selector.includes('time-title_') ? {parentElement:{textContent:text}} : selector.includes('orderNo_') ? {textContent:number} : null};
  }
  let message;
  const cards = [card('11','用时02:00/10:00'),card('12','用时09:00/12:00'),card('11','用时02:00/10:00'),card('13','用时19:00/10:00',false)];
  const context = vm.createContext({MealAuto: {observe() {}, ready: () => [], execute() {}}, 
    document:{documentElement:{},querySelectorAll:selector=>selector.includes('order-card_')?cards:[{textContent:'待出餐 2'}],addEventListener(){}},
    window:{addEventListener(){}},chrome:{runtime:{sendMessage:value=>{message=value;}}},
    MutationObserver:class{observe(){}},setTimeout(){},setInterval(){},clearTimeout(){},clearInterval(){}
  });
  vm.runInContext(fs.readFileSync(new URL('../tools/eleme-meal-monitor/timing.js', import.meta.url),'utf8'),context);
  vm.runInContext(source,context);
  const sample=JSON.parse(JSON.stringify(message.sample));
  assert.equal(sample.orders.length,2);
  assert.deepEqual(sample.orders.map(o=>[o.key,o.elapsed,o.remaining]),[['11',120,480],['12',540,180]]);
  const status=timingStatus({known:true,at:100,baseline:sanitize(sample)},8,101);
  assert.equal(status.complete,true);
  assert.equal(status.overdue,1);
  assert.deepEqual(status.orders.map(o=>o.targetRemaining),[360,-60]);
});
test('Ele.me priority cooking is read as its own real countdown without inventing elapsed time', () => {
  const context = vm.createContext({MealAuto: {observe() {}, ready: () => [], execute() {}}, });
  vm.runInContext(fs.readFileSync(new URL('../tools/eleme-meal-monitor/timing.js', import.meta.url), 'utf8'), context);
  const priority = JSON.parse(JSON.stringify(context.MealTiming.order('1000000000000000001','41','5分14秒内出餐享权益建议5分14秒内出餐')));
  assert.deepEqual(priority, {key:'1000000000000000001',label:'41',elapsed:null,remaining:314,limit:null,source:'remaining'});
  const normal = context.MealTiming.order('1000000000000000002','42','出餐用时1分40秒建议8分19秒内出餐');
  assert.equal(normal.elapsed,100); assert.equal(normal.remaining,499); assert.equal(normal.limit,null);
  const baseline = sanitize({count:2,orders:[priority,normal]});
  const status=timingStatus({known:true,at:100,baseline},8,101);
  assert.equal(status.measured,2); assert.equal(status.complete,true); assert.equal(status.elapsedMeasured,1);
  assert.equal(status.orders[0].targetRemaining,null);
});
test('Ele.me reader includes priority and normal cooking actions, excludes completed cards and duplicate buttons', () => {
  let message;
  const priority={querySelector:()=>null,id:'1000000000000000001',firstElementChild:{textContent:'#41淘宝闪购'},querySelectorAll:()=>[{textContent:'5分14秒内出餐享权益建议5分14秒内出餐'}]};
  const normal={id:'1000000000000000002',firstElementChild:{textContent:'#42淘宝闪购'},querySelectorAll:()=>[{textContent:'出餐用时1分40秒建议8分19秒内出餐'}]};
  const buttons=[['优先出餐',priority],['上报出餐',normal],['上报出餐',normal],['打印',priority]].map(([textContent,card])=>({textContent,getClientRects:()=>[1],closest:()=>card}));
  const tab={getAttribute:()=> 'false',textContent:'待出餐2',querySelector:()=>({getAttribute:()=> '2'})};
  const context=vm.createContext({MealAuto: {observe() {}, ready: () => [], execute() {}}, document:{documentElement:{},querySelectorAll:s=>s==='button'?buttons:s.includes('order-card')?[]:[tab],addEventListener(){}},window:{addEventListener(){}},chrome:{runtime:{sendMessage:m=>{message=m;}}},MutationObserver:class{observe(){}},setInterval(){},setTimeout(){},clearInterval(){},clearTimeout(){}});
  for(const file of ['timing.js','content.js'])vm.runInContext(fs.readFileSync(new URL(`../tools/eleme-meal-monitor/${file}`,import.meta.url),'utf8'),context);
  assert.equal(message.sample.orders.length,2);
  assert.equal(message.sample.orders[0].remaining,314);
  assert.equal(message.sample.orders[1].elapsed,100);
});
test('accepted minute uses merchant acceptance rather than order placement and handles midnight/year rollover', () => {
  const context=vm.createContext({MealAuto: {observe() {}, ready: () => [], execute() {}}, });
  vm.runInContext(fs.readFileSync(new URL('../tools/eleme-meal-monitor/timing.js',import.meta.url),'utf8'),context);
  const parse=context.MealTiming.acceptedMinute;
  const now=Date.parse('2026-11-12T13:35:30+08:00');
  assert.equal(parse('13:27','下单时间: 11-12 13:25',now),Date.parse('2026-11-12T13:27:00+08:00'));
  assert.equal(parse(null,'下单时间: 11-12 13:25',now),null);
  assert.equal(parse('13:40','下单时间: 11-12 13:25',now),null);
  assert.equal(parse('00:02','下单时间: 12-31 23:59',Date.parse('2027-01-01T00:05:00+08:00')),Date.parse('2027-01-01T00:02:00+08:00'));
});
test('minute precision keeps a true elapsed interval and never falsely marks a boundary order overdue', () => {
  const start=Date.parse('2026-11-12T13:27:00+08:00');
  function status(seconds){const now=start+seconds*1000;return timingStatus({known:true,at:now,baseline:{count:1,orders:[{label:'41',elapsed:null,remaining:120,acceptedMinute:start,source:'remaining'}]}},8,now);}
  assert.deepEqual(status(450).orders[0].elapsedRange,{min:390,max:450});
  assert.equal(status(450).orders[0].judgment,'within');
  assert.equal(status(500).orders[0].judgment,'boundary');
  assert.equal(status(500).overdue,0);
  assert.equal(status(500).uncertain,1);
  assert.equal(status(540).orders[0].judgment,'overdue');
  assert.equal(status(540).overdue,1);
  assert.equal(status(540).orders[0].elapsed,null);
});
test('animated progress separates prep and overtime, preserves uncertainty and clamps only the drawing', () => {
  const context=vm.createContext({MealAuto: {observe() {}, ready: () => [], execute() {}}, });
  vm.runInContext(fs.readFileSync(new URL('../tools/eleme-meal-monitor/progress.js',import.meta.url),'utf8'),context);
  const describe=context.MealProgress.describe;
  assert.equal(describe({elapsed:null},8),null);
  let p=describe({elapsed:240},8); assert.equal(p.fill,50); assert.equal(p.state,'within');
  p=describe({elapsed:600},8); assert.equal(p.fill,100); assert.equal(p.extraFill,25); assert.equal(p.overtime,120);
  p=describe({elapsed:null,elapsedRange:{min:450,max:510}},8); assert.equal(p.state,'boundary'); assert.equal(p.ranged,true); assert.equal(p.upper,100);
  p=describe({elapsed:2000},8); assert.equal(p.extraFill,100); assert.equal(p.overtime,1520);
});
test('verified full-list mismatch becomes syncing after stability, while real unread orders remain visible', () => {
  const monitors={};
  const order=(key,elapsed=60)=>({key,label:key,elapsed,remaining:120,source:'elapsed'});
  const sample={count:3,orders:[order('1'),order('2')],inventory:{pending:2,completed:3,total:5}};
  monitors.eleme=acceptSample(monitors,'eleme',1,sample,1000).monitor;
  assert.equal(timingStatus(monitors.eleme,8,1001).missing,1);
  monitors.eleme=acceptSample(monitors,'eleme',1,sample,4100).monitor;
  let status=timingStatus(monitors.eleme,8,4101);
  assert.equal(status.syncGap,1); assert.equal(status.missing,0);
  assert.equal(monitors.eleme.baseline.count,3); // Do not fabricate a replacement platform count.
  const partial={count:3,orders:[order('1')]};
  monitors.eleme=acceptSample(monitors,'eleme',1,partial,4200).monitor;
  status=timingStatus(monitors.eleme,8,4201);
  assert.equal(status.syncGap,0); assert.equal(status.missing,2);
  const missingTimer={count:3,orders:[order('1'),{key:'2',label:'2',elapsed:null,remaining:null}],inventory:{pending:2,completed:1,total:3}};
  monitors.eleme=acceptSample(monitors,'eleme',1,missingTimer,5000).monitor;
  monitors.eleme=acceptSample(monitors,'eleme',1,missingTimer,8100).monitor;
  status=timingStatus(monitors.eleme,8,8101);
  assert.equal(status.syncGap,1); assert.equal(status.missing,1);
  monitors.eleme=acceptSample(monitors,'eleme',1,{...sample,count:2},8200).monitor;
  assert.equal(timingStatus(monitors.eleme,8,8201).syncGap,0);
});
test('remaining-time sorting works across platforms, prioritizes overdue and puts unknown times last', () => {
  const context=vm.createContext({MealAuto: {observe() {}, ready: () => [], execute() {}}, });
  vm.runInContext(fs.readFileSync(new URL('../tools/eleme-meal-monitor/progress.js',import.meta.url),'utf8'),context);
  const api=context.MealProgress;
  const entries=[
    {platform:'eleme',order:{label:'1',targetRemaining:300,judgment:'within'}},
    {platform:'meituan',order:{label:'2',targetRemaining:45,judgment:'within'}},
    {platform:'eleme',order:{label:'3',targetRemaining:-30,judgment:'overdue'}},
    {platform:'meituan',order:{label:'4',targetRemaining:-180,judgment:'overdue'}},
    {platform:'eleme',order:{label:'5',elapsed:null,targetRemaining:null,platformRemaining:null,judgment:'unknown'}},
    {platform:'eleme',order:{label:'6',elapsed:null,targetRemaining:null,platformRemaining:20,judgment:'unknown'}},
    {platform:'meituan',order:{label:'7',elapsed:null,elapsedRange:{min:430,max:490},judgment:'boundary'}}
  ];
  entries.sort((a,b)=>api.compareOrders(a,b,8));
  assert.deepEqual(entries.map(e=>e.order.label),['4','3','7','6','2','1','5']);
});
test('order clocks advance between DOM samples without repeated stale reads resetting their anchors', () => {
  const monitors={};
  const sample=(elapsed=120,remaining=480)=>({count:1,orders:[{key:'1',label:'1',elapsed,remaining,source:'elapsed'}]});
  monitors.eleme=acceptSample(monitors,'eleme',1,sample(),100000).monitor;
  let status=timingStatus(monitors.eleme,8,105000);
  assert.equal(status.orders[0].elapsed,125);
  assert.equal(status.orders[0].platformRemaining,475);
  monitors.eleme=acceptSample(monitors,'eleme',1,sample(),110000).monitor;
  status=timingStatus(monitors.eleme,8,112000);
  assert.equal(status.orders[0].elapsed,132);
  assert.equal(status.orders[0].extrapolated,true);
  monitors.eleme=acceptSample(monitors,'eleme',1,sample(133,467),113000).monitor;
  status=timingStatus(monitors.eleme,8,114000);
  assert.equal(status.orders[0].elapsed,134);
  assert.equal(status.orders[0].extrapolated,false);
});
test('persistently stale DOM stops claiming real-time elapsed and new orders do not inherit clocks', () => {
  const monitors={};
  const sample={count:1,orders:[{key:'1',label:'1',elapsed:450,remaining:30,source:'elapsed'}]};
  monitors.eleme=acceptSample(monitors,'eleme',1,sample,100000).monitor;
  for (const now of [120000,140000,160000]) monitors.eleme=acceptSample(monitors,'eleme',1,sample,now).monitor;
  const stalled=timingStatus(monitors.eleme,8,161000).orders[0];
  assert.equal(stalled.clockStalled,true); assert.equal(stalled.judgment,'unknown');
  assert.equal(stalled.elapsed,510);
  monitors.eleme=acceptSample(monitors,'eleme',1,{count:0,orders:[]},162000).monitor;
  monitors.eleme=acceptSample(monitors,'eleme',1,sample,163000).monitor;
  assert.equal(timingStatus(monitors.eleme,8,163000).orders[0].elapsed,450);
});
test('transient content messaging failure keeps heartbeat alive; invalidated extension context cleans up', () => {
  for (const file of ['content.js','meituan.js']) {
    let heartbeat, sends=0, disconnected=0;
    const runtime={lastError:{message:'The message port closed before a response was received.'},sendMessage:(_,cb)=>{sends++;cb();}};
    const context=vm.createContext({MealAuto: {observe() {}, ready: () => [], execute() {}}, document:{documentElement:{},querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}},window:{addEventListener(){},removeEventListener(){}},chrome:{runtime},MutationObserver:class{observe(){}disconnect(){disconnected++;}},setInterval:fn=>{heartbeat=fn;},setTimeout(){},clearInterval(){},clearTimeout(){}});
    vm.runInContext(fs.readFileSync(new URL(`../tools/eleme-meal-monitor/${file}`,import.meta.url),'utf8'),context);
    assert.equal(disconnected,0);
    runtime.lastError=null;heartbeat();assert.equal(sends,2);
    runtime.lastError={message:'Extension context invalidated.'};heartbeat();assert.equal(disconnected,1);
  }
});

const {autoState, planAuto, minimumElapsed} = await import('../tools/eleme-meal-monitor/auto-policy.mjs');
const autoSender = {tab: {id: 1}, frameId: 4};
const autoMonitor = (elapsed, now = 100000) => ({known: true, baseline: {orders: [{key:'123', label:'12', elapsed, elapsedAt:now, remainingAt:now}]}});
test('automation delay is selected once, bounded, and never schedules before target', () => {
  const state = autoState();
  assert.equal(planAuto(state, 'eleme', autoMonitor(480), 8, autoSender, 100000, () => 1), null);
  assert.equal(state.ledger['eleme:123'].delay, 30);
  assert.equal(planAuto(state, 'eleme', autoMonitor(509), 8, autoSender, 100000, () => 0), null);
  const command = planAuto(state, 'eleme', autoMonitor(510), 8, autoSender, 100000, () => 0);
  assert.equal(command.threshold, 510);
  assert.equal(command.frameId, 4);
  assert.equal(planAuto(state, 'meituan', autoMonitor(999), 8, autoSender, 100000), null);
});
test('automation never retries persisted attempts or times out into another click', () => {
  const state = autoState({maxDelay:0});
  planAuto(state, 'eleme', autoMonitor(500), 8, autoSender, 100000);
  const reloaded = autoState(JSON.parse(JSON.stringify(state)));
  assert.equal(planAuto(reloaded, 'eleme', autoMonitor(600, 120000), 8, autoSender, 120000), null);
  assert.ok(reloaded.paused);
  reloaded.paused = '';
  assert.equal(planAuto(reloaded, 'eleme', autoMonitor(600, 120000), 8, autoSender, 120000), null);
});
test('automation requires actual fresh time and uses conservative minute precision', () => {
  assert.equal(planAuto(autoState({maxDelay:0}), 'eleme', autoMonitor(500), 8, autoSender, 110000), null);
  assert.equal(planAuto(autoState({enabled:false}), 'eleme', autoMonitor(900), 8, autoSender, 100000), null);
  const now = 1000000;
  assert.equal(minimumElapsed({elapsed:null,acceptedMinute:now-539000},now),479);
  assert.equal(minimumElapsed({elapsed:null,acceptedMinute:now-540000},now),480);
  assert.equal(minimumElapsed({elapsed:null,remaining:0},now),null);
});
async function autoFixture({dialog=false, disabled=false, permit=true, fresh=true, completed=true}={}) {
  let clicks=0, now=100000, result, clicked=false;
  const button={isConnected:true, disabled, className:'', getClientRects:()=>[1], getAttribute:()=>null, getBoundingClientRect:()=>({left:0,top:0,width:20,height:20}), contains:()=>false, click(){clicks++;clicked=true;}};
  const context=vm.createContext({
    Date:{now:()=>now}, getComputedStyle:()=>({visibility:'visible'}), setTimeout:fn=>{fn();},
    document:{querySelectorAll:()=>dialog?[button]:[],elementFromPoint:()=>button},
    chrome:{runtime:{sendMessage:async message=>{if(message.type==='autoPermit')return {allowed:permit};result=message;}}}
  });
  vm.runInContext(fs.readFileSync(new URL('../tools/eleme-meal-monitor/auto-click.js',import.meta.url),'utf8'),context);
  const collect=()=>({sample:{count:1,orders:[{key:'1',elapsed:501}]},buttons:new Map([['1',button]]),completed:new Set(clicked&&completed?['1']:[])});
  context.MealAuto.observe({orders:[{key:'1',elapsed:500}]});
  now+=1000;
  if(fresh)context.MealAuto.observe(collect().sample);
  await context.MealAuto.execute({key:'1',label:'1',threshold:480,token:'test'},collect,'eleme');
  return {clicks,result};
}
test('executor clicks once and confirms explicit completed state', async () => {
  const {clicks,result}=await autoFixture(); assert.equal(clicks,1);assert.equal(result.success,true);
});
test('executor stops for modal, disabled action, stale timer or revoked permission', async () => {
  for(const options of [{dialog:true},{disabled:true},{fresh:false},{permit:false}]) {
    const {clicks,result}=await autoFixture(options);assert.equal(clicks,0);assert.equal(result.success,false);
  }
});
test('executor never retries an unconfirmed click', async () => {
  const {clicks,result}=await autoFixture({completed:false});assert.equal(clicks,1);assert.equal(result.success,false);
});
test('worker binds permission to sender and token, persists before dispatch, and revokes on disable', async () => {
  const local = {}, session = {};
  const area = store => ({get:async()=>structuredClone(store),set:async value=>Object.assign(store,structuredClone(value))});
  const event = {addListener(){}};
  const api = {runtime:{getURL:file=>`chrome-extension://test/${file}`,getManifest:()=>({version:'test'}),onMessage:event,onInstalled:event,onStartup:event},storage:{local:area(local),session:area(session)},action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{},setTitle:async()=>{}},alarms:{create(){},onAlarm:event},tabs:{onRemoved:event}};
  const context=vm.createContext({...await import('../tools/eleme-meal-monitor/logic.mjs'), autoState, planAuto, chrome:api, BUILD_ID:'test', attachOpenPages:async()=>{}, setTimeout, clearTimeout});
  const source=fs.readFileSync(new URL('../tools/eleme-meal-monitor/background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  vm.runInContext(source,context);
  const sender={tab:{id:1,url:TARGET},frameId:4,url:'https://napos-order-pc.faas.ele.me/app/processing/meal'};
  const sample={count:1,orders:[{key:'123',label:'12',elapsed:999,remaining:1}],autoReady:['123']};
  const response=await context.handle({type:'sample',platform:'eleme',sample},sender);
  assert.ok(response.command);
  assert.equal(local.automation.ledger['eleme:123'].attempted,true);
  const permit={type:'autoPermit',platform:'eleme',token:response.command.token};
  assert.equal((await context.handle(permit,{...sender,frameId:5})).allowed,false);
  assert.equal((await context.handle(permit,sender)).allowed,true);
  assert.equal((await context.handle(permit,sender)).allowed,false);
  await context.handle({type:'autoResult',platform:'eleme',token:permit.token,success:false,reason:'未确认'},sender);
  assert.equal(local.automation.paused,'未确认');
  assert.equal((await context.handle({type:'sample',platform:'eleme',sample},sender)).command,null);
  await context.handle({type:'autoSettings',enabled:false,maxDelay:30},{url:'chrome-extension://test/popup.html'});
  assert.equal(local.automation.enabled,false);
  assert.equal((await context.handle({type:'sample',platform:'eleme',sample},sender)).command,null);
});
