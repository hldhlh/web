(() => {
  "use strict";

  const elements = {
    workspace: document.querySelector("#workspace"),
    viewport: document.querySelector("#viewport"),
    emptyState: document.querySelector("#emptyState"),
    canvasStage: document.querySelector("#canvasStage"),
    canvas: document.querySelector("#measureCanvas"),
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
    lineTool: document.querySelector("#lineTool"),
    rectTool: document.querySelector("#rectTool"),
    circleTool: document.querySelector("#circleTool"),
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
    zoom: 1,
    fitScale: 1,
  };

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function selectedAnnotation() {
    return state.annotations.find((item) => item.id === state.selectedId) || null;
  }

  function setNotice(message) {
    elements.notice.textContent = message;
  }

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
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("图片无法读取")); };
      image.src = objectUrl;
    });
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    Object.assign(state, { image, objectUrl, fileName: name, annotations: [], draft: null,
      handleDrag: null, hoverHandle: null, selectedId: null, zoom: 1 });
    elements.canvas.width = image.naturalWidth;
    elements.canvas.height = image.naturalHeight;
    elements.workspace.classList.add("has-image");
    elements.emptyState.hidden = true;
    elements.canvasStage.hidden = false;
    elements.canvasHint.hidden = false;
    elements.sidePanel.hidden = false;
    elements.steps.hidden = true;
    elements.replaceText.textContent = "新建标注";
    elements.imageSize.textContent = name;
    updateFit(); updateInterface(); render();
  }

  function commit(item, deleted = false) {
    if (!item) return;
    window.DimensionCollab?.edit(item, deleted);
  }

  let deferredAnnotations = null;
  function applyAnnotations(items) {
    if (state.draft || state.handleDrag) { deferredAnnotations = items; return; }
    deferredAnnotations = null;
    state.annotations = structuredClone(items);
    if (!selectedAnnotation()) state.selectedId = null;
    const input = document.activeElement;
    const selection = input?.tagName === 'INPUT' ? [input.selectionStart, input.selectionEnd] : null;
    updateInterface(); render();
    if (selection && !input.disabled) input.setSelectionRange(...selection);
  }

  window.DimensionEditor = { openImage, applyAnnotations, notice: setNotice,
    busy: () => Boolean(state.draft || state.handleDrag) };

  function updateFit() {
    if (!state.image) return;
    const availableWidth = Math.max(200, elements.viewport.clientWidth - 36);
    const availableHeight = Math.max(220, elements.viewport.clientHeight - 36);
    state.fitScale = Math.min(
      availableWidth / state.image.naturalWidth,
      availableHeight / state.image.naturalHeight,
      1,
    );
    updateCanvasDisplaySize();
  }

  function updateCanvasDisplaySize() {
    if (!state.image) return;
    const width = state.image.naturalWidth * state.fitScale * state.zoom;
    const height = state.image.naturalHeight * state.fitScale * state.zoom;
    elements.canvas.style.width = `${width}px`;
    elements.canvas.style.height = `${height}px`;
    elements.canvasStage.style.width = `${width}px`;
    elements.canvasStage.style.height = `${height}px`;
  }

  function setZoom(nextZoom, clientX, clientY) {
    if (!state.image) return;
    const previousRect = elements.canvas.getBoundingClientRect();
    const anchorX = previousRect.width ? (clientX - previousRect.left) / previousRect.width : .5;
    const anchorY = previousRect.height ? (clientY - previousRect.top) / previousRect.height : .5;
    const clampedZoom = clamp(nextZoom, .5, 4);
    if (Math.abs(clampedZoom - state.zoom) < .001) return;

    state.zoom = clampedZoom;
    updateCanvasDisplaySize();
    const nextRect = elements.canvas.getBoundingClientRect();
    const nextAnchorX = nextRect.left + anchorX * nextRect.width;
    const nextAnchorY = nextRect.top + anchorY * nextRect.height;
    elements.viewport.scrollLeft += nextAnchorX - clientX;
    elements.viewport.scrollTop += nextAnchorY - clientY;
    setNotice(`图片缩放 ${Math.round(state.zoom * 100)}%`);
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function visualStyle(name) {
    const styles = {
      outline: {
        line: "#0b0b0b", underLine: "rgba(255,255,255,.96)", lineWidth: 2.8, underLineWidth: 7,
        labelBackground: "rgba(255,255,255,.96)", labelText: "#0b0b0b", labelBorder: "#0b0b0b",
        labelBorderWidth: 1.5, labelRadius: 9, shadow: "transparent",
      },
      light: {
        line: "#ffffff", underLine: "rgba(0,0,0,.28)", lineWidth: 4, underLineWidth: 6.5,
        labelBackground: "#ffffff", labelText: "#0b0b0b", labelBorder: "rgba(0,0,0,.08)",
        labelBorderWidth: 1, labelRadius: 99, shadow: "rgba(0,0,0,.24)",
      },
      dark: {
        line: "#0b0b0b", underLine: "rgba(255,255,255,.82)", lineWidth: 4, underLineWidth: 6.5,
        labelBackground: "#0b0b0b", labelText: "#ffffff", labelBorder: "rgba(255,255,255,.28)",
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

  function drawLabel(label, x, y, ratio, angle = 0, styleName = "light") {
    const style = visualStyle(styleName);
    const fontSize = 18 * ratio;
    context.font = `700 ${fontSize}px Arial, sans-serif`;
    const boxWidth = context.measureText(label).width + 24 * ratio;
    const boxHeight = 36 * ratio;

    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.shadowColor = style.shadow;
    context.shadowBlur = styleName === "outline" ? 0 : 8 * ratio;
    context.shadowOffsetY = styleName === "outline" ? 0 : 2 * ratio;
    context.fillStyle = style.labelBackground;
    context.strokeStyle = style.labelBorder;
    context.lineWidth = style.labelBorderWidth * ratio;
    roundedRect(context, -boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight, style.labelRadius * ratio);
    context.fill();
    if (style.labelBorderWidth) context.stroke();
    context.shadowColor = "transparent";
    context.fillStyle = style.labelText;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, 0, .5 * ratio);
    context.restore();
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

  function drawEdgeLabel(label, start, end, ratio, styleName, labelPosition) {
    if (!label) return;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const offset = labelPosition === "center" ? 0 : 18 * ratio;
    const x = (start.x + end.x) / 2 + (dy / length) * offset;
    const y = (start.y + end.y) / 2 - (dx / length) * offset;
    let angle = Math.atan2(dy, dx);
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;
    drawLabel(label, x, y, ratio, angle, styleName);
  }

  function drawRectangle(item, isDraft) {
    const isSelected = item.id === state.selectedId || isDraft;
    const ratio = Math.max(1, state.image.naturalWidth / 1200);
    const points = rectanglePoints(item);
    const styleName = itemStyle(item, isDraft);
    const style = visualStyle(styleName);
    const labelPosition = itemLabelPosition(item, isDraft);

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
      drawHandle(points[index], ratio, isSelected, isHandleHovered(item.id, key), styleName);
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
      drawEdgeLabel(labels[edge.side], edge.start, edge.end, ratio, styleName, labelPosition);
    });
    context.restore();
  }

  function drawCircle(item, isDraft) {
    const isSelected = item.id === state.selectedId || isDraft;
    const ratio = Math.max(1, state.image.naturalWidth / 1200);
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
    drawHandle(item.start, ratio, isSelected, isHandleHovered(item.id, "center"), styleName);
    drawHandle(item.end, ratio, isSelected, isHandleHovered(item.id, "radius"), styleName);

    const label = isDraft ? "圆形标记" : item.label;
    if (label) {
      const labelY = labelPosition === "center" ? item.start.y : item.start.y - radius - 20 * ratio;
      drawLabel(label, item.start.x, labelY, ratio, 0, styleName);
    }
    context.restore();
  }

  function drawLine(item, isDraft) {
    const isSelected = item.id === state.selectedId || isDraft;
    const dx = item.end.x - item.start.x;
    const dy = item.end.y - item.start.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length;
    const ny = dx / length;
    const ratio = Math.max(1, state.image.naturalWidth / 1200);
    const cap = 10 * ratio;
    const styleName = itemStyle(item, isDraft);
    const style = visualStyle(styleName);
    const labelPosition = itemLabelPosition(item, isDraft);

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
    drawHandle(item.start, ratio, isSelected, isHandleHovered(item.id, "start"), styleName);
    drawHandle(item.end, ratio, isSelected, isHandleHovered(item.id, "end"), styleName);

    const label = isDraft ? "拖动标记" : item.label;
    if (label) {
      const x = (item.start.x + item.end.x) / 2;
      const y = (item.start.y + item.end.y) / 2 - (labelPosition === "above" ? 18 * ratio : 0);
      drawLabel(label, x, y, ratio, 0, styleName);
    }
    context.restore();
  }

  function drawAnnotation(item, isDraft) {
    if (item.type === "rect") drawRectangle(item, isDraft);
    else if (item.type === "circle") drawCircle(item, isDraft);
    else drawLine(item, isDraft);
  }

  function render() {
    if (!state.image) return;
    context.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    context.drawImage(state.image, 0, 0, elements.canvas.width, elements.canvas.height);
    state.annotations.forEach((item) => drawAnnotation(item, false));
    if (state.draft) drawAnnotation(state.draft, true);
  }

  function pointFromEvent(event) {
    const rect = elements.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * elements.canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * elements.canvas.height,
    };
  }

  function handlesFor(item) {
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

  function nearestHandle(point) {
    const threshold = 14 / (state.fitScale * state.zoom);
    let winner = null;
    [...state.annotations].reverse().forEach((item) => {
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
      } else if (item.type === "circle") {
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
    state.selectedId = id;
    updateInterface();
    render();
    if (!focusInput) return;
    requestAnimationFrame(() => {
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
      circle: elements.circleTool,
    };
    Object.entries(buttons).forEach(([tool, button]) => {
      const active = state.tool === tool;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function setTool(tool) {
    state.tool = tool;
    state.draft = null;
    updateToolInterface();
    updateInterface();
    const notices = {
      line: "尺寸线模式：从起点拖动到终点",
      rect: "矩形模式：拖动框选需要标注的区域",
      circle: "圆形模式：从圆心向外拖动",
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
    state.annotationStyle = style;
    const selected = selectedAnnotation();
    if (selected) { selected.style = style; commit(selected); }
    updateStyleInterface();
    render();
    const names = { outline: "黑白线框", light: "白色悬浮", dark: "黑色悬浮" };
    setNotice(`已切换为${names[style]}样式`);
  }

  function updatePositionInterface() {
    const selected = selectedAnnotation();
    const activePosition = selected?.labelPosition || state.labelPosition;
    elements.positionButtons.forEach((button) => {
      const active = button.dataset.labelPosition === activePosition;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function setLabelPosition(position) {
    state.labelPosition = position;
    const selected = selectedAnnotation();
    if (selected) { selected.labelPosition = position; commit(selected); }
    updatePositionInterface();
    render();
    setNotice(position === "center" ? "文字已居中在线条或图形中" : "文字已移动到图形上方");
  }

  function annotationSummary(item) {
    if (item.type === "rect") return Object.values(item.labels || {}).filter(Boolean).join(" · ");
    return item.label;
  }

  function updateInterface() {
    const selected = selectedAnnotation();
    const isRectangle = selected?.type === "rect";
    elements.exportImage.disabled = !state.image || state.annotations.length === 0;
    elements.lineLabelFields.hidden = Boolean(isRectangle);
    elements.rectLabelFields.hidden = !isRectangle;
    elements.labelInput.disabled = !selected || isRectangle;
    elements.labelInput.value = selected && !isRectangle ? selected.label || "" : "";
    Object.entries(elements.edgeInputs).forEach(([side, input]) => {
      input.disabled = !isRectangle;
      input.value = isRectangle ? selected.labels?.[side] || "" : "";
    });
    elements.editorTip.textContent = isRectangle
      ? "四个角点可独立调节；按住 Shift 拖动可保持标准矩形。"
      : selected?.type === "circle"
        ? "拖动圆心可整体移动；拖动外侧节点可调节半径。"
        : "尺寸线端点可自由调节；按住 Shift 可约束水平或垂直方向。";
    elements.measureCount.textContent = String(state.annotations.length);
    elements.listEmpty.hidden = state.annotations.length > 0;
    elements.listItems.innerHTML = "";
    updateStyleInterface();
    updatePositionInterface();

    state.annotations.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "list-row";
      const selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.className = "list-select";
      if (item.id === state.selectedId) selectButton.classList.add("selected");
      selectButton.innerHTML = `<span class="measure-index">${String(index + 1).padStart(2, "0")}</span><strong></strong>`;
      const summary = annotationSummary(item);
      const label = selectButton.querySelector("strong");
      label.textContent = summary || (item.type === "circle" ? "未填写圆形标注" : "未填写标注");
      label.classList.toggle("is-placeholder", !summary);
      const author = document.createElement("small");
      author.className = "annotation-author";
      author.textContent = `制作：${item.createdBy?.name || "员工"} · 修改：${item.updatedBy?.name || item.createdBy?.name || "员工"}`;
      selectButton.append(author);
      selectButton.addEventListener("click", () => selectAnnotation(item.id, true));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "row-delete";
      deleteButton.title = "删除这条标注";
      deleteButton.setAttribute("aria-label", `删除标注：${summary || `第 ${index + 1} 条`}`);
      deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6.5 7l1 13h9l1-13"></path><path d="M10 11v5M14 11v5"></path></svg>';
      deleteButton.addEventListener("click", () => {
        commit(item, true);
        state.annotations = state.annotations.filter((annotation) => annotation.id !== item.id);
        if (state.selectedId === item.id) state.selectedId = null;
        setNotice("标注已删除");
        updateInterface();
        render();
      });
      row.append(selectButton, deleteButton);
      elements.listItems.appendChild(row);
    });
  }

  elements.canvas.addEventListener("pointerdown", (event) => {
    if (!state.image) return;
    const point = pointFromEvent(event);
    const handle = nearestHandle(point);
    if (handle) {
      const item = state.annotations.find((annotation) => annotation.id === handle.id);
      elements.canvas.setPointerCapture(event.pointerId);
      state.handleDrag = {
        id: handle.id,
        key: handle.key,
        origin: { ...handle.point },
        axis: null,
        snapshot: item ? {
          start: { ...item.start },
          end: { ...item.end },
          points: item.points?.map((corner) => ({ ...corner })) || null,
        } : null,
      };
      state.hoverHandle = handle;
      state.selectedId = handle.id;
      updateInterface();
      render();
      return;
    }

    const hit = nearestAnnotation(point);
    if (hit) {
      selectAnnotation(hit.id, false);
      setNotice("已选中标注，可修改文字或节点");
      return;
    }

    elements.canvas.setPointerCapture(event.pointerId);
    state.selectedId = null;
    state.draft = { id: -1, type: state.tool, start: point, end: point };
    updateInterface();
    render();
  });

  elements.canvas.addEventListener("pointermove", (event) => {
    const point = pointFromEvent(event);
    if (state.handleDrag) {
      moveHandle(point, event.shiftKey);
      render();
      return;
    }
    if (state.draft) {
      state.draft.end = point;
      render();
      return;
    }
    updateHoveredHandle(point);
  });

  function finishDrawing(event) {
    if (!state.draft) return;
    state.draft.end = pointFromEvent(event);
    const minimum = 5 / state.fitScale;
    const tooSmall = state.draft.type === "rect"
      ? Math.abs(state.draft.end.x - state.draft.start.x) < minimum
        || Math.abs(state.draft.end.y - state.draft.start.y) < minimum
      : lineLength(state.draft) < minimum;
    if (tooSmall) {
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
    state.annotations.push(annotation);
    state.draft = null;
    commit(annotation);
    const notices = {
      line: "尺寸线已添加，请填写标注文字",
      rect: "矩形已添加，可填写四边文字",
      circle: "圆形已添加，请填写标注文字",
    };
    setNotice(notices[annotation.type]);
    selectAnnotation(annotation.id, true);
  }

  elements.canvas.addEventListener("pointerup", (event) => {
    if (state.handleDrag) {
      const changed = selectedAnnotation();
      state.handleDrag = null;
      commit(changed);
      updateHoveredHandle(pointFromEvent(event));
      setNotice("节点位置已调整");
      render();
      return;
    }
    finishDrawing(event);
  });

  elements.canvas.addEventListener("pointercancel", () => {
    const drag = state.handleDrag;
    if (drag?.snapshot) Object.assign(selectedAnnotation() || {}, drag.snapshot);
    state.draft = null;
    state.handleDrag = null;
    if (deferredAnnotations) applyAnnotations(deferredAnnotations);
    state.hoverHandle = null;
    elements.canvas.style.cursor = "crosshair";
    render();
  });

  elements.canvas.addEventListener("pointerleave", () => {
    if (state.draft || state.handleDrag) return;
    state.hoverHandle = null;
    elements.canvas.style.cursor = "crosshair";
    render();
  });

  elements.lineTool.addEventListener("click", () => setTool("line"));
  elements.rectTool.addEventListener("click", () => setTool("rect"));
  elements.circleTool.addEventListener("click", () => setTool("circle"));

  elements.styleButtons.forEach((button) => {
    button.addEventListener("click", () => setAnnotationStyle(button.dataset.style));
  });
  elements.positionButtons.forEach((button) => {
    button.addEventListener("click", () => setLabelPosition(button.dataset.labelPosition));
  });

  elements.labelInput.addEventListener("input", () => {
    const selected = selectedAnnotation();
    if (!selected || selected.type === "rect") return;
    selected.label = elements.labelInput.value;
    commit(selected);
    updateInterface();
    elements.labelInput.focus();
    elements.labelInput.setSelectionRange(selected.label.length, selected.label.length);
    render();
  });

  Object.entries(elements.edgeInputs).forEach(([side, input]) => {
    input.addEventListener("input", () => {
      const selected = selectedAnnotation();
      if (!selected || selected.type !== "rect") return;
      selected.labels[side] = input.value;
      commit(selected);
      updateInterface();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      render();
    });
  });

  elements.quickLabels.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-prefix]");
    const selected = selectedAnnotation();
    if (!button || !selected || selected.type === "rect") return;
    selected.label = `${button.dataset.prefix}${selected.label.replace(/^(宽|高|深|直径 Ø)\s*/, "")}`;
    commit(selected);
    updateInterface();
    render();
    elements.labelInput.focus();
    elements.labelInput.setSelectionRange(selected.label.length, selected.label.length);
  });

  function undoLast() {
    const removed = [...state.annotations].reverse().find(item => item.createdBy?.id === window.DimensionCollab?.actor?.id);
    if (!removed) return;
    commit(removed, true);
    setNotice("已撤销你最近添加的标注");
  }

  elements.viewport.addEventListener("wheel", (event) => {
    if (!state.image || !elements.canvasStage.contains(event.target)) return;
    event.preventDefault();
    const sensitivity = event.ctrlKey ? .01 : .002;
    const factor = clamp(Math.exp(-event.deltaY * sensitivity), .75, 1.25);
    setZoom(state.zoom * factor, event.clientX, event.clientY);
  }, { passive: false });

  window.addEventListener("keydown", (event) => {
    const isUndo = (event.metaKey || event.ctrlKey)
      && !event.shiftKey
      && event.key.toLowerCase() === "z";
    if (!isUndo || /INPUT|TEXTAREA/.test(event.target.tagName) || event.target.isContentEditable) return;
    event.preventDefault();
    undoLast();
  });

  elements.exportImage.addEventListener("click", () => {
    if (!state.image) return;
    const link = document.createElement("a");
    link.download = `${state.fileName.replace(/\.[^.]+$/, "")}-尺寸标注.png`;
    const selection = state.selectedId;
    state.selectedId = null;
    render();
    link.href = elements.canvas.toDataURL("image/png");
    state.selectedId = selection;
    render();
    link.click();
    setNotice("标注图已导出");
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

  window.addEventListener("resize", updateFit);
  window.addEventListener("beforeunload", () => {
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  });
})();
