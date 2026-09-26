import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../apps/academy/pages/meat-template/model.js');

test('visible template values are reportable and blank counts are not zero', () => {
  const draft = M.initial();
  assert.equal(M.missing(draft).length, 0);
  assert.match(M.report(draft), /吊龙：2kg/);
  assert.equal(M.confirmStock(M.empty(), 0), false);
  M.setValue(draft, 'stock', 0, '0');
  M.confirmStock(draft, 0);
  assert.match(M.report(draft), /吊龙：0kg/);
});
test('edited stock immediately updates both stock and trailing summary', () => {
  const draft = M.initial();
  draft.stock.forEach((_, i) => M.confirmStock(draft, i));
  M.setValue(draft, 'stock', 0, '3.275');
  assert.deepEqual(M.missing(draft), []);
  M.confirmStock(draft, 0);
  assert.match(M.report(draft), /吊龙：3.275kg/);
  assert.match(M.report(draft), /缦云吊龙剩余3.275kg$/);
});
test('report includes only positive orders with the user-selected unit', () => {
  const draft = M.empty();
  draft.stock.forEach((_, i) => { M.setValue(draft, 'stock', i, '0'); M.confirmStock(draft, i); });
  M.setValue(draft, 'orders', 1, '2');
  draft.units[1] = '条';
  M.setValue(draft, 'orders', 2, '0');
  assert.equal(M.report(draft), '缦云店报货:\n剩余库存\n吊龙：0kg\n板腱：0kg\n花趾：0kg\n碎肉：0kg\n胸口油：0kg\n极品雪花：0kg\n\n明日订货：\n板腱2条\n缦云吊龙剩余0kg');
});
test('draft restore preserves valid values and rejects malformed numbers, units and confirmations', () => {
  const draft = M.initial();
  draft.stock.forEach((_, i) => M.confirmStock(draft, i));
  assert.deepEqual(M.restore(JSON.parse(JSON.stringify(draft))), draft);
  const restored = M.restore({ stock: ['-1', 'Infinity', '2.1234', '<b>', '2.500', '0'], checked: [true, true, true, true, true, 'yes'], orders: ['2'], units: ['<script>'] });
  assert.deepEqual(restored.stock, ['', '', '', '', '2.5', '0']);
  assert.deepEqual(restored.checked, [false, false, false, false, true, true]);
  assert.equal(restored.units[0], '');
  for (const input of ['-1', '1e3', '2.1234', '100000', 'NaN']) assert.equal(M.setValue(draft, 'stock', 0, input), false);
});

test('arrival and morning start blank and have independent storage keys', () => {
  assert.equal(new Set(Object.values(M.workflows).map(w => w.storageKey)).size, 3);
  for (const kind of ['arrival', 'morning']) {
    const draft = M.initial(kind);
    assert.deepEqual(draft.stock, Array(kind === 'arrival' ? 9 : 6).fill(''));
    assert.equal(M.missing(draft, kind).length, kind === 'arrival' ? 9 : 5);
    assert.equal(M.report(draft, kind).includes('剩余库存'), false);
  }
  assert.deepEqual(M.initial('morning').units, Array(6).fill('kg'));
});

test('arrival report includes actual receipts and explicit zero without inventory or orders', () => {
  const draft = M.empty('arrival');
  ['5.25', '3', '0', '2.5', '1', '0'].forEach((v, i) => { M.setValue(draft, 'stock', i, v); M.confirmStock(draft, i); });
  assert.equal(M.report(draft, 'arrival'), '缦云店到货:\n吊龙：5.25kg\n板腱：3kg\n花趾：0kg\n碎肉：2.5kg\n胸口油：1kg\n极品雪花：0kg');
});

test('arrival covers all order items and expands legacy drafts without losing receipts', () => {
  const expected = ['吊龙', '板腱', '花趾', '碎肉', '胸口油', '极品雪花', '牛大肚', '牛小肠', '牛肋条'];
  assert.deepEqual(M.itemsFor('arrival'), expected);
  assert.deepEqual([...new Set([...M.orderItems, ...M.itemsFor('morning')])], expected);
  const draft = M.restore({ stock: ['1', '2', '3', '4', '5', '6'] }, 'arrival');
  assert.deepEqual(draft.stock, ['1', '2', '3', '4', '5', '6', '', '', '']);
  assert.deepEqual(M.missing(draft, 'arrival'), [6, 7, 8]);
  for (const [i, value] of [[6, '2.5'], [7, '0'], [8, '3.75']]) {
    assert.equal(M.setValue(draft, 'stock', i, value), true);
    assert.equal(M.confirmStock(draft, i), true);
  }
  assert.deepEqual(M.missing(draft, 'arrival'), []);
  assert.match(M.report(draft, 'arrival'), /牛大肚：2.5kg\n牛小肠：0kg\n牛肋条：3.75kg$/);
  assert.deepEqual(M.restore(JSON.parse(JSON.stringify(draft)), 'arrival'), draft);
  assert.equal(M.setValue(M.empty(), 'stock', 6, '1'), false);
});

test('morning report uses selected units and skips zero and unfinished items', () => {
  const draft = M.empty('morning');
  M.setValue(draft, 'stock', 0, '2');
  draft.units[0] = '条';
  M.confirmStock(draft, 0);
  M.setValue(draft, 'stock', 1, '0');
  M.confirmStock(draft, 1);
  assert.equal(M.report(draft, 'morning'), '缦云店明早报货:\n吊龙：2条');
  assert.deepEqual(M.restore(JSON.parse(JSON.stringify(draft)), 'morning'), draft);
});

test('morning excludes premium snow beef from legacy drafts and completion counts', () => {
  const draft = M.empty('morning');
  draft.stock = ['1', '2', '3', '4', '5', '9'];
  const restored = M.restore(draft, 'morning');
  assert.deepEqual(M.itemsFor('morning'), ['吊龙', '板腱', '花趾', '碎肉', '胸口油']);
  assert.equal(M.missing(M.empty('morning'), 'morning').length, 5);
  assert.deepEqual(M.missing(restored, 'morning'), []);
  assert.doesNotMatch(M.report(restored, 'morning'), /极品雪花/);
  assert.match(M.report(restored, 'arrival'), /极品雪花：9kg/);
  assert.match(M.report(restored, 'count'), /极品雪花：9kg/);
  restored.stock[5] = '';
  assert.deepEqual(M.missing(restored, 'morning'), []);
});

test('partial reports omit unconfirmed rows while count retains the order template', () => {
  for (const kind of ['count', 'arrival', 'morning']) {
    const draft = M.empty(kind);
    assert.equal(M.report(draft, kind), '');
    M.setValue(draft, 'stock', 1, '2.5');
    if (kind !== 'count') assert.match(M.report(draft, kind), /板腱：2.5/);
    M.confirmStock(draft, 1);
    if (kind === 'count') { M.setValue(draft, 'stock', 0, '0'); M.confirmStock(draft, 0); }
    const report = M.report(draft, kind);
    assert.match(report, /板腱：2.5/);
    assert.doesNotMatch(report, /花趾|待填写|待盘|待核对|暂无订货/);
  }
});

test('tomorrow orders retain their heading and no-delivery text when blank or zero', () => {
  const draft = M.empty();
  M.setValue(draft, 'stock', 1, '2.5');
  M.confirmStock(draft, 1);
  M.setValue(draft, 'stock', 0, '0');
  M.confirmStock(draft, 0);
  const expected = '缦云店报货:\n剩余库存\n吊龙：0kg\n板腱：2.5kg\n\n明日订货：\n不需要货\n缦云吊龙剩余0kg';
  assert.equal(M.report(draft), expected);
  M.setValue(draft, 'orders', 1, '0');
  assert.equal(M.report(draft), expected);
  M.setValue(draft, 'orders', 1, '2');
  assert.match(M.report(draft), /明日订货：\n板腱2\n缦云吊龙剩余0kg$/);
  assert.doesNotMatch(M.report(draft), /不需要货/);
});

test('tomorrow order reports always end in confirmed tenderloin remainder', () => {
  const draft = M.empty();
  M.setValue(draft, 'orders', 1, '2');
  assert.equal(M.report(draft), '');
  M.setValue(draft, 'stock', 0, '3.25');
  assert.match(M.report(draft), /缦云吊龙剩余3.25kg$/);
  M.confirmStock(draft, 0);
  assert.match(M.report(draft), /明日订货：\n板腱2\n缦云吊龙剩余3.25kg$/);
  M.setValue(draft, 'orders', 1, '');
  assert.match(M.report(draft), /明日订货：\n不需要货\n缦云吊龙剩余3.25kg$/);
});

test('tomorrow orders include tripe and intestines without expanding stock items', () => {
  const draft = M.empty();
  M.setValue(draft, 'stock', 0, '2');
  M.confirmStock(draft, 0);
  assert.equal(M.setValue(draft, 'orders', 6, '3'), true);
  assert.equal(M.setValue(draft, 'orders', 7, '1.5'), true);
  draft.units[6] = '份';
  draft.units[7] = 'kg';
  assert.equal(M.setValue(draft, 'stock', 6, '3'), false);
  assert.match(M.report(draft), /明日订货：\n牛大肚3份\n牛小肠1.5kg\n缦云吊龙剩余2kg$/);
  assert.equal(draft.stock.length, 6);
  assert.deepEqual(M.restore(JSON.parse(JSON.stringify(draft))), draft);
  const old = M.restore({ orders: ['1', '2', '', '', '', ''], units: ['条', '', '', '', '', ''] });
  assert.deepEqual(old.orders, ['1', '2', '', '', '', '', '', '', '']);
  assert.equal(old.units[6], '');
  assert.equal(old.units[7], '');
});

test('rib orders persist and appear before the required remainder line', () => {
  const draft = M.empty();
  M.setValue(draft, 'stock', 0, '2');
  M.confirmStock(draft, 0);
  const index = M.orderItems.indexOf('牛肋条');
  assert.equal(M.setValue(draft, 'orders', index, '3.5'), true);
  draft.units[index] = 'kg';
  assert.match(M.report(draft), /明日订货：\n牛肋条3.5kg\n缦云吊龙剩余2kg$/);
  assert.deepEqual(M.restore(JSON.parse(JSON.stringify(draft))), draft);
});

test('typed values and legacy unconfirmed drafts are reportable without next-item confirmation', () => {
  for (const kind of ['count', 'arrival', 'morning']) {
    const draft = M.empty(kind);
    M.setValue(draft, 'stock', 0, '2.75');
    assert.match(M.report(draft, kind), /吊龙：2.75/);
    draft.checked[0] = false;
    const restored = M.restore(JSON.parse(JSON.stringify(draft)), kind);
    assert.match(M.report(restored, kind), /吊龙：2.75/);
    M.setValue(restored, 'stock', 0, '');
    assert.equal(M.report(restored, kind), '');
  }
});
