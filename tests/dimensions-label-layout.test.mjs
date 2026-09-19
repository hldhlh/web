import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
const { layout, intersects } = createRequire(import.meta.url)('../apps/academy/pages/dimensions/label-layout.js');

test('dense labels avoid dimension lines, each other and image edges at multiple zooms', () => {
  for (const unit of [.5, 1, 2]) {
    const segments = Array.from({ length: 12 }, (_, i) => [{ x: 280 + i * 28, y: 400 }, { x: 340 + i * 28, y: 460 }]);
    const labels = segments.map(([a, b], id) => ({ id, anchor: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, width: 100 * unit, height: 24 * unit }));
    const boxes = layout(labels, segments, 1200, 900, unit);
    assert.deepEqual(boxes, layout(labels, segments, 1200, 900, unit), 'layout must be deterministic');
    boxes.forEach((box, i) => {
      assert.ok(box.x >= box.width / 2 && box.x + box.width / 2 <= 1200);
      assert.ok(box.y >= box.height / 2 && box.y + box.height / 2 <= 900);
      assert.ok(segments.every(([a, b]) => !intersects(box, a, b)), 'label obscures a dimension line');
      for (const other of boxes.slice(0, i)) assert.ok(Math.abs(box.x - other.x) >= (box.width + other.width) / 2 || Math.abs(box.y - other.y) >= (box.height + other.height) / 2, 'labels overlap');
    });
  }
});

test('edge labels stay inside image and prefer the requested side when available', () => {
  const labels = [{ anchor: { x: 2, y: 2 }, width: 140, height: 40 }, { anchor: { x: 400, y: 300 }, width: 120, height: 24, above: true }];
  const boxes = layout(labels, [], 800, 600, 1);
  assert.ok(boxes[0].x >= 70 && boxes[0].y >= 20);
  assert.ok(boxes[1].y < 300);
});
