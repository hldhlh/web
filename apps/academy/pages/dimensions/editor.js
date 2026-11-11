(() => {
  "use strict";

  let renderFrame = null;

  const elements = {
    workspace: document.querySelector("#workspace"),
    viewport: document.querySelector("#viewport"),
    emptyState: document.querySelector("#emptyState"),
    canvasStage: document.querySelector("#canvasStage"),
    canvas: document.querySelector("#measureCanvas"),
    selectionCanvas: document.querySelector("#selectionCanvas"),
    labelLayer: document.querySelector("#labelLayer"),
    toggleEdit: document.querySelector("#toggleEdit"),
    canvasHint: document.querySelector("#canvasHint"),
    notice: document.querySelector("#notice"),
    dropMask: document.querySelector("#dropMask"),
    sidePanel: document.querySelector("#sidePanel"),
    steps: document.querySelector("#steps"),
    fileInput: document.querySelector("#fileInput"),
    uploadButton: document.querySelector("#uploadButton"),
    replaceImage: document.querySelector("#replaceImage"),
    replaceText: document.querySelector(".replace-text"),
    panelReplace: document.querySelector("#panelReplace"),
    exportImage: document.querySelector("#exportImage"),
    copyImage: document.querySelector("#copyImage"),
    lineTool: document.querySelector("#lineTool"),
    rectTool: document.querySelector("#rectTool"),
    circleTool: document.querySelector("#circleTool"),
    curveTool: document.querySelector("#curveTool"), noteTool: document.querySelector("#noteTool"),
    styleButtons: [...document.querySelectorAll("[data-style]")],
    positionButtons: [...document.querySelectorAll("[data-label-position]")],
    lineLabelFields: document.querySelector("#lineLabelFields"),
    rectLabelFields: document.querySelector("#rectLabelFields"),
    labelInput: document.querySelector("#labelInput"),
    edgeInputs: {
      top: document.querySelector("#topLabelInput"),
      right: document.querySelector("#rightLabelInput"),
      bottom: document.querySelector("#bottomLabelInput"),
      left: document.querySelector("#leftLabelInput"),
    },
    quickLabels: document.querySelector(".quick-labels"),
    editorTip: document.querySelector("#editorTip"),
    measureCount: document.querySelector("#measureCount"),
    listEmpty: document.querySelector("#listEmpty"),
    listItems: document.querySelector("#listItems"),
    imageSize: document.querySelector("#imageSize"),
  };

  const context = elements.canvas.getContext("2d");
  const state = {
    image: null,
    editing: false,
    interaction: "draw", redrawId: null,
    annotationsVisible: true,
    fileName: "图片",
    objectUrl: null,
    annotations: [],
    draft: null,
    handleDrag: null,
    hoverHandle: null,
    selectedId: null,
    nextId: 1,
    tool: "line",
    annotationStyle: "light",
    labelPosition: "center",
    rotation: 0,
    zoom: 1,
    panX: 0, panY: 0,
    fitScale: 1,
  };

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function selectedAnnotation() {
    return state.annotations.find((item) => item.id === state.selectedId) || null;
  }

  let noticeTimer;
  function setNotice(message) {
    elements.notice.textContent = message;
    document.getElementById('undoDelete').hidden = !message.startsWith('已删除标注');
    clearTimeout(noticeTimer);
    elements.canvasHint.classList.toggle('is-toast', /失败|导出|已复制|复制失败|不足|冲突|已删除标注|已撤销|已重做|不能覆盖/.test(message));
    noticeTimer = setTimeout(() => elements.canvasHint.classList.remove('is-toast'), 4000);
  }
  function setInspector(open) {
    elements.workspace.dataset.inspector = String(open);
    const toggle = document.getElementById('inspectorToggle');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('span').textContent = open ? '收起' : '标注';
  }
  document.getElementById('inspectorToggle').addEventListener('click', () => {
    setInspector(elements.workspace.dataset.inspector !== 'true');
  });

  function lineLength(item) {
    return Math.hypot(item.end.x - item.start.x, item.end.y - item.start.y);
  }

  function circleRadius(item) {
    return lineLength(item);
  }

  function openFilePicker() {
    elements.fileInput.value = "";
    elements.fileInput.click();
  }

  async function loadFile(file) {
    if (window.DimensionCollab) await window.DimensionCollab.create(file);
  }

  async function openImage(blob, name) {
    await typography.ready;
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    await new Promise((resolve, reject) => {
      const finish = error => {
        clearTimeout(timeout); image.onload = null; image.onerror = null;
        if (error) { image.src = ''; URL.revokeObjectURL(objectUrl); reject(error); }
        else resolve();
      };
      const timeout = setTimeout(() => finish(new Error('图片解码超时，请重试打开')), 45000);
      image.onload = () => finish();
      image.onerror = () => finish(new Error("图片无法读取，请重新选择或重试打开"));
      image.src = objectUrl;
    });
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    Object.assign(state, { image, objectUrl, fileName: name, annotations: [], draft: null,
      handleDrag: null, hoverHandle: null, selectedId: null, rotation: 0, zoom: 1, panX: 0, panY: 0, editing: false, annotationsVisible: true });
    committed.clear(); undoStack.length = 0; redoStack.length = 0;
    state.interaction = 'draw'; state.redrawId = null; spaceHeld = false;
    elements.canvasStage.style.transform = '';
    cancelAnimationFrame(gestureFrame); gestureFrame = null;
    pointers.clear(); gesture = null; singlePointer = null; suppressDrawing = false; deferredAnnotations = null;
    setInspector(false);
    elements.canvas.width = image.naturalWidth;
    elements.canvas.height = image.naturalHeight;
    elements.selectionCanvas.width = image.naturalWidth;
    elements.selectionCanvas.height = image.naturalHeight;
    elements.workspace.classList.add("has-image");
    elements.emptyState.hidden = true;
    elements.canvasStage.hidden = false;
    elements.canvasHint.hidden = false;
    elements.sidePanel.hidden = false;
    elements.steps.hidden = true;
    elements.replaceText.textContent = "新建图片";
    elements.imageSize.textContent = `${image.naturalWidth} × ${image.naturalHeight}`;
    updateFit(); updateInterface(); render();
    setNotice("浏览模式：缩放和平移画布；点击编辑后新建或选择标注");
  }

  const committed = new Map(), undoStack = [], redoStack = [];
  let replaying = false, spaceHeld = false;
  const content = item => item && JSON.stringify([item.type, item.start, item.end, item.points, item.control, item.label, item.labels, item.style, item.labelPosition, Boolean(item.locked), Boolean(item.deleted)]);
  function commit(item, deleted = false) {
    if (!item || !state.editing) return;
    const before = committed.get(item.id);
    const value = { ...structuredClone(item), deleted };
    if (content(before) === content(value)) return;
    const result = window.DimensionCollab?.edit(value, deleted) || value;
    committed.set(item.id, structuredClone(result));
    if (!replaying) {
      undoStack.push({ before: before ? structuredClone(before) : null, after: structuredClone(result) });
      if (undoStack.length > 100) undoStack.shift();
      redoStack.length = 0;
    }
    updateActionBar();
  }

  function removeAnnotation(item = selectedAnnotation()) {
    if (!state.editing || !state.annotationsVisible || !item || item.locked) return;
    cancelDrawing(); state.redrawId = null;
    commit(item, true);
    state.annotations = state.annotations.filter(x => x.id !== item.id);
    state.selectedId = null;
    updateInterface(); render();
    setNotice('已删除标注 · 可撤销');
    document.getElementById('undoAction').focus({ preventScroll: true });
  }

  function setInteraction(mode) {
    cancelDrawing(); state.redrawId = null;
    state.interaction = mode; state.hoverHandle = null; state.selectedId = null;
    if (pointers.size) suppressDrawing = true;
    updateInterface(); render();
    setNotice(mode === 'draw' ? '绘制新标注 · 已有标注已锁定' : '选择标注 · 拖动端点调整，Delete 删除');
  }

  function redrawSelected() {
    const item = selectedAnnotation();
    if (!item || !state.editing || item.locked) return;
    cancelDrawing(); state.redrawId = item.id; state.tool = item.type;
    state.interaction = 'draw'; state.selectedId = null; state.hoverHandle = null;
    updateToolInterface(); updateInterface(); render();
    setNotice('重新绘制 · 原标注保留至完成，Esc 取消');
  }

  function updateActionBar() {
    const bar = document.getElementById('annotationActions');
    if (!bar) return;
    const selected = selectedAnnotation();
    document.getElementById('lockSelected').textContent = selected?.locked ? '解锁' : '锁定';
    for (const id of ['redrawSelected', 'deleteSelected']) document.getElementById(id).disabled = Boolean(selected?.locked);
    bar.hidden = !state.editing || !state.annotationsVisible || !selected || Boolean(state.draft || state.handleDrag);
    document.getElementById('editModes').hidden = !state.editing;
    document.getElementById('drawMode').setAttribute('aria-pressed', String(state.interaction === 'draw'));
    document.getElementById('selectMode').setAttribute('aria-pressed', String(state.interaction === 'select'));
    document.getElementById('undoAction').disabled = !state.editing || !undoStack.length;
    document.getElementById('redoAction').disabled = !state.editing || !redoStack.length;
    if (bar.hidden) return;
    const rect = elements.canvas.getBoundingClientRect(), view = elements.viewport.getBoundingClientRect();
    const angle = state.rotation * Math.PI / 180, scale = state.fitScale * state.zoom;
    const dx = (selected.end.x - elements.canvas.width / 2) * scale;
    const dy = (selected.end.y - elements.canvas.height / 2) * scale;
    const x = rect.left + rect.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle) - view.left;
    const y = rect.top + rect.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) - view.top;
    bar.style.left = `${clamp(x - bar.offsetWidth / 2, 8, Math.max(8, view.width - bar.offsetWidth - 8))}px`;
    const below = y + 28;
    bar.style.top = `${clamp(below + bar.offsetHeight < view.height ? below : y - bar.offsetHeight - 28, 8, Math.max(8, view.height - bar.offsetHeight - 8))}px`;
  }

  let deferredAnnotations = null;
  function applyAnnotations(items) {
    if (state.draft || state.handleDrag) { deferredAnnotations = items; return; }
    deferredAnnotations = null;
    state.annotations = structuredClone(items);
    for (const item of items) committed.set(item.id, structuredClone(item));
    if (!selectedAnnotation()) state.selectedId = null;
    const input = document.activeElement;
    const selection = input?.tagName === 'INPUT' ? [input.selectionStart, input.selectionEnd] : null;
    updateInterface(); render();
    if (selection && !input.disabled) input.setSelectionRange(...selection);
  }

  window.DimensionEditor = { openImage, applyAnnotations, fit: updateFit, notice: setNotice,
    batchPreview(items, canvas) {
      const original=state.annotations, selected=state.selectedId;
      try { state.annotations=structuredClone(items); state.selectedId=null; render(true); canvas.width=elements.canvas.width; canvas.height=elements.canvas.height; canvas.getContext('2d').drawImage(elements.canvas,0,0); }
      finally { state.annotations=original; state.selectedId=selected; render(); }
    },
    busy: () => Boolean(state.draft || state.handleDrag) };

  // Match the displayed percentage: 600% of the original image, on every viewport.
  const maximumZoom = () => 6 / state.fitScale;

  function updateFit(preserveViewport = false) {
    if (!state.image) return;
    const previousFitScale = state.fitScale;
    const previousZoom = state.zoom;
    const previousPanX = state.panX, previousPanY = state.panY;
    const availableWidth = Math.max(200, elements.viewport.clientWidth - 36);
    const availableHeight = Math.max(220, elements.viewport.clientHeight - 36);
    state.fitScale = Math.min(
      availableWidth / (state.rotation % 180 ? state.image.naturalHeight : state.image.naturalWidth),
      availableHeight / (state.rotation % 180 ? state.image.naturalWidth : state.image.naturalHeight),
      1,
    );
    if (preserveViewport && previousFitScale > 0) {
      state.zoom = clamp(previousFitScale * previousZoom / state.fitScale, .5, maximumZoom());
      state.panX = previousPanX;
      state.panY = previousPanY;
    } else {
      state.zoom = Math.min(state.zoom, maximumZoom());
    }
    updateCanvasDisplaySize();
    panCanvas(0, 0);
  }

  function updateCanvasDisplaySize() {
    if (!state.image) return;
    const width = state.image.naturalWidth * state.fitScale * state.zoom;
    const height = state.image.naturalHeight * state.fitScale * state.zoom;
    elements.canvas.style.width = `${width}px`;
    elements.canvas.style.height = `${height}px`;
    elements.canvasStage.style.width = `${width}px`;
    elements.canvasStage.style.height = `${height}px`;
    document.getElementById('zoomValue').textContent = `${Math.round(state.fitScale * state.zoom * 100)}%`;
    document.getElementById('zoomOut').disabled = state.zoom <= .5;
    document.getElementById('zoomIn').disabled = state.zoom >= maximumZoom();
    render();
  }

  function panCanvas(dx, dy) {
    // One coordinate system for pan and zoom; native scroll offsets must not
    // absorb or clamp the two-finger translation on mobile browsers.
    state.panX += dx;
    state.panY += dy;
    elements.canvasStage.style.transform = `translate(-50%, -50%) translate3d(${state.panX}px, ${state.panY}px, 0) rotate(${state.rotation}deg)`;
  }

  function setZoom(nextZoom, clientX, clientY, anchor) {
    if (!state.image) return;
    const previousRect = elements.canvas.getBoundingClientRect();
    const anchorX = anchor ? anchor.x : previousRect.width ? (clientX - previousRect.left) / previousRect.width : .5;
    const anchorY = anchor ? anchor.y : previousRect.height ? (clientY - previousRect.top) / previousRect.height : .5;
    const clampedZoom = clamp(nextZoom, .5, maximumZoom());
    if (!anchor && Math.abs(clampedZoom - state.zoom) < .001) return;

    state.zoom = clampedZoom;
    updateCanvasDisplaySize();
    const nextRect = elements.canvas.getBoundingClientRect();
    const nextAnchorX = nextRect.left + anchorX * nextRect.width;
    const nextAnchorY = nextRect.top + anchorY * nextRect.height;
    panCanvas(clientX - nextAnchorX, clientY - nextAnchorY);
    setNotice(`图片缩放 ${Math.round(state.fitScale * state.zoom * 100)}%`);
  }

  function visualStyle(name) {
    const styles = {
      outline: {
        line: "#0b0b0b", underLine: "rgba(255,255,255,.96)", lineWidth: 2.8, underLineWidth: 7,
        labelBackground: "#ffffff", labelText: "#1d1d1f", labelBorder: "#0b0b0b",
        labelBorderWidth: 1.5, labelRadius: 9, shadow: "transparent",
      },
      light: {
        line: "#ffffff", underLine: "rgba(0,0,0,.28)", lineWidth: 4, underLineWidth: 6.5,
        labelBackground: "#ffffff", labelText: "#1d1d1f", labelBorder: "rgba(0,0,0,.08)",
        labelBorderWidth: 1, labelRadius: 99, shadow: "rgba(0,0,0,.24)",
      },
      dark: {
        line: "#0b0b0b", underLine: "rgba(255,255,255,.82)", lineWidth: 4, underLineWidth: 6.5,
        labelBackground: "#242426", labelText: "#ffffff", labelBorder: "rgba(255,255,255,.28)",
        labelBorderWidth: 1, labelRadius: 99, shadow: "rgba(0,0,0,.28)",
      },
    };
    return styles[name] || styles.light;
  }

  function itemStyle(item, isDraft) {
    return isDraft ? state.annotationStyle : item.style || "light";
  }

  function itemLabelPosition(item, isDraft) {
    return isDraft ? state.labelPosition : item.labelPosition || "center";
  }

  let renderUnit = 1, pendingLabels = [], labelBoxes = [], labelOwner = null;
  const typography = window.DimensionTypography;
  typography.loaded.then(() => { if (state.image) render(); });

  // Layout and hit testing use the footprint in original-image coordinates.
  // Text itself is counter-rotated within that footprint for upright reading.
  function measureLabel(label, maxWidth) {
    const measured = typography.measure(context, label, renderUnit, maxWidth);
    return { ...measured, textWidth: measured.width, textHeight: measured.height,
      width: state.rotation % 180 ? measured.height : measured.width,
      height: state.rotation % 180 ? measured.width : measured.height,
      rotation: -state.rotation };
  }

  function queueLabel(label, x, y, styleName = "light", above = false) {
    const maxWidth = Math.max(24 * renderUnit, Math.min(240 * renderUnit, (state.rotation % 180 ? elements.canvas.height : elements.canvas.width) - 12 * renderUnit));
    pendingLabels.push({ id: labelOwner, styleName, above, anchor: { x, y },
      ...measureLabel(label, maxWidth) });
  }

  function paintLabels(forExport) {
    const segments = [];
    for (const item of [...state.annotations, ...(state.draft ? [state.draft] : [])]) {
      if (item.type === 'rect') {
        const points = rectanglePoints(item);
        points.forEach((p, i) => segments.push([p, points[(i + 1) % 4]]));
      } else if (item.type === 'circle') {
        const radius = circleRadius(item);
        const point = angle => ({ x: item.start.x + Math.cos(angle) * radius, y: item.start.y + Math.sin(angle) * radius });
        for (let i = 0; i < 48; i++) segments.push([point(i * Math.PI / 24), point((i + 1) * Math.PI / 24)]);
        segments.push([item.start, item.end]);
      } else if(item.type==='curve') { for(let i=0;i<32;i++)segments.push([curvePoint(item,i/32),curvePoint(item,(i+1)/32)]); }
      else if(item.type!=='note')segments.push([item.start, item.end]);
    }
    labelBoxes = window.DimensionLabelLayout.layout(pendingLabels, segments, elements.canvas.width, elements.canvas.height, renderUnit);
    const scene = typography.scene(context, labelBoxes, renderUnit, visualStyle);
    if (forExport) typography.paintCanvas(context, scene, renderUnit);
    else typography.paintSVG(elements.labelLayer, scene, elements.canvas.width, elements.canvas.height);
  }

  function isHandleHovered(itemId, key) {
    return state.hoverHandle
      && state.hoverHandle.id === itemId
      && state.hoverHandle.key === key;
  }

  function drawHandle(point, ratio, isSelected, isHovered, styleName) {
    const style = visualStyle(styleName);
    context.beginPath();
    context.fillStyle = isHovered ? "#0b0b0b" : style.line;
    context.strokeStyle = isHovered ? "white" : style.underLine;
    context.lineWidth = (isHovered ? 3 : 2.5) * ratio;
    context.arc(point.x, point.y, (isHovered ? 8.5 : isSelected ? 7 : 5.5) * ratio, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }

  function rectanglePoints(item) {
    if (item.points) return item.points;
    const left = Math.min(item.start.x, item.end.x);
    const right = Math.max(item.start.x, item.end.x);
    const top = Math.min(item.start.y, item.end.y);
    const bottom = Math.max(item.start.y, item.end.y);
    return [
      { x: left, y: top }, { x: right, y: top },
      { x: right, y: bottom }, { x: left, y: bottom },
    ];
  }

  function drawEdgeLabel(label, start, end, styleName, labelPosition) {
    if (!label) return;
    queueLabel(label, (start.x + end.x) / 2, (start.y + end.y) / 2, styleName, labelPosition === "above");
  }

  // Quadratic curves trace a photographed fillet; the R value comes from the model,
  // not the control point or perspective-distorted pixels.
  function curveControl(item) {
    return item.control || {x:clamp((item.start.x+item.end.x)/2-(item.end.y-item.start.y)/4,0,elements.canvas.width),y:clamp((item.start.y+item.end.y)/2+(item.end.x-item.start.x)/4,0,elements.canvas.height)};
  }
  function curvePoint(item,t) { const c=curveControl(item),u=1-t;return {x:u*u*item.start.x+2*u*t*c.x+t*t*item.end.x,y:u*u*item.start.y+2*u*t*c.y+t*t*item.end.y}; }
  function drawCurve(item,isDraft) {
    const c=curveControl(item),styleName=itemStyle(item,isDraft),style=visualStyle(styleName);
    context.save();context.beginPath();context.moveTo(item.start.x,item.start.y);context.quadraticCurveTo(c.x,c.y,item.end.x,item.end.y);
    context.strokeStyle=style.underLine;context.lineWidth=3*renderUnit;context.stroke();context.strokeStyle=style.line;context.lineWidth=1.25*renderUnit;context.stroke();context.restore();
    const mid=curvePoint(item,.5);if(item.label||isDraft)queueLabel(isDraft?'调整弯曲控制点':item.label,mid.x,mid.y,styleName,true);
  }
  function drawRectangle(item, isDraft) {
    const isSelected = isDraft;
    const ratio = renderUnit * .55;
    const points = rectanglePoints(item);
    const styleName = itemStyle(item, isDraft);
    const style = visualStyle(styleName);
    const labelPosition = itemLabelPosition(item, isDraft);

    if (labelPosition==='inline' && !isDraft) {
      ['top','right','bottom','left'].forEach((side,i)=>drawLine({...item,type:'line',start:points[i],end:points[(i+1)%4],label:item.labels?.[side]||'', contourEdge:true},false));
      return;
    }
    context.save();
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
    context.strokeStyle = style.underLine;
    context.lineWidth = (style.underLineWidth + (isSelected ? 1.5 : 0)) * ratio;
    context.stroke();
    context.strokeStyle = style.line;
    context.lineWidth = (style.lineWidth + (isSelected ? 1 : 0)) * ratio;
    context.stroke();

    ["nw", "ne", "se", "sw"].forEach((key, index) => {
      drawHandle(points[index], ratio, isSelected, false, styleName);
    });

    const labels = isDraft
      ? { top: "框选区域", right: "", bottom: "", left: "" }
      : item.labels || { top: "", right: "", bottom: "", left: "" };
    [
      { side: "top", start: points[0], end: points[1] },
      { side: "right", start: points[1], end: points[2] },
      { side: "bottom", start: points[2], end: points[3] },
      { side: "left", start: points[3], end: points[0] },
    ].forEach((edge) => {
      drawEdgeLabel(labels[edge.side], edge.start, edge.end, styleName, labelPosition);
    });
    context.restore();
  }

  function drawCircle(item, isDraft) {
    const isSelected = isDraft;
    const ratio = renderUnit * .55;
    const radius = circleRadius(item);
    const styleName = itemStyle(item, isDraft);
    const style = visualStyle(styleName);
    const labelPosition = itemLabelPosition(item, isDraft);

    context.save();
    context.beginPath();
    context.arc(item.start.x, item.start.y, radius, 0, Math.PI * 2);
    context.strokeStyle = style.underLine;
    context.lineWidth = (style.underLineWidth + (isSelected ? 1.5 : 0)) * ratio;
    context.stroke();
    context.strokeStyle = style.line;
    context.lineWidth = (style.lineWidth + (isSelected ? 1 : 0)) * ratio;
    context.stroke();
    drawHandle(item.start, ratio, isSelected, false, styleName);
    drawHandle(item.end, ratio, isSelected, false, styleName);

    const label = isDraft ? "圆形标记" : item.label;
    if (label) {
      const labelY = item.start.y - radius;
      queueLabel(label, item.start.x, labelY, styleName, labelPosition === "above");
    }
    context.restore();
  }

  function drawLine(item, isDraft) {
    const isSelected = isDraft;
    const dx = item.end.x - item.start.x;
    const dy = item.end.y - item.start.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length;
    const ny = dx / length;
    const ratio = renderUnit * .55;
    const cap = 10 * ratio;
    const styleName = itemStyle(item, isDraft);
    const style = visualStyle(styleName);
    const labelPosition = itemLabelPosition(item, isDraft);

    if (labelPosition === 'inline') {
      const label = isDraft ? '拖动标记' : item.label;
      const measured = label ? measureLabel(label, state.rotation % 180 ? elements.canvas.height : elements.canvas.width) : null;
      const x = (item.start.x + item.end.x) / 2, y = (item.start.y + item.end.y) / 2;
      const fits = measured && measured.lines.length === 1 && length >= measured.width + 36 * renderUnit
        && x >= measured.width / 2 && x + measured.width / 2 <= elements.canvas.width
        && y >= measured.height / 2 && y + measured.height / 2 <= elements.canvas.height;
      const ux = dx / length, uy = dy / length;
      const gap = fits ? Math.min(measured.width / Math.max(.001, Math.abs(ux)), measured.height / Math.max(.001, Math.abs(uy))) / 2 : 0;
      context.save(); context.lineCap = 'round'; context.lineJoin = 'round';
      context.beginPath(); context.moveTo(item.start.x, item.start.y);
      if (fits) { context.lineTo(x - ux * gap, y - uy * gap); context.moveTo(x + ux * gap, y + uy * gap); }
      context.lineTo(item.end.x, item.end.y);
      context.strokeStyle = style.underLine; context.lineWidth = 3 * renderUnit; context.stroke();
      context.strokeStyle = style.line; context.lineWidth = 1.25 * renderUnit; context.stroke();
      const arrow = Math.min(6 * renderUnit, length / 4);
      for (const [point, sign] of (item.contourEdge && !label ? [] : [[item.start, 1], [item.end, -1]])) {
        context.beginPath(); context.moveTo(point.x, point.y);
        context.lineTo(point.x + sign * ux * arrow + nx * arrow * .6, point.y + sign * uy * arrow + ny * arrow * .6);
        context.lineTo(point.x + sign * ux * arrow - nx * arrow * .6, point.y + sign * uy * arrow - ny * arrow * .6);
        context.closePath(); context.fillStyle = style.line; context.fill();
      }
      context.restore();
      if (fits) pendingLabels.push({ id: labelOwner, styleName, inline: true, anchor: { x, y }, ...measured });
      else if (label) queueLabel(label, x, y, styleName);
      return;
    }

    context.save();
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(item.start.x, item.start.y);
    context.lineTo(item.end.x, item.end.y);
    context.strokeStyle = style.underLine;
    context.lineWidth = (style.underLineWidth + (isSelected ? 1.5 : 0)) * ratio;
    context.stroke();
    context.beginPath();
    context.moveTo(item.start.x, item.start.y);
    context.lineTo(item.end.x, item.end.y);
    if (styleName === "outline") {
      context.moveTo(item.start.x - nx * cap, item.start.y - ny * cap);
      context.lineTo(item.start.x + nx * cap, item.start.y + ny * cap);
      context.moveTo(item.end.x - nx * cap, item.end.y - ny * cap);
      context.lineTo(item.end.x + nx * cap, item.end.y + ny * cap);
    }
    context.strokeStyle = style.line;
    context.lineWidth = (style.lineWidth + (isSelected ? 1 : 0)) * ratio;
    context.stroke();
    drawHandle(item.start, ratio, isSelected, false, styleName);
    drawHandle(item.end, ratio, isSelected, false, styleName);

    const label = isDraft ? "拖动标记" : item.label;
    if (label) {
      const x = (item.start.x + item.end.x) / 2;
      const y = (item.start.y + item.end.y) / 2;
      queueLabel(label, x, y, styleName, labelPosition === "above");
    }
    context.restore();
  }

  function drawAnnotation(item, isDraft) {
    labelOwner = item.id;
    if (item.type==='note') { queueLabel(isDraft?'说明文字':item.label||'说明',item.start.x,item.start.y,itemStyle(item,isDraft),false); pendingLabels[pendingLabels.length-1].standalone=true; }
    else if (item.type==='curve') drawCurve(item,isDraft);
    else if (item.type === "rect") drawRectangle(item, isDraft);
    else if (item.type === "circle") drawCircle(item, isDraft);
    else drawLine(item, isDraft);
  }

  function scheduleRender() {
    if (renderFrame !== null) return;
    renderFrame = requestAnimationFrame(() => { renderFrame = null; render(); });
  }

  function render(forExport = false) {
    // Commits, cancellation and export stay synchronous and supersede a queued drag frame.
    if (renderFrame !== null) { cancelAnimationFrame(renderFrame); renderFrame = null; }
    if (!state.image) return;
    renderUnit = forExport ? Math.max(1, state.image.naturalWidth / 1200) : 1 / (state.fitScale * state.zoom);
    pendingLabels = [];
    context.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    context.drawImage(state.image, 0, 0, elements.canvas.width, elements.canvas.height);
    elements.labelLayer.style.visibility = state.annotationsVisible ? 'visible' : 'hidden';
    if (!state.annotationsVisible && !forExport) {
      labelBoxes = [];
      elements.labelLayer.replaceChildren();
      renderSelection();
      return;
    }
    state.annotations.forEach((item) => drawAnnotation(item, false));
    if (state.draft) drawAnnotation(state.draft, true);
    paintLabels(forExport);
    renderSelection();
    if (!forExport) updateActionBar();
  }

  // Editing affordances live on a separate canvas and never enter PNG exports.
  function renderSelection() {
    const overlay = elements.selectionCanvas, ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const item = selectedAnnotation();
    if (!state.image || !item || !state.annotationsVisible) return;
    const unit = 1 / (state.fitScale * state.zoom);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#007aff';
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (item.type === 'rect') {
      const points = rectanglePoints(item);
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach(point => ctx.lineTo(point.x, point.y)); ctx.closePath();
    } else if (item.type==='curve') { const c=curveControl(item);ctx.moveTo(item.start.x,item.start.y);ctx.quadraticCurveTo(c.x,c.y,item.end.x,item.end.y); }
    else if(item.type==='note') { ctx.moveTo(item.start.x,item.start.y); }
    else if (item.type === 'circle') ctx.arc(item.start.x, item.start.y, circleRadius(item), 0, Math.PI * 2);
    else { ctx.moveTo(item.start.x, item.start.y); ctx.lineTo(item.end.x, item.end.y); }
    if (['rect','circle'].includes(item.type)) { ctx.fillStyle = accent; ctx.globalAlpha = .09; ctx.fill(); ctx.globalAlpha = 1; }
    ctx.strokeStyle = 'white'; ctx.lineWidth = 6 * unit; ctx.stroke();
    ctx.strokeStyle = accent; ctx.lineWidth = 2.5 * unit; ctx.stroke();
    // Shape, white halo, and explicit status also identify selection without color.
    for (const handle of handlesFor(item)) {
      ctx.beginPath(); ctx.arc(handle.point.x, handle.point.y, (state.editing && isHandleHovered(item.id, handle.key) ? 8 : 6) * unit, 0, Math.PI * 2);
      ctx.fillStyle = 'white'; ctx.fill(); ctx.lineWidth = 2.5 * unit; ctx.stroke();
      if (state.editing) {
        ctx.beginPath(); ctx.arc(handle.point.x, handle.point.y, 2 * unit, 0, Math.PI * 2);
        ctx.fillStyle = accent; ctx.fill();
      }
    }
    // Use actual laid-out bounds, including labels belonging to other shapes.
    for (const box of labelBoxes) ctx.clearRect(box.x - box.width / 2 - unit, box.y - box.height / 2 - unit, box.width + 2 * unit, box.height + 2 * unit);
    ctx.restore();
  }

  function pointFromEvent(event) {
    const rect = elements.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const point = state.rotation === 90 ? { x: y, y: 1 - x }
      : state.rotation === 180 ? { x: 1 - x, y: 1 - y }
      : state.rotation === 270 ? { x: 1 - y, y: x } : { x, y };
    return { x: point.x * elements.canvas.width, y: point.y * elements.canvas.height };
  }

  function handlesFor(item) {
    if(item.type==='note')return [{key:'start',point:item.start,cursor:'move'}];
    if(item.type==='curve')return [{key:'start',point:item.start,cursor:'move'},{key:'control',point:curveControl(item),cursor:'move'},{key:'end',point:item.end,cursor:'move'}];
    if (item.type === "rect") {
      return rectanglePoints(item).map((point, index) => ({
        key: ["nw", "ne", "se", "sw"][index], point, cursor: "move",
      }));
    }
    if (item.type === "circle") {
      return [
        { key: "center", point: item.start, cursor: "move" },
        { key: "radius", point: item.end, cursor: "move" },
      ];
    }
    return [
      { key: "start", point: item.start, cursor: "move" },
      { key: "end", point: item.end, cursor: "move" },
    ];
  }

  const coarsePointer = window.matchMedia("(any-pointer: coarse)");
  function nearestHandle(point) {
    if (!state.annotationsVisible || !state.editing || state.interaction !== 'select') return null;
    const threshold = (coarsePointer.matches ? 22 : 14) / (state.fitScale * state.zoom);
    let winner = null;
    state.annotations.filter(item => item.id === state.selectedId && !item.locked).forEach((item) => {
      handlesFor(item).forEach((handle) => {
        const handleDistance = Math.hypot(point.x - handle.point.x, point.y - handle.point.y);
        if (handleDistance < threshold && (!winner || handleDistance < winner.distance)) {
          winner = { id: item.id, key: handle.key, point: { ...handle.point }, cursor: handle.cursor, distance: handleDistance };
        }
      });
    });
    return winner;
  }

  function distanceToSegment(point, start, end) {
    const vx = end.x - start.x;
    const vy = end.y - start.y;
    const lengthSquared = vx * vx + vy * vy;
    const t = lengthSquared
      ? clamp(((point.x - start.x) * vx + (point.y - start.y) * vy) / lengthSquared, 0, 1)
      : 0;
    const x = start.x + t * vx;
    const y = start.y + t * vy;
    return Math.hypot(point.x - x, point.y - y);
  }

  function nearestAnnotation(point) {
    if (!state.annotationsVisible) return null;
    const label = [...labelBoxes].reverse().find(box => Math.abs(point.x - box.x) <= box.width / 2 && Math.abs(point.y - box.y) <= box.height / 2);
    if (label) return state.annotations.find(item => item.id === label.id) || null;
    const threshold = 18 / (state.fitScale * state.zoom);
    let winner = null;
    state.annotations.forEach((item) => {
      let hitDistance;
      if (item.type === "rect") {
        const points = rectanglePoints(item);
        hitDistance = Math.min(
          distanceToSegment(point, points[0], points[1]),
          distanceToSegment(point, points[1], points[2]),
          distanceToSegment(point, points[2], points[3]),
          distanceToSegment(point, points[3], points[0]),
        );
      } else if(item.type==='note') { hitDistance=Infinity; }
      else if(item.type==='curve') { hitDistance=Math.min(...Array.from({length:32},(_,i)=>distanceToSegment(point,curvePoint(item,i/32),curvePoint(item,(i+1)/32)))); }
      else if (item.type === "circle") {
        hitDistance = Math.abs(Math.hypot(point.x - item.start.x, point.y - item.start.y) - circleRadius(item));
      } else {
        hitDistance = distanceToSegment(point, item.start, item.end);
      }
      if (hitDistance < threshold && (!winner || hitDistance < winner.distance)) {
        winner = { item, distance: hitDistance };
      }
    });
    return winner?.item || null;
  }

  function updateHoveredHandle(point) {
    const next = nearestHandle(point);
    const changed = (!next && state.hoverHandle)
      || (next && (!state.hoverHandle || next.id !== state.hoverHandle.id || next.key !== state.hoverHandle.key));
    state.hoverHandle = next;
    elements.canvas.style.cursor = next ? next.cursor : "crosshair";
    if (changed) {
      if (next) {
        const item = state.annotations.find((annotation) => annotation.id === next.id);
        if (item?.type === "rect") setNotice("角点自由调节 · 按住 Shift 保持标准矩形");
        else if (item?.type === "circle") setNotice(next.key === "center" ? "拖动圆心可整体移动" : "拖动外侧节点调节半径");
        else setNotice("端点自由调节 · 按住 Shift 约束方向");
      }
      render();
    }
  }

  function moveHandle(point, constrainAxis) {
    const drag = state.handleDrag;
    if (!drag) return;
    const item = state.annotations.find((annotation) => annotation.id === drag.id);
    if (!item) return;
    const nextPoint = {
      x: clamp(point.x, 0, elements.canvas.width),
      y: clamp(point.y, 0, elements.canvas.height),
    };

    if(item.type==='note') { item.start=nextPoint;item.end={...nextPoint};return; }
    if(item.type==='curve') { if(!item.control)item.control=curveControl(item);item[drag.key]=nextPoint;return; }
    if (item.type === "circle") {
      if (drag.key === "center") {
        const snapshot = drag.snapshot;
        const rawX = nextPoint.x - drag.origin.x;
        const rawY = nextPoint.y - drag.origin.y;
        const deltaX = clamp(rawX,
          Math.max(-snapshot.start.x, -snapshot.end.x),
          Math.min(elements.canvas.width - snapshot.start.x, elements.canvas.width - snapshot.end.x));
        const deltaY = clamp(rawY,
          Math.max(-snapshot.start.y, -snapshot.end.y),
          Math.min(elements.canvas.height - snapshot.start.y, elements.canvas.height - snapshot.end.y));
        item.start = { x: snapshot.start.x + deltaX, y: snapshot.start.y + deltaY };
        item.end = { x: snapshot.end.x + deltaX, y: snapshot.end.y + deltaY };
      } else {
        item.end = nextPoint;
      }
      return;
    }

    if (item.type === "rect") {
      const keys = ["nw", "ne", "se", "sw"];
      const index = keys.indexOf(drag.key);
      if (!item.points) item.points = rectanglePoints(item).map((corner) => ({ ...corner }));
      if (!constrainAxis) {
        item.points[index] = nextPoint;
        return;
      }
      const oppositeIndex = (index + 2) % 4;
      const opposite = item.points[oppositeIndex];
      if (drag.key === "nw") item.points = [nextPoint, { x: opposite.x, y: nextPoint.y }, opposite, { x: nextPoint.x, y: opposite.y }];
      else if (drag.key === "ne") item.points = [{ x: opposite.x, y: nextPoint.y }, nextPoint, { x: nextPoint.x, y: opposite.y }, opposite];
      else if (drag.key === "se") item.points = [opposite, { x: nextPoint.x, y: opposite.y }, nextPoint, { x: opposite.x, y: nextPoint.y }];
      else item.points = [{ x: nextPoint.x, y: opposite.y }, opposite, { x: opposite.x, y: nextPoint.y }, nextPoint];
      return;
    }

    if (constrainAxis) {
      if (!drag.axis) {
        drag.axis = Math.abs(nextPoint.x - drag.origin.x) >= Math.abs(nextPoint.y - drag.origin.y) ? "x" : "y";
      }
      if (drag.axis === "x") nextPoint.y = drag.origin.y;
      else nextPoint.x = drag.origin.x;
    } else {
      drag.axis = null;
    }
    item[drag.key] = nextPoint;
  }

  function selectAnnotation(id, focusInput) {
    state.annotationsVisible = true;
    state.selectedId = id;
    if (state.editing && id) state.interaction = 'select';
    updateInterface();
    render();
    if (!focusInput || !state.editing) return;
    setInspector(true);
    requestAnimationFrame(() => {
      if (!state.editing) return;
      const selected = selectedAnnotation();
      const input = selected?.type === "rect" ? elements.edgeInputs.top : elements.labelInput;
      input.focus();
      input.select();
    });
  }

  function updateToolInterface() {
    const buttons = {
      line: elements.lineTool,
      rect: elements.rectTool,
      circle: elements.circleTool, curve: elements.curveTool, note: elements.noteTool,
    };
    Object.entries(buttons).forEach(([tool, button]) => {
      const active = state.tool === tool;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function setTool(tool) {
    if (!state.editing) return;
    setInteraction('draw');
    state.tool = tool;
    state.draft = null;
    updateToolInterface();
    updateInterface();
    const notices = {
      line: "尺寸线模式：从起点拖动到终点",
      rect: "矩形模式：拖动框选需要标注的区域",
      circle: "圆形模式：从圆心向外拖动",
      curve: "曲线描边：拖出两端，再选择并调整中间控制点", note: "说明模式：点击放置独立文字，不绘制尺寸线",
    };
    setNotice(notices[tool]);
    render();
  }

  function updateStyleInterface() {
    const selected = selectedAnnotation();
    const activeStyle = selected?.style || state.annotationStyle;
    elements.styleButtons.forEach((button) => {
      const active = button.dataset.style === activeStyle;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function setAnnotationStyle(style) {
    if (!state.editing) return;
    state.annotationStyle = style;
    const selected = selectedAnnotation();
    if (selected && !selected.locked) { selected.style = style; commit(selected); }
    updateStyleInterface();
    render();
    const names = { outline: "黑白线框", light: "白色悬浮", dark: "黑色悬浮" };
    setNotice(`已切换为${names[style]}样式`);
  }

  function updatePositionInterface() {
    const selected = selectedAnnotation();
    const activePosition = selected?.labelPosition || state.labelPosition;
    elements.positionButtons.forEach((button) => {
      button.disabled = !state.editing || !state.annotationsVisible || (button.dataset.labelPosition === 'inline' && !['line','rect'].includes(selected?.type || state.tool));
      const active = button.dataset.labelPosition === activePosition;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function setLabelPosition(position) {
    if (!state.editing) return;
    state.labelPosition = position;
    const selected = selectedAnnotation();
    if (selected && !selected.locked) { selected.labelPosition = position; commit(selected); }
    updatePositionInterface();
    render();
    setNotice(position === "inline" ? "已启用线内箭头：长度不足时自动外置文字" : position === "center" ? "文字自动避让" : "文字优先置于上方");
  }

  function annotationSummary(item) {
    if (item.type === "rect") return Object.values(item.labels || {}).filter(Boolean).join(" · ");
    return item.label;
  }

  function updateInterface() {
    const selected = selectedAnnotation();
    const visibilityButton = document.getElementById('toggleAnnotations');
    visibilityButton.setAttribute('aria-pressed', String(state.annotationsVisible));
    visibilityButton.title = state.annotationsVisible ? '隐藏标注' : '显示标注';
    elements.workspace.dataset.editing = String(state.editing);
    document.body.dataset.editing = String(state.editing);
    elements.toggleEdit.textContent = state.editing ? '完成' : '编辑';
    elements.toggleEdit.setAttribute('aria-label', state.editing ? '完成编辑' : '编辑标注');
    elements.toggleEdit.setAttribute('aria-pressed', String(state.editing));
    elements.canvas.style.cursor = state.editing ? 'crosshair' : 'grab';
    elements.canvas.setAttribute('aria-label', state.editing ? (state.interaction === 'draw' ? '图片标注画布，新建模式，历史标注不响应操作' : '图片标注画布，选择模式，仅选中端点可调整') : '图片标注画布，浏览模式，拖动平移，双指缩放');
    document.getElementById('interactionState').textContent = state.editing ? (state.interaction === 'draw' ? '绘制新标注 · 已有标注已锁定' : '选择标注 · 仅选中端点可调整') : '浏览模式 · 拖动平移';
    if (!state.annotationsVisible) document.getElementById('interactionState').textContent = '标注已隐藏 · 查看原图';
    const selectionStatus = document.getElementById('selectionStatus');
    selectionStatus.hidden = !selected || !state.annotationsVisible;
    selectionStatus.textContent = selected ? `已选中 · ${state.annotations.indexOf(selected) + 1} 号标注` : '';
    for (const button of [elements.lineTool, elements.rectTool, elements.circleTool, elements.curveTool, elements.noteTool, ...elements.styleButtons, ...elements.positionButtons, ...elements.quickLabels.querySelectorAll('button')]) button.disabled = !state.editing || !state.annotationsVisible;
    document.getElementById('selectionType').textContent = selected ? ({ line: '尺寸线', rect: '描边框', circle: '圆形', curve: '曲线描边', note: '独立说明' }[selected.type] || '标注') : '未选中';
    const isRectangle = selected?.type === "rect";
    elements.exportImage.disabled = !state.image || state.annotations.length === 0;
    elements.copyImage.disabled = !state.image;
    elements.lineLabelFields.hidden = Boolean(isRectangle);
    elements.rectLabelFields.hidden = !isRectangle;
    elements.labelInput.disabled = !state.editing || !state.annotationsVisible || !selected || selected.locked || isRectangle;
    elements.labelInput.value = selected && !isRectangle ? selected.label || "" : "";
    Object.entries(elements.edgeInputs).forEach(([side, input]) => {
      input.disabled = !state.editing || !state.annotationsVisible || !isRectangle || selected?.locked;
      input.value = isRectangle ? selected.labels?.[side] || "" : "";
    });
    elements.editorTip.textContent = !selected ? "先在画布上拖出一条标注，再填写尺寸。" : isRectangle
      ? "四个角点可独立调节；按住 Shift 拖动可保持标准矩形。"
      : selected?.type === "curve" ? "拖动两端和中间控制点，让曲线贴合轮廓；半径文字按模型填写。"
      : selected?.type === "note" ? "拖动定位点移动说明；说明不会绘制尺寸线。"
      : selected?.type === "circle"
        ? "拖动圆心可整体移动；拖动外侧节点可调节半径。"
        : "尺寸线端点可自由调节；按住 Shift 可约束水平或垂直方向。";
    elements.measureCount.textContent = String(state.annotations.length);
    document.getElementById('inspectorCount').textContent = String(state.annotations.length);
    elements.listEmpty.hidden = state.annotations.length > 0;
    elements.listItems.innerHTML = "";
    updateStyleInterface();
    updatePositionInterface();
    updateActionBar();

    state.annotations.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "list-row";
      const selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.className = "list-select";
      if (item.id === state.selectedId) selectButton.classList.add("selected");
      selectButton.setAttribute("aria-pressed", String(item.id === state.selectedId));
      selectButton.innerHTML = `<span class="measure-index">${String(index + 1).padStart(2, "0")}</span><strong></strong>`;
      const summary = annotationSummary(item);
      const label = selectButton.querySelector("strong");
      label.textContent = summary || (item.type === "circle" ? "未填写圆形标注" : "未填写标注");
      label.classList.toggle("is-placeholder", !summary);
      const author = document.createElement("small");
      author.className = "annotation-author";
      author.textContent = window.DimensionModel.attribution(item);
      selectButton.append(author);
      selectButton.addEventListener("click", () => selectAnnotation(item.id, true));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.hidden = !state.editing || !state.annotationsVisible;
      deleteButton.disabled = Boolean(item.locked);
      deleteButton.className = "row-delete";
      deleteButton.title = "删除这条标注";
      deleteButton.setAttribute("aria-label", `删除标注：${summary || `第 ${index + 1} 条`}`);
      deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6.5 7l1 13h9l1-13"></path><path d="M10 11v5M14 11v5"></path></svg>';
      const deleteLabel = document.createElement('span');
      deleteLabel.textContent = '删除';
      deleteButton.append(deleteLabel);
      deleteButton.addEventListener("click", () => removeAnnotation(item));
      row.append(selectButton, deleteButton);
      elements.listItems.appendChild(row);
    });
  }

  function beginDrawing(event) {
    if (!state.annotationsVisible) return;
    const point = pointFromEvent(event);
    const handle = state.interaction === 'select' ? nearestHandle(point) : null;
    if (handle) {
      const item = state.annotations.find((annotation) => annotation.id === handle.id);

      state.handleDrag = {
        id: handle.id,
        key: handle.key,
        origin: { ...handle.point },
        axis: null,
        snapshot: item ? {
          start: { ...item.start },
          end: { ...item.end },
          points: item.points?.map((corner) => ({ ...corner })) || null,
          control: item.control ? {...item.control} : null,
        } : null,
      };
      state.hoverHandle = handle;
      state.selectedId = handle.id;
      updateInterface();
      render();
      return;
    }

    const hit = state.interaction === 'select' ? nearestAnnotation(point) : null;
    if (hit) {
      selectAnnotation(hit.id, false);
      setNotice("已选中标注，可修改文字或节点");
      return;
    }


    if (state.interaction === 'select') { selectAnnotation(null, false); return; }
    state.selectedId = null;
    state.draft = { id: -1, type: state.tool, start: point, end: point };
    updateInterface();
    render();
  }

  function finishDrawing(event) {
    if (!state.draft) return;
    state.draft.end = pointFromEvent(event);
    const minimum = 5 / (state.fitScale * state.zoom);
    const tooSmall = state.draft.type === "rect"
      ? Math.abs(state.draft.end.x - state.draft.start.x) < minimum
        || Math.abs(state.draft.end.y - state.draft.start.y) < minimum
      : lineLength(state.draft) < minimum;
    if (tooSmall && state.draft.type!=='note') {
      state.draft = null;
      if (deferredAnnotations) applyAnnotations(deferredAnnotations);
      render();
      return;
    }

    const annotation = {
      ...state.draft,
      id: crypto.randomUUID(),
      label: "",
      style: state.annotationStyle,
      labelPosition: state.labelPosition,
    };
    if(annotation.type==='curve')annotation.control=curveControl(annotation);
    if(annotation.type==='note')annotation.end={...annotation.start};
    if (annotation.type === "rect") {
      annotation.start = {
        x: Math.min(state.draft.start.x, state.draft.end.x),
        y: Math.min(state.draft.start.y, state.draft.end.y),
      };
      annotation.end = {
        x: Math.max(state.draft.start.x, state.draft.end.x),
        y: Math.max(state.draft.start.y, state.draft.end.y),
      };
      annotation.points = rectanglePoints(annotation).map((point) => ({ ...point }));
      annotation.labels = { top: "", right: "", bottom: "", left: "" };
    }
    const original = state.annotations.find(item => item.id === state.redrawId);
    if (state.redrawId && !original) {
      state.redrawId = null; state.draft = null;
      if (deferredAnnotations) applyAnnotations(deferredAnnotations);
      updateInterface(); render(); setNotice('原标注已改变，请重新选择'); return;
    }
    if (original) {
      Object.assign(annotation, { ...original, start: annotation.start, end: annotation.end, points: annotation.points, control: annotation.control });
      state.annotations = state.annotations.map(item => item.id === original.id ? annotation : item);
    } else state.annotations.push(annotation);
    state.redrawId = null; state.draft = null;
    commit(annotation);
    const notices = {
      line: "尺寸线已添加，请填写标注文字",
      rect: "矩形已添加，可填写四边文字",
      circle: "圆形已添加，请填写标注文字",
      curve: "曲线已添加，可调整控制点并填写半径", note: "说明已添加，请填写文字",
    };
    setNotice(notices[annotation.type]);
    selectAnnotation(annotation.id, false);
    setNotice("标注已添加 · 就地填写、重画或删除；继续标注可画下一条");
  }

  const pointers = new Map();
  let gesture = null, gestureFrame = null, singlePointer = null, suppressDrawing = false;

  function cancelDrawing() {
    const drag = state.handleDrag;
    if (drag?.snapshot) Object.assign(state.annotations.find(item => item.id === drag.id) || {}, drag.snapshot);
    state.draft = null; state.handleDrag = null; state.hoverHandle = null;
    if (deferredAnnotations) applyAnnotations(deferredAnnotations);
    render();
  }

  function gesturePoints() {
    const points = [...pointers.values()].slice(0, 2);
    const [a, b] = points;
    return { x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) };
  }

  function startGesture() {
    cancelAnimationFrame(gestureFrame); gestureFrame = null;
    cancelDrawing(); singlePointer = null; suppressDrawing = true;
    if (pointers.size !== 2) { gesture = null; return; }
    const mid = gesturePoints(), box = elements.canvas.getBoundingClientRect();
    gesture = { ...mid, zoom: state.zoom,
      anchor: { x: (mid.x - box.left) / box.width, y: (mid.y - box.top) / box.height } };
    setNotice('双指可同时缩放和拖动画布');
  }

  function applyGesture() {
    cancelAnimationFrame(gestureFrame); gestureFrame = null;
    if (!gesture || pointers.size !== 2) return;
    const mid = gesturePoints();
    // Track the midpoint and scale together so the same image point stays under
    // both fingers. Rebase each frame for immediate reversal at the zoom limits.
    const zoom = clamp(gesture.zoom * mid.distance / gesture.distance, .5, maximumZoom());
    setZoom(zoom, mid.x, mid.y, gesture.anchor);
    Object.assign(gesture, mid, { zoom: state.zoom });
  }

  function pointerDown(event) {
    if (!state.image || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.target.closest?.('button, input, [data-canvas-control]')) return;
    event.preventDefault();
    if (gestureFrame !== null) applyGesture();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!event.nativeTouch) elements.viewport.setPointerCapture(event.pointerId);
    if (pointers.size >= 2) { startGesture(); return; }
    if (suppressDrawing) return;
    const drawing = state.editing && !spaceHeld && state.annotationsVisible && event.target === elements.canvas;
    singlePointer = { id: event.pointerId, touch: event.pointerType === 'touch', x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false, drawing };
    if (drawing) beginDrawing(event);
  }

  function pointerMove(event) {
    if (!state.image) return;
    if (!pointers.has(event.pointerId)) {
      if (state.editing && event.target === elements.canvas && !pointers.size) updateHoveredHandle(pointFromEvent(event));
      return;
    }
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture && pointers.size === 2) {
      // Process all fingers together, avoiding transient scale changes while
      // the browser dispatches individual pointer events for one touch frame.
      if (gestureFrame === null) gestureFrame = requestAnimationFrame(applyGesture);
      return;
    }
    if (suppressDrawing || singlePointer?.id !== event.pointerId) return;
    const p = singlePointer;
    if (Math.hypot(event.clientX - p.x, event.clientY - p.y) > 6) {
      p.moved = true;
    }
    if (!p.drawing) {
      if (!p.touch) {
        panCanvas(event.clientX - p.lastX, event.clientY - p.lastY);
        elements.canvas.style.cursor = 'grabbing';
      }
      p.lastX = event.clientX; p.lastY = event.clientY;
    } else if (state.handleDrag) { moveHandle(pointFromEvent(event), event.shiftKey); scheduleRender(); }
    else if (state.draft) { state.draft.end = pointFromEvent(event); scheduleRender(); }
  }

  function finishPointer(event, cancelled = false) {
    if (!pointers.has(event.pointerId)) return;
    elements.canvas.style.cursor = state.editing ? 'crosshair' : 'grab';
    if (!cancelled && gestureFrame !== null) applyGesture();
    cancelAnimationFrame(gestureFrame); gestureFrame = null;
    pointers.delete(event.pointerId);
    if (cancelled) { cancelDrawing(); suppressDrawing = true; }
    if (gesture || suppressDrawing) {
      if (pointers.size >= 2) startGesture(); else gesture = null;
      if (!pointers.size) { suppressDrawing = false; singlePointer = null; }
      return;
    }
    if (singlePointer?.id !== event.pointerId) return;
    const p = singlePointer; singlePointer = null;
    if (!p.drawing) {
      if (!p.moved && state.editing && state.interaction === 'select' && !spaceHeld) {
        const point = pointFromEvent(event), hit = nearestAnnotation(point), handle = nearestHandle(point);
        selectAnnotation(hit?.id || handle?.id || null, false);
        setNotice(hit || handle ? '已选中标注 · 点击编辑标注可修改' : '浏览模式 · 双指缩放与拖动');
      }
    } else if (state.handleDrag) {
      const changed = state.annotations.find(item => item.id === state.handleDrag.id);
      const moved = JSON.stringify(state.handleDrag.snapshot) !== JSON.stringify({ start: changed.start, end: changed.end, points: changed.points || null, control: changed.control || null });
      state.handleDrag = null;
      if (moved) commit(changed);
      if (deferredAnnotations) applyAnnotations(deferredAnnotations);
      updateInterface(); render();
      setNotice(moved ? '节点位置已调整' : '已选中标注，可修改文字或节点');
    } else finishDrawing(event);
  }
  elements.viewport.addEventListener('contextmenu', event => {
    if (!state.image || !state.editing || state.interaction !== 'select') return;
    event.preventDefault();
    const hit = nearestAnnotation(pointFromEvent(event));
    if (hit) { selectAnnotation(hit.id, false); document.getElementById('deleteSelected').focus({ preventScroll: true }); }
  });
  // Touch Events retain their original target even when fingers leave the
  // canvas and provide a coherent snapshot of both fingers on iOS and Android.
  // Mouse/pen keep Pointer Events; never process a touch through both paths.
  const touchId = touch => `touch:${touch.identifier}`;
  const touchEvent = (touch, event) => ({ pointerId: touchId(touch), pointerType: 'touch',
    nativeTouch: true, clientX: touch.clientX, clientY: touch.clientY, target: touch.target,
    shiftKey: event.shiftKey, preventDefault: () => event.preventDefault() });
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    elements.viewport.addEventListener(type, event => {
      if (!state.image || event.target.closest?.('button, input, [data-canvas-control]')) return;
      event.preventDefault();
      // Synchronize all tracked contacts before processing any changed contact.
      for (const touch of Array.from(event.touches)) if (pointers.has(touchId(touch))) {
        pointers.set(touchId(touch), { x: touch.clientX, y: touch.clientY });
      }
      for (const touch of Array.from(event.changedTouches)) {
        const pointer = touchEvent(touch, event);
        if (type === 'touchstart') pointerDown(pointer);
        else if (type === 'touchmove') pointerMove(pointer);
        else finishPointer(pointer, type === 'touchcancel');
      }
    }, { passive: false });
  }
  elements.viewport.addEventListener('pointerdown', event => { if (event.pointerType !== 'touch') pointerDown(event); });
  elements.viewport.addEventListener('pointermove', event => { if (event.pointerType !== 'touch') pointerMove(event); });
  elements.viewport.addEventListener('pointerup', event => { if (event.pointerType !== 'touch') finishPointer(event); });
  elements.viewport.addEventListener('pointercancel', event => { if (event.pointerType !== 'touch') finishPointer(event, true); });
  elements.viewport.addEventListener('lostpointercapture', event => { if (event.pointerType !== 'touch') finishPointer(event, true); });
  elements.viewport.addEventListener('pointerleave', () => {
    if (pointers.size) return;
    state.hoverHandle = null;
    elements.canvas.style.cursor = state.editing ? 'crosshair' : 'grab'; render();
  });
  document.getElementById('toggleAnnotations').addEventListener('click', () => {
    cancelDrawing();
    if (pointers.size) suppressDrawing = true;
    state.annotationsVisible = !state.annotationsVisible;
    state.hoverHandle = null;
    updateInterface(); render();
    setNotice(state.annotationsVisible ? '已显示全部标注' : '已隐藏标注，仅查看原图；导出仍包含标注');
  });
  elements.toggleEdit.addEventListener('click', () => {
    cancelDrawing();
    if (pointers.size) suppressDrawing = true;
    state.editing = !state.editing;
    if (state.editing) { state.annotationsVisible = true; state.interaction = 'draw'; state.selectedId = null; }
    state.redrawId = null; state.selectedId = null;
    setInspector(state.editing && !window.matchMedia('(max-width: 640px)').matches);
    updateInterface(); render();
    setNotice(state.editing ? '绘制新标注 · 历史标注已锁定；需要修改请切换选择 / 调整' : '已退出编辑，双指可同时缩放和拖动画布');
  });

  elements.lineTool.addEventListener("click", () => setTool("line"));
  elements.rectTool.addEventListener("click", () => setTool("rect"));
  elements.circleTool.addEventListener("click", () => setTool("circle"));
  elements.curveTool.addEventListener("click", () => setTool("curve"));
  elements.noteTool.addEventListener("click", () => setTool("note"));

  elements.styleButtons.forEach((button) => {
    button.addEventListener("click", () => setAnnotationStyle(button.dataset.style));
  });
  elements.positionButtons.forEach((button) => {
    button.addEventListener("click", () => setLabelPosition(button.dataset.labelPosition));
  });

  elements.labelInput.addEventListener("input", () => {
    const selected = selectedAnnotation();
    if (!state.editing || !selected || selected.locked || selected.type === "rect") return;
    const caret = [elements.labelInput.selectionStart, elements.labelInput.selectionEnd];
    selected.label = elements.labelInput.value;
    commit(selected);
    updateInterface();
    elements.labelInput.focus();
    elements.labelInput.setSelectionRange(...caret);
    render();
  });

  Object.entries(elements.edgeInputs).forEach(([side, input]) => {
    input.addEventListener("input", () => {
      const selected = selectedAnnotation();
      if (!state.editing || !selected || selected.locked || selected.type !== "rect") return;
      const caret = [input.selectionStart, input.selectionEnd];
      selected.labels[side] = input.value;
      commit(selected);
      updateInterface();
      input.focus();
      input.setSelectionRange(...caret);
      render();
    });
  });

  elements.quickLabels.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-prefix]");
    const selected = selectedAnnotation();
    if (!state.editing || !button || !selected || selected.locked || selected.type === "rect") return;
    selected.label = `${button.dataset.prefix}${selected.label.replace(/^(宽|高|深|直径 Ø)\s*/, "")}`;
    commit(selected);
    updateInterface();
    render();
    elements.labelInput.focus();
    elements.labelInput.setSelectionRange(selected.label.length, selected.label.length);
  });

  function undoLast(redo = false) {
    if (!state.editing) return;
    cancelDrawing(); state.redrawId = null;
    const source = redo ? redoStack : undoStack, target = redo ? undoStack : redoStack;
    const action = source.at(-1);
    if (!action) return;
    const expected = redo ? action.before : action.after;
    const id = action.after.id, current = committed.get(id);
    const visible = state.annotations.find(item => item.id === id);
    if ((expected ? content(current) !== content(expected) : !current?.deleted) || (!current?.deleted && !visible)) {
      setNotice('这条标注已被更新，不能覆盖团队修改'); return;
    }
    const restore = redo ? action.after : action.before;
    const value = { ...(restore || current), version: current?.version, deleted: !restore || Boolean(restore.deleted) };
    source.pop(); replaying = true;
    try { commit(value, value.deleted); } finally { replaying = false; }
    state.annotations = state.annotations.filter(item => item.id !== id);
    if (!value.deleted) state.annotations.push(structuredClone(committed.get(id)));
    target.push(action);
    state.selectedId = value.deleted ? null : id; state.interaction = 'select';
    updateInterface(); render(); setNotice(redo ? '已重做' : '已撤销');
  }

  document.getElementById('drawMode').addEventListener('click', () => setInteraction('draw'));
  document.getElementById('selectMode').addEventListener('click', () => setInteraction('select'));
  document.getElementById('continueDrawing').addEventListener('click', () => setInteraction('draw'));
  document.getElementById('editSelected').addEventListener('click', () => selectAnnotation(state.selectedId, true));
  document.getElementById('redrawSelected').addEventListener('click', redrawSelected);
  document.getElementById('deleteSelected').addEventListener('click', () => removeAnnotation());
  document.getElementById('lockSelected').addEventListener('click', () => {
    const item = selectedAnnotation(); if (!item || !state.editing) return;
    item.locked = !item.locked; commit(item); updateInterface(); render();
    setNotice(item.locked ? '标注已锁定，解锁后可修改' : '标注已解锁');
  });
  document.getElementById('duplicateSelected').addEventListener('click', () => {
    const item = selectedAnnotation(); if (!item || !state.editing) return;
    const copy = structuredClone(item);
    copy.id = crypto.randomUUID(); copy.locked = false;
    for (const key of ['version','createdBy','createdAt','updatedBy','updatedAt']) delete copy[key];
    const points = [copy.start, copy.end, ...(copy.points || []), ...(copy.control ? [copy.control] : [])];
    const dx = Math.min(20, elements.canvas.width - Math.max(...points.map(p => p.x)));
    const dy = Math.min(20, elements.canvas.height - Math.max(...points.map(p => p.y)));
    for (const point of points) { point.x += dx; point.y += dy; }
    state.annotations.push(copy); commit(copy); selectAnnotation(copy.id, false); setNotice('已复制标注，可调整端点');
  });
  document.getElementById('undoAction').addEventListener('click', () => undoLast());
  document.getElementById('undoDelete').addEventListener('click', () => undoLast());
  document.getElementById('redoAction').addEventListener('click', () => undoLast(true));

  elements.viewport.addEventListener("wheel", (event) => {
    if (!state.image) return;
    event.preventDefault();
    if (event.ctrlKey) {
      // Trackpad pinch is delivered as Ctrl+wheel; ordinary two-finger scrolling
      // must move the canvas instead of being interpreted as another zoom.
      const factor = clamp(Math.exp(-event.deltaY * .01), .75, 1.25);
      setZoom(state.zoom * factor, event.clientX, event.clientY);
    } else {
      const unitX = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? elements.viewport.clientWidth : 1;
      const unitY = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? elements.viewport.clientHeight : 1;
      if (event.shiftKey) {
        // Some browsers already remap Shift+wheel to deltaX. Use one axis only.
        const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        panCanvas(-horizontal * unitX, 0);
      } else panCanvas(-event.deltaX * unitX, -event.deltaY * unitY);
    }
  }, { passive: false });

  window.addEventListener("keydown", event => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable;
    if (typing || !state.editing || document.querySelector('dialog[open]')) return;
    if (event.code === 'Space') { spaceHeld = true; event.preventDefault(); }
    else if (event.key === 'Escape') {
      event.preventDefault(); cancelDrawing(); state.redrawId = null; state.selectedId = null;
      if (pointers.size) suppressDrawing = true;
      updateInterface(); render(); setNotice('已取消当前操作');
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault(); undoLast(event.shiftKey);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault(); removeAnnotation();
    }
  });
  window.addEventListener('keyup', event => { if (event.code === 'Space') spaceHeld = false; });
  window.addEventListener('blur', () => { spaceHeld = false; cancelDrawing(); });

  // Rotate a snapshot so download and clipboard match the displayed orientation.
  function exportCanvas() {
    const source = elements.canvas;
    if (!state.rotation) return source;
    const output = document.createElement('canvas');
    output.width = state.rotation % 180 ? source.height : source.width;
    output.height = state.rotation % 180 ? source.width : source.height;
    const ctx = output.getContext('2d');
    ctx.translate(output.width / 2, output.height / 2);
    ctx.rotate(state.rotation * Math.PI / 180);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
    return output;
  }

  let exporting = false;
  elements.exportImage.addEventListener("click", async () => {
    if (!state.image || exporting) return;
    if (state.draft || state.handleDrag) { setNotice("请先结束当前标注操作再导出"); return; }
    const link = document.createElement("a");
    const fileName = `${state.fileName.replace(/\.[^.]+$/, "")}-尺寸标注`;
    const selection = state.selectedId;
    state.selectedId = null;
    render(true);
    exporting = true;
    try {
      setNotice("正在压缩标注图…");
      let pending;
      try { pending = window.DimensionImages.exportCanvas(exportCanvas()); }
      finally { state.selectedId = selection; render(); }
      const result = await pending;
      const url = URL.createObjectURL(result.blob);
      link.download = `${fileName}.${result.extension}`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice(`标注图已导出 · ${window.DimensionImages.formatBytes(result.blob.size)}`);
    } catch (error) {
      setNotice(error.message || "导出失败，请重试");
    } finally {
      exporting = false;
      render();
    }
  });

  elements.copyImage.addEventListener("click", async () => {
    if (!state.image || exporting) return;
    if (state.draft || state.handleDrag) { setNotice("请先结束当前标注操作再复制"); return; }
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      setNotice("当前浏览器不支持复制图片，请使用导出图片");
      return;
    }
    exporting = true;
    const selection = state.selectedId;
    state.selectedId = null;
    try {
      render(true);
      // Start the clipboard write during the click gesture, including on Safari.
      const image = new Promise((resolve, reject) => {
        exportCanvas().toBlob(blob => blob ? resolve(blob) : reject(new Error("图片生成失败，请重试")), "image/png");
      });
      const pending = navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
      state.selectedId = selection;
      render();
      await pending;
      setNotice("图片已复制，可直接粘贴使用");
    } catch (error) {
      setNotice(error.name === "NotAllowedError" ? "无法访问剪贴板，请允许剪贴板权限后重试" : (error.message || "复制失败，请重试"));
    } finally {
      state.selectedId = selection;
      exporting = false;
      render();
    }
  });

  [elements.uploadButton, elements.replaceImage, elements.panelReplace].forEach((button) => {
    button.addEventListener("click", openFilePicker);
  });
  elements.fileInput.addEventListener("change", () => loadFile(elements.fileInput.files[0]));

  elements.viewport.addEventListener("dragenter", (event) => {
    event.preventDefault();
    elements.viewport.classList.add("is-dragging");
    elements.dropMask.hidden = false;
  });
  elements.viewport.addEventListener("dragover", (event) => event.preventDefault());
  elements.viewport.addEventListener("dragleave", (event) => {
    if (event.currentTarget === event.target) {
      elements.viewport.classList.remove("is-dragging");
      elements.dropMask.hidden = true;
    }
  });
  elements.viewport.addEventListener("drop", (event) => {
    event.preventDefault();
    elements.viewport.classList.remove("is-dragging");
    elements.dropMask.hidden = true;
    loadFile(event.dataTransfer.files[0]);
  });

  for (const [id, factor] of [['zoomOut', .8], ['zoomIn', 1.25]]) {
    document.getElementById(id).addEventListener('click', () => {
      const box = elements.viewport.getBoundingClientRect();
      setZoom(state.zoom * factor, box.x + box.width / 2, box.y + box.height / 2);
    });
  }
  document.getElementById('rotateImage').addEventListener('click', () => {
    if (!state.image) return;
    if (state.draft || state.handleDrag || pointers.size) {
      setNotice('请先结束当前操作再旋转图片'); return;
    }
    state.rotation = (state.rotation + 90) % 360;
    state.zoom = 1; state.panX = 0; state.panY = 0;
    updateFit();
    elements.viewport.scrollTo(0, 0);
    setNotice(`图片已顺时针旋转至 ${state.rotation}°`);
  });
  document.getElementById('fitCanvas').addEventListener('click', () => {
    state.zoom = 1; state.panX = 0; state.panY = 0; elements.canvasStage.style.transform = '';
    updateFit(); elements.viewport.scrollTo(0, 0); setNotice('图片已适合窗口');
  });
  const resizeObserver = new ResizeObserver(() => updateFit(true));
  resizeObserver.observe(elements.viewport);
  const themeObserver = new MutationObserver(renderSelection);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('pagehide', () => themeObserver.disconnect(), { once: true });
  window.addEventListener('pagehide', () => { resizeObserver.disconnect(); cancelAnimationFrame(gestureFrame); }, { once: true });
  window.addEventListener("resize", updateFit);
  window.addEventListener("beforeunload", () => {
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  });
})();
