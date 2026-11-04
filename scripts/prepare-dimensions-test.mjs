import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('apps/academy/pages/dimensions/index.html', root), 'utf8')
  .replace('<head>', '<head><base href="/apps/academy/pages/dimensions/">')
  .replace('<script src="bootstrap.js" defer></script>', '<script src="model.js" defer></script><script src="editor.js" defer></script><script src="/tests/dimensions-editing-fixture.js" defer></script>');
mkdirSync(new URL('output/', root), { recursive:true });
writeFileSync(new URL('output/dimensions-editing.html', root), html);
console.log('Serve the repository locally and open /output/dimensions-editing.html (no production API calls).');
