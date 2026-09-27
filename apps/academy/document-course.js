/* Local document readers: Mammoth 1.13.0 (BSD-2-Clause), PDF.js 4.10.38 (Apache-2.0). */
window.AcademyDocuments = (() => {
  const base = new URL('.', document.currentScript.src);
  const vendor = new URL('../vendor/documents/', base);
  const formats = new Set(['docx', 'pdf', 'txt']);
  let mammothReady;
  let pdfReady;
  const mounts = new WeakMap();
  function safeUrl(value) {
    try {
      const url = new URL(String(value || ''), base);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  }
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || !raw.url || !formats.has(raw.format)) return null;
    const url = safeUrl(raw.url);
    if (!url) return null;
    return { url: String(raw.url), name: String(raw.name || '课程文档').slice(0, 200), format: raw.format,
      size: Math.max(0, Number(raw.size) || 0), text: String(raw.text || '').slice(0, 200000) };
  }
  function validate(file) {
    if (!file) throw new Error('请选择课程文档。');
    const format = file.name.split('.').pop().toLowerCase();
    if (!formats.has(format)) throw new Error('支持 DOCX、PDF 和 TXT；旧版 DOC 请先另存为 DOCX 或 PDF。');
    if (!file.size) throw new Error('文档为空，请重新选择。');
    if (file.size > 20 * 1024 * 1024) throw new Error('文档超过20MB，请压缩或拆分后上传。');
    return format;
  }
  function loadMammoth() {
    if (window.mammoth) return Promise.resolve(window.mammoth);
    if (!mammothReady) mammothReady = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('mammoth.browser.js', vendor).href;
      script.onload = () => resolve(window.mammoth);
      script.onerror = () => { mammothReady = null; script.remove(); reject(new Error('Word预览组件加载失败，请重试。')); };
      document.head.appendChild(script);
    });
    return mammothReady;
  }
  function loadPdf() {
    if (!pdfReady) pdfReady = import(new URL('pdf.mjs', vendor).href).then(pdf => {
      pdf.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.mjs', vendor).href;
      return pdf;
    }).catch(error => { pdfReady = null; throw error; });
    return pdfReady;
  }
  // Rebuild a semantic allowlist instead of injecting untrusted converted HTML.
  function sanitize(html) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const fragment = document.createDocumentFragment();
    const tags = new Set(['P','H1','H2','H3','H4','H5','H6','UL','OL','LI','TABLE','THEAD','TBODY','TFOOT','TR','TD','TH','STRONG','B','EM','I','U','S','SUP','SUB','BR','HR','BLOCKQUOTE','A','IMG']);
    function copy(node, parent) {
      if (node.nodeType === Node.TEXT_NODE) { parent.appendChild(document.createTextNode(node.textContent)); return; }
      if (node.nodeType !== Node.ELEMENT_NODE || ['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','FORM','INPUT','BUTTON','SVG','MATH'].includes(node.tagName)) return;
      if (!tags.has(node.tagName)) { node.childNodes.forEach(child => copy(child, parent)); return; }
      const clean = document.createElement(node.tagName.toLowerCase());
      if (['TD','TH'].includes(node.tagName)) for (const attr of ['colspan','rowspan']) {
        const value = Number(node.getAttribute(attr));
        if (value > 0 && value <= 100) clean.setAttribute(attr, value);
      }
      if (node.tagName === 'A') {
        const href = node.getAttribute('href') || '';
        if (/^https?:\/\//i.test(href)) { clean.href = href; clean.target = '_blank'; clean.rel = 'noopener noreferrer'; }
      }
      if (node.tagName === 'IMG') {
        const src = node.getAttribute('src') || '';
        if (!/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(src)) return;
        clean.src = src; clean.alt = node.getAttribute('alt') || '文档图片';
      }
      node.childNodes.forEach(child => copy(child, clean)); parent.appendChild(clean);
    }
    parsed.body.childNodes.forEach(node => copy(node, fragment));
    return fragment;
  }
  async function upload(file, lessonId) {
    const format = validate(file);
    const cfg = window.ACADEMY_CONFIG;
    if (!cfg?.url || !cfg?.key || !cfg?.bucket) throw new Error('文档上传服务暂不可用。');
    const id = String(lessonId).replace(/[^a-zA-Z0-9_-]/g, '-');
    const token = crypto.randomUUID();
    const path = `academy/documents/${id}/${token}.${format}`;
    const origin = window.APP_NETWORK?.origin || cfg.url;
    const request = window.APP_NETWORK?.request || window.fetch.bind(window);
    const mime = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pdf: 'application/pdf', txt: 'text/plain;charset=utf-8' }[format];
    const response = await request(`${origin}/storage/v1/object/${encodeURIComponent(cfg.bucket)}/${path}`, {
      method: 'POST', appNetworkSafeWrite: true,
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': mime, 'x-upsert': 'false', 'cache-control': '3600' }, body: file
    });
    if (!response.ok) throw new Error(`文档上传失败（HTTP ${response.status}），请重试。`);
    return { url: `${cfg.url}/storage/v1/object/public/${encodeURIComponent(cfg.bucket)}/${path}`, name: file.name, format, size: file.size };
  }
  async function mount(host, source, file) {
    if (!host) return null;
    mounts.get(host)?.abort();
    const controller = new AbortController(); mounts.set(host, controller);
    const current = () => !controller.signal.aborted && host.isConnected;
    const observer = new MutationObserver(() => { if (!host.isConnected) { controller.abort(); observer.disconnect(); } });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    controller.signal.addEventListener('abort', () => observer.disconnect(), { once: true });
    host.hidden = false; host.replaceChildren();
    const status = document.createElement('p'); status.className = 'document-status'; status.setAttribute('role','status'); status.textContent = '正在读取文档…'; host.appendChild(status);
    const record = file ? { name: file.name, format: validate(file), size: file.size } : normalize(source);
    let pdfTask;
    try {
      if (!record) throw new Error('课程文档暂不可用，请联系店长。');
      let data;
      if (file) data = await file.arrayBuffer();
      else {
        const response = await fetch(safeUrl(record.url), { signal: controller.signal });
        if (!response.ok) throw new Error(`文档加载失败（HTTP ${response.status}）。`);
        data = await response.arrayBuffer();
      }
      if (!current()) return null;
      if (data.byteLength > 20 * 1024 * 1024) throw new Error('文档超过20MB，无法预览。');
      const body = document.createElement('div'); body.className = 'document-body';
      let text = '';
      if (record.format === 'docx') {
        const mammoth = await loadMammoth();
        const result = await mammoth.convertToHtml({ arrayBuffer: data }, { includeEmbeddedStyleMap: false, externalFileAccess: false,
          styleMap: ["p[style-name='Title'] => h1:fresh"] });
        if (!current()) return null;
        body.appendChild(sanitize(result.value)); text = body.textContent;
        if (!text.trim() && !body.querySelector('img')) throw new Error('Word文档没有可预览内容。');
        status.textContent = `${record.name} · Word阅读预览`;
      } else if (record.format === 'txt') {
        text = new TextDecoder('utf-8', { fatal: true }).decode(data);
        const pre = document.createElement('pre'); pre.textContent = text; body.appendChild(pre);
        status.textContent = `${record.name} · 文本预览`;
      } else {
        if (!new TextDecoder().decode(data.slice(0, 1024)).includes('%PDF-')) throw new Error('文件不是有效的PDF。');
        const reader = await loadPdf();
        pdfTask = reader.getDocument({ data: new Uint8Array(data), isEvalSupported: false, cMapUrl: new URL("cmaps/", vendor).href, cMapPacked: true, standardFontDataUrl: new URL("standard_fonts/", vendor).href });
        controller.signal.addEventListener('abort', () => pdfTask.destroy(), { once: true });
        const pdf = await pdfTask.promise;
        if (!current()) { pdfTask.destroy(); return null; }
        const toolbar = document.createElement('div'); toolbar.className = 'document-pagination';
        const prev = document.createElement('button'); prev.type = 'button'; prev.textContent = '上一页';
        const next = document.createElement('button'); next.type = 'button'; next.textContent = '下一页';
        const label = document.createElement('span'); label.setAttribute('aria-live','polite');
        toolbar.append(prev,label,next); body.appendChild(toolbar);
        const canvas = document.createElement('canvas'); canvas.setAttribute('role','img'); body.appendChild(canvas);
        const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = '本页文字';
        const transcript = document.createElement('p'); details.append(summary,transcript); body.appendChild(details);
        let pageNumber = 1, renderTask, ticket = 0;
        const showPage = async () => {
          const run = ++ticket; renderTask?.cancel(); prev.disabled = next.disabled = true;
          label.textContent = `${pageNumber} / ${pdf.numPages} 页`;
          try {
            const page = await pdf.getPage(pageNumber);
            if (!current() || run !== ticket) return;
            const initial = page.getViewport({ scale: 1 });
            const width = Math.max(240, Math.min(900, host.clientWidth - 32));
            const viewport = page.getViewport({ scale: width / initial.width });
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(viewport.width * ratio); canvas.height = Math.round(viewport.height * ratio);
            canvas.style.width = '100%'; canvas.style.height = 'auto'; canvas.setAttribute('aria-label',`PDF第${pageNumber}页`);
            renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: [ratio,0,0,ratio,0,0] });
            await renderTask.promise;
            const content = await page.getTextContent();
            if (!current() || run !== ticket) return;
            transcript.textContent = content.items.map(item => item.str || '').join(' ');
            status.textContent = `${record.name} · PDF预览`;
          } catch (error) { if (error.name !== 'RenderingCancelledException' && current()) throw error; }
          finally { if (current() && run === ticket) { prev.disabled = pageNumber === 1; next.disabled = pageNumber === pdf.numPages; } }
        };
        const handlePageError = error => { status.textContent = `页面预览失败：${error.message || '请重试'}`; };
        prev.onclick = () => { pageNumber--; showPage().catch(handlePageError); }; next.onclick = () => { pageNumber++; showPage().catch(handlePageError); };
        host.appendChild(body); await showPage();
        if (file) {
          const paragraphs = [];
          for (let n = 1; n <= pdf.numPages && paragraphs.join('').length < 200000; n++) {
            if (!current()) return null;
            const page = await pdf.getPage(n); const content = await page.getTextContent();
            paragraphs.push(content.items.map(item => item.str || '').join(' '));
          }
          text = paragraphs.join('\n').slice(0,200000);
        } else text = source?.text || '';
        return { ...record, text };
      }
      if (!current()) return null;
      host.appendChild(body);
      body.querySelectorAll('table').forEach(table => { const wrapper = document.createElement('div'); wrapper.className = 'document-table'; table.replaceWith(wrapper); wrapper.appendChild(table); });
      return { ...record, text: text.slice(0,200000) };
    } catch (error) {
      if (controller.signal.aborted) return null;
      if (pdfTask) pdfTask.destroy();
      status.textContent = `无法预览：${error.message || '请检查文件或网络'}`;
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重试预览'; retry.onclick = () => mount(host,source,file); host.appendChild(retry);
      return null;
    }
  }
  return Object.freeze({ normalize, validate, upload, mount, sanitize, safeUrl });
})();
