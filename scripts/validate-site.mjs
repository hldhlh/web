import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = resolve('_site');
const allowed = new Set([...JSON.parse(readFileSync('deploy/public-files.json', 'utf8')), 'version.json']);
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)]);
const files = walk(root);
let count = 0;
function check(file, reference) {
  if (!reference || /[${}<>]/.test(reference)) return;
  const url = new URL(reference, `https://site.invalid/${file}`);
  if (url.origin !== 'https://site.invalid' || !url.pathname) return;
  let target = resolve(root, '.' + decodeURIComponent(url.pathname));
  if (existsSync(target) && statSync(target).isDirectory()) target = resolve(target, 'index.html');
  if (!existsSync(target)) throw new Error(`${file}: missing ${reference}`);
  count++;
}
for (const path of files) {
  const file = relative(root, path);
  if (!allowed.delete(file)) throw new Error(`Unexpected public file: ${file}`);
  const ext = extname(file);
  if (!['.html', '.css', '.js'].includes(ext)) continue;
  const text = readFileSync(path, 'utf8');
  if (ext === '.html') for (const match of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)["']/g)) check(file, match[1]);
  if (ext === '.css') for (const match of text.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) check(file, match[1]);
  if (ext === '.js' && !file.includes('/vendor/') && !file.endsWith('.min.js')) execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' });
}
for (const match of readFileSync('apps.js', 'utf8').matchAll(/(?:path|icon): "([^"]+)"/g)) check('apps/index.html', match[1]);
const shell = readFileSync('sw.js', 'utf8').split('const SHELL = [')[1].split('];')[0];
for (const match of shell.matchAll(/'([^']+)'/g)) check('sw.js', match[1]);
for (const match of readFileSync('apps/svg/index.html', 'utf8').matchAll(/"(i[^"/]*\.svg)"/g)) check('apps/svg/index.html', match[1]);
if (allowed.size) throw new Error(`Missing output: ${[...allowed].join(', ')}`);
console.log(`Validated ${files.length} public files and ${count} local references; JavaScript syntax passed.`);
