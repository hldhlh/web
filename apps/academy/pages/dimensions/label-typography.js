/* Shared typography and drawing primitives for vector preview and raster export. */
(() => {
  'use strict';
  const family = '"PingFang SC", "Dimension Sans", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
  const tokens = Object.freeze({ size: 13, weight: 500, lineHeight: 19, paddingX: 8, paddingY: 4, radius: 6 });
  const font = unit => `${tokens.weight} ${tokens.size * unit}px ${family}`;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  // Only presentation changes; the user's original text remains stored verbatim.
  const displayText = text => text.replace(/(\d)\s*(cm|mm|m|厘米|毫米)(?=$|[^a-z])/gi, '$1\u2009$2');
  function measure(ctx, text, unit, maxWidth) {
    ctx.font = font(unit);
    const lines = []; let line = '';
    for (const char of displayText(text)) {
      if (line && ctx.measureText(line + char).width > maxWidth - tokens.paddingX * 2 * unit) { lines.push(line); line = ''; }
      line += char;
    }
    if (line) lines.push(line);
    return { lines, width: Math.min(maxWidth, Math.max(0, ...lines.map(text => ctx.measureText(text).width)) + tokens.paddingX * 2 * unit),
      height: (lines.length * tokens.lineHeight + tokens.paddingY * 2) * unit };
  }
  function scene(ctx, boxes, unit, styleFor) {
    const nodes = [];
    for (const box of boxes) {
      if (box.inline) continue;
      const style = styleFor(box.styleName);
      const points = { x1: box.anchor.x, y1: box.anchor.y,
        x2: clamp(box.anchor.x, box.x - box.width / 2, box.x + box.width / 2),
        y2: clamp(box.anchor.y, box.y - box.height / 2, box.y + box.height / 2) };
      nodes.push({ tag: 'line', attrs: { ...points, stroke: style.underLine, 'stroke-width': 2.25 * unit } },
        { tag: 'line', attrs: { ...points, stroke: style.line, 'stroke-width': .75 * unit } });
    }
    ctx.font = font(unit);
    // One baseline metric for both rendering paths, including mixed CJK and numbers.
    const metrics = ctx.measureText('国0123456789');
    const baseline = (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
    for (const box of boxes) {
      const style = styleFor(box.styleName);
      if (!box.inline) nodes.push({ tag: 'rect', attrs: { x: box.x - box.width / 2, y: box.y - box.height / 2,
        width: box.width, height: box.height, rx: tokens.radius * unit,
        fill: style.labelBackground, stroke: style.labelBorder, 'stroke-width': .75 * unit } });
      box.lines.forEach((text, i) => nodes.push({ tag: 'text', text, attrs: {
        x: box.x, y: box.y + (i - (box.lines.length - 1) / 2) * tokens.lineHeight * unit + baseline,
        'font-family': family, 'font-size': tokens.size * unit, 'font-weight': tokens.weight,
        'text-anchor': 'middle', fill: box.inline ? style.line : style.labelText,
        ...(box.inline ? { stroke: style.underLine, 'stroke-width': 3 * unit, 'stroke-linejoin': 'round', 'paint-order': 'stroke fill' } : {}),
      } }));
    }
    return nodes;
  }
  function paintSVG(layer, nodes, width, height) {
    const fragment = document.createDocumentFragment();
    for (const { tag, attrs, text } of nodes) {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      if (text !== undefined) node.textContent = text;
      fragment.append(node);
    }
    layer.setAttribute('viewBox', `0 0 ${width} ${height}`);
    layer.replaceChildren(fragment);
  }
  function paintCanvas(ctx, nodes, unit) {
    ctx.save(); ctx.font = font(unit); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (const { tag, attrs: a, text } of nodes) {
      if (tag === 'text') {
        if (a.stroke) { ctx.strokeStyle = a.stroke; ctx.lineWidth = a['stroke-width']; ctx.lineJoin = 'round'; ctx.strokeText(text, a.x, a.y); }
        ctx.fillStyle = a.fill; ctx.fillText(text, a.x, a.y); continue;
      }
      ctx.beginPath(); ctx.strokeStyle = a.stroke; ctx.lineWidth = a['stroke-width'];
      if (tag === 'line') { ctx.moveTo(a.x1, a.y1); ctx.lineTo(a.x2, a.y2); }
      else { ctx.roundRect(a.x, a.y, a.width, a.height, a.rx); ctx.fillStyle = a.fill; ctx.fill(); }
      ctx.stroke();
    }
    ctx.restore();
  }
  // Load locally, never from a third-party font service. A failure keeps the system fallback usable.
  const loaded = document.fonts.load('500 13px "Dimension Sans"').catch(() => []);
  let timer;
  const ready = Promise.race([loaded, new Promise(resolve => { timer = setTimeout(resolve, 2500); })]).finally(() => clearTimeout(timer));
  window.DimensionTypography = { tokens, font, measure, scene, paintSVG, paintCanvas, ready, loaded };
})();
