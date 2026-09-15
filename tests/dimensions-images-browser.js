async page => {
  await page.route('http://127.0.0.1:8775/compression-test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Image compression test</title>' }));
  await page.goto('http://127.0.0.1:8775/compression-test');
  await page.addScriptTag({ url: 'http://127.0.0.1:8775/apps/academy/pages/dimensions/image-processing.js' });
  return await page.evaluate(async () => {
    const api = window.DimensionImages;
    const assert = (value, message) => { if (!value) throw Error(message); };
    const encode = (canvas, type, quality) => new Promise(resolve => canvas.toBlob(resolve, type, quality));
    const fileFor = async (canvas, type, quality = .94) => new File([await encode(canvas, type, quality)], 'sample', { type });
    const inspect = async blob => {
      const image = await createImageBitmap(blob);
      const result = { width: image.width, height: image.height, bytes: blob.size, type: blob.type };
      image.close(); return result;
    };
    const source = document.createElement('canvas'); source.width = 3200; source.height = 2200;
    const ctx = source.getContext('2d'), pixels = ctx.createImageData(source.width, source.height);
    let seed = 31;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      pixels.data[i] = seed & 255; pixels.data[i + 1] = (seed >>> 8) & 255;
      pixels.data[i + 2] = (seed >>> 16) & 255; pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(100, 100, 600, 90);
    ctx.fillStyle = '#000'; ctx.font = '48px sans-serif'; ctx.fillText('120 cm', 130, 165);
    const exported = await api.exportCanvas(source);
    const exportedImage = await inspect(exported.blob);
    assert(exportedImage.bytes <= 512 * 1024 && exportedImage.type === 'image/webp', 'Export budget or encoding incorrect');
    assert(exportedImage.width === exported.width && exportedImage.height === exported.height, 'Export dimensions mismatch');
    const large = await fileFor(source, 'image/jpeg');
    const optimized = await api.prepare(large);
    const decoded = await inspect(optimized.main.blob);
    assert(decoded.bytes <= api.limits.imageBytes && Math.max(decoded.width, decoded.height) <= 2560, 'Main image budget not enforced');
    assert(decoded.type === 'image/webp' && decoded.bytes < large.size, 'Large JPEG was not converted and compressed');
    assert(decoded.width === optimized.main.width && decoded.height === optimized.main.height, 'Stored dimensions differ from real image');
    assert(Math.abs(decoded.width / decoded.height - 3200 / 2200) < .005, 'Aspect ratio changed');
    assert(optimized.preview.blob.size <= api.limits.previewBytes && Math.max(optimized.preview.width, optimized.preview.height) <= 480, 'Preview budget not enforced');

    // Real 48 MP files previously failed before reaching the compression loop.
    source.width = 8000; source.height = 6000;
    ctx.fillStyle = '#345678'; ctx.fillRect(0, 0, source.width, source.height);
    ctx.fillStyle = '#fff'; ctx.font = '240px sans-serif'; ctx.fillText('4800 万像素 / 120 cm', 400, 600);
    const highResolution = [];
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      const file = await fileFor(source, type);
      assert(file.size <= api.limits.inputBytes, '48 MP fixture exceeds the byte limit');
      const result = await api.prepare(file), actual = await inspect(result.main.blob);
      assert(result.sourceWidth === 8000 && result.sourceHeight === 6000, 'Original dimensions lost');
      assert(actual.width === 2560 && actual.height === 1920, '48 MP image was not proportionally resized');
      assert(actual.width === result.main.width && actual.height === result.main.height, '48 MP stored dimensions mismatch');
      assert(actual.bytes <= api.limits.imageBytes && actual.bytes < file.size, '48 MP image was not compressed');
      const thumbnail = await inspect(result.preview.blob);
      assert(thumbnail.width === 480 && thumbnail.height === 360 && thumbnail.bytes <= api.limits.previewBytes, '48 MP preview budget not enforced');
      const legacyPreview = await inspect(await api.preview(file));
      assert(legacyPreview.width === 480 && legacyPreview.height === 360 && legacyPreview.bytes <= api.limits.previewBytes, 'Legacy 48 MP preview failed');
      highResolution.push({ sourceType: type, sourceBytes: file.size, main: actual, preview: thumbnail });
    }

    source.width = 400; source.height = 300;
    ctx.fillStyle = 'rgba(255,0,0,.5)'; ctx.fillRect(80, 60, 240, 180);
    const transparent = await fileFor(source, 'image/png');
    const checkAlpha = async result => {
      const bitmap = await createImageBitmap(result.main.blob), c = document.createElement('canvas'); c.width=bitmap.width;c.height=bitmap.height;
      const x=c.getContext('2d');x.drawImage(bitmap,0,0);bitmap.close();
      assert(x.getImageData(0,0,1,1).data[3]===0, 'Transparency was flattened');
      assert(Math.abs(x.getImageData(200,150,1,1).data[3]-128)<=1, 'Semitransparent pixels changed');
    };
    await checkAlpha(await api.prepare(transparent));

    const nativeToBlob = HTMLCanvasElement.prototype.toBlob;
    try {
      HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) { return nativeToBlob.call(this, callback, type === 'image/webp' ? 'image/png' : type, quality); };
      const fallback = await api.prepare(transparent); await checkAlpha(fallback);
      assert(fallback.main.blob.type === 'image/png' && fallback.main.extension === 'png', 'Transparent fallback extension/type mismatch');
      ctx.fillStyle = '#345678'; ctx.fillRect(0,0,400,300);
      const opaque = await api.prepare(await fileFor(source, 'image/jpeg'));
      assert(opaque.main.blob.type === 'image/jpeg' && opaque.main.extension === 'jpg', 'Opaque fallback must use actual JPEG bytes');
    } finally { HTMLCanvasElement.prototype.toBlob = nativeToBlob; }

    source.width=200;source.height=100;
    ctx.fillStyle='#ff0000';ctx.fillRect(0,0,100,100);ctx.fillStyle='#0000ff';ctx.fillRect(100,0,100,100);
    const jpg = await encode(source, 'image/jpeg', .94);
    const exif = new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);
    const rotated = new File([jpg.slice(0,2),exif,jpg.slice(2)],'rotated.jpg',{type:'image/jpeg'});
    const oriented = await api.prepare(rotated), orientedDecoded = await inspect(oriented.main.blob);
    assert(orientedDecoded.width===100 && orientedDecoded.height===200 && oriented.main.width===100 && oriented.main.height===200,'EXIF orientation is inconsistent');

    const lightFile = await fileFor(source, 'image/webp', .3);
    const light = await api.prepare(lightFile);
    assert(light.main.blob.size<=lightFile.size && light.reusePreview, 'Small optimized file grew or needs a duplicate preview');

    for (const bad of [new File(['invalid'],'bad.png',{type:'image/png'}),new File([new Uint8Array(api.limits.inputBytes+1)],'big.jpg',{type:'image/jpeg'})]) {
      let rejected=false; try { await api.prepare(bad); } catch (_) { rejected=true; } assert(rejected,'Invalid input was accepted');
    }
    try {
      HTMLCanvasElement.prototype.toBlob = function(callback) { callback(null); };
      let rejected=false;try { await api.prepare(transparent); } catch (_) { rejected=true; }
      assert(rejected,'Failed encoding must not fall back to uploading the original');
    } finally { HTMLCanvasElement.prototype.toBlob = nativeToBlob; }
    source.width=1;source.height=1;
    return {passed:true,exportedImage,highResolution,sourceBytes:large.size,main:decoded,previewBytes:optimized.preview.blob.size,
      storageReduction:Math.round((1-(decoded.bytes+optimized.preview.blob.size)/large.size)*100)+'%',
      checks:['real WebP conversion','48 MP JPEG/PNG/WebP compression and legacy previews','byte and dimension limits','aspect ratio','transparent pixels','unsupported WebP fallback','EXIF orientation','small file reuse','invalid input and encoder failure'],productionWrites:0};
  });
}
