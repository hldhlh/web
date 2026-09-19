/* Image-space layout; unit is one CSS pixel (or one export reference pixel). */
(function (root) {
  'use strict';
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  function intersects(box, a, b, padding = 0) {
    const left = box.x - box.width / 2 - padding, right = box.x + box.width / 2 + padding;
    const top = box.y - box.height / 2 - padding, bottom = box.y + box.height / 2 + padding;
    let lo = 0, hi = 1;
    for (const [p, d, min, max] of [[a.x, b.x - a.x, left, right], [a.y, b.y - a.y, top, bottom]]) {
      if (Math.abs(d) < 1e-8) { if (p < min || p > max) return false; }
      else {
        const t1 = (min - p) / d, t2 = (max - p) / d;
        lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2));
        if (lo > hi) return false;
      }
    }
    return true;
  }
  function layout(labels, segments, width, height, unit) {
    const placed = [], gap = 5 * unit;
    for (const label of labels) {
      let best, bestScore = Infinity;
      // Keep the preferred side first; expand only when nearby space is occupied.
      for (let ring = 0; ring < 12; ring++) {
        for (const [nx, ny] of label.above ? [[0,-1],[-1,0],[1,0],[0,1]] : [[0,-1],[0,1],[1,0],[-1,0]]) {
          for (const shift of [0, -1, 1]) {
            const distance = (nx ? label.width / 2 : label.height / 2) + gap + ring * (label.height + gap);
            const box = { ...label,
              x: clamp(label.anchor.x + nx * distance + (ny ? shift * (label.width / 2 + gap) : 0), label.width / 2 + gap, width - label.width / 2 - gap),
              y: clamp(label.anchor.y + ny * distance + (nx ? shift * (label.height + gap) : 0), label.height / 2 + gap, height - label.height / 2 - gap) };
            let score = Math.hypot(box.x - label.anchor.x, box.y - label.anchor.y) / unit;
            if (label.above && ny !== -1) score += 25;
            for (const other of placed) {
              const overlapX = (box.width + other.width) / 2 + gap - Math.abs(box.x - other.x);
              const overlapY = (box.height + other.height) / 2 + gap - Math.abs(box.y - other.y);
              if (overlapX > 0 && overlapY > 0) score += 100000 + overlapX * overlapY / (unit * unit);
            }
            for (const [a, b] of segments) if (intersects(box, a, b, 3 * unit)) score += 10000;
            if (score < bestScore) { best = box; bestScore = score; }
          }
        }
        if (bestScore < 10000) break;
      }
      placed.push(best);
    }
    return placed;
  }
  const api = { layout, intersects };
  if (typeof module !== 'undefined') module.exports = api;
  else root.DimensionLabelLayout = api;
})(globalThis);
