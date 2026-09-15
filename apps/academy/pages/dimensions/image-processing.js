(function (root) {
  'use strict';
  const limits = Object.freeze({ inputBytes: 15 * 1024 * 1024, inputPixels: 24000000,
    imageEdge: 2560, imageBytes: 1024 * 1024, exportBytes: 512 * 1024, previewEdge: 480, previewBytes: 64 * 1024 });
  const extensions = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
  function fit(width, height, edge) {
    const ratio = Math.min(1, edge / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
  }
  function encode(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob?.size ? resolve(blob) : reject(new Error('图片压缩失败，请换一张图片重试')), type, quality);
    });
  }
  function hasTransparency(canvas) {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 255) return true;
    return false;
  }
  async function compress(bitmap, edge, budget, quality, onProgress) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前设备无法处理图片，请更换浏览器重试');
    let type = 'image/webp';
    try {
      // Bound both encoding work and output size. Redraw from the decoded source
      // on each pass so resizing never compounds previous JPEG/WebP artifacts.
      for (let pass = 0; pass < 10; pass++) {
        const size = fit(bitmap.width, bitmap.height, edge);
        canvas.width = size.width; canvas.height = size.height;
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        let best = await encode(canvas, type, quality);
        if (type === 'image/webp' && best.type !== type) {
          // Unsupported encoders silently return PNG. Never label that blob WebP,
          // and never flatten transparent source images to JPEG.
          type = hasTransparency(canvas) ? 'image/png' : 'image/jpeg';
          best = await encode(canvas, type, quality);
        }
        if (!extensions[best.type]) throw new Error('当前浏览器不支持共享图片格式');
        type = best.type;
        if (best.size > budget && type !== 'image/png') {
          const smaller = await encode(canvas, type, .72);
          if (smaller.type === type && smaller.size < best.size) best = smaller;
        }
        if (best.size <= budget) return { blob: best, ...size, extension: extensions[best.type] };
        onProgress?.('正在进一步压缩图片…');
        edge = Math.max(1, Math.floor(Math.max(size.width, size.height) * .8));
      }
      throw new Error('图片仍然过大，请裁剪后再上传');
    } finally { canvas.width = 1; canvas.height = 1; }
  }
  async function prepare(file, onProgress) {
    if (!file || !extensions[file.type]) throw new Error('请选择 JPG、PNG 或 WebP 图片');
    if (!file.size || file.size > limits.inputBytes) throw new Error('图片请控制在 15 MB 以内');
    onProgress?.('正在本机转换并压缩图片…');
    let bitmap;
    try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (_) { throw new Error('无法读取这张图片，请选择有效的 JPG、PNG 或 WebP 文件'); }
    try {
      const sourceWidth = bitmap.width, sourceHeight = bitmap.height;
      if (!sourceWidth || !sourceHeight || sourceWidth * sourceHeight > limits.inputPixels) {
        throw new Error('图片超过 2400 万像素，请缩小后上传');
      }
      let main = await compress(bitmap, limits.imageEdge, limits.imageBytes, .84, onProgress);
      // Already optimized inputs must not grow or suffer an unnecessary re-encode.
      // Only retain source bytes when dimensions and the byte limit already fit.
      if (main.width === sourceWidth && main.height === sourceHeight && file.size <= main.blob.size) {
        main = { ...main, blob: file, extension: extensions[file.type] };
      }
      let preview = null;
      const reusePreview = main.width <= limits.previewEdge && main.height <= limits.previewEdge && main.blob.size <= limits.previewBytes;
      if (!reusePreview) {
        try { preview = await compress(bitmap, limits.previewEdge, limits.previewBytes, .76); }
        catch (_) { /* A missing optional preview never triggers an original upload. */ }
      }
      return { main, preview, reusePreview, sourceBytes: file.size, sourceWidth, sourceHeight };
    } finally { bitmap.close(); }
  }
  function formatBytes(bytes) {
    return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  async function exportCanvas(source, onProgress) {
    // Snapshot before the first await so edits during encoding cannot alter the export.
    const snapshot = document.createElement('canvas');
    snapshot.width = source.width; snapshot.height = source.height;
    try {
      snapshot.getContext('2d').drawImage(source, 0, 0);
      return await compress(snapshot, limits.imageEdge, limits.exportBytes, .84, onProgress);
    } finally { snapshot.width = 1; snapshot.height = 1; }
  }
  async function preview(blob) {
    if (!blob.size || blob.size > limits.inputBytes) throw new Error('预览图片大小无效');
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    try {
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > limits.inputPixels) throw new Error('预览图片尺寸无效');
      if (Math.max(bitmap.width, bitmap.height) <= limits.previewEdge && blob.size <= limits.previewBytes) return blob;
      return (await compress(bitmap, limits.previewEdge, limits.previewBytes, .76)).blob;
    } finally { bitmap.close(); }
  }
  root.DimensionImages = { prepare, exportCanvas, preview, fit, formatBytes, limits };
})(globalThis);
