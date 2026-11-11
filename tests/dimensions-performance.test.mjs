import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

test('text measurements reuse identical labels, isolate contexts, invalidate fonts and bound cache', async () => {
  const events = {}; let calls = 0;
  const context = { window: {}, document: { fonts: { load: async () => [], addEventListener: (name, fn) => events[name] = fn } }, setTimeout, clearTimeout };
  vm.runInNewContext(readFileSync('apps/academy/pages/dimensions/label-typography.js', 'utf8'), context);
  const typography = context.window.DimensionTypography;
  await typography.ready;
  const ctx = { measureText: text => { calls++; return { width: text.length * 7 }; } };
  const first = typography.measure(ctx, '宽 120 cm', 1, 240); const initial = calls;
  for (let i = 0; i < 100; i++) assert.equal(typography.measure(ctx, '宽 120 cm', 1, 240), first);
  assert.equal(calls, initial);
  typography.measure({ ...ctx }, '宽 120 cm', 1, 240); assert.ok(calls > initial);
  events.loadingdone(); const beforeFont = calls;
  const after = typography.measure(ctx, '宽 120 cm', 1, 240);
  assert.ok(calls > beforeFont); assert.deepEqual(after, first);
  const beforeScale = calls; typography.measure(ctx, '宽 120 cm', 2, 240); assert.ok(calls > beforeScale);
  for (let i = 0; i < 513; i++) typography.measure(ctx, `缓存条目 ${i} cm`, 1, 240);
  const beforeEviction = calls; typography.measure(ctx, '宽 120 cm', 1, 240); assert.ok(calls > beforeEviction);
});

test('drag redraws coalesce and synchronous export cancels the pending frame', () => {
  const source = readFileSync('apps/academy/pages/dimensions/editor.js', 'utf8');
  const methods = source.slice(source.indexOf('  function scheduleRender()'), source.indexOf('  // Editing affordances'));
  const frames = new Map(); let seq = 0, draws = 0, exports = 0;
  const ctx = { state: { image: { naturalWidth: 1200 }, fitScale: 1, zoom: 1, annotationsVisible: true, annotations: [] },
    elements: { canvas: { width: 100, height: 100 }, labelLayer: { style: {} } },
    context: { clearRect() {}, drawImage() { draws++; } },
    paintLabels: exporting => { if (exporting) exports++; }, renderSelection() {}, updateActionBar() {},
    requestAnimationFrame: fn => { frames.set(++seq, fn); return seq; }, cancelAnimationFrame: id => frames.delete(id) };
  vm.runInNewContext('let renderFrame=null, renderUnit, pendingLabels;\n' + methods + '\nglobalThis.schedule=scheduleRender;globalThis.renderNow=render;', ctx);
  for (let i = 0; i < 100; i++) ctx.schedule();
  assert.equal(frames.size, 1); assert.equal(draws, 0);
  const fn = [...frames.values()][0]; frames.clear(); fn(); assert.equal(draws, 1);
  ctx.schedule(); ctx.renderNow(true);
  assert.equal(frames.size, 0); assert.equal(draws, 2); assert.equal(exports, 1);
});
