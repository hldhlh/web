import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';

// Content versions survive unrelated releases; only HTML references to deployed
// scripts/styles are rewritten. Opted-in dynamic preload links supply loader URLs.
export function versionStaticAssets(root) {
  root = resolve(root);
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(resolve(dir, entry.name)) : [resolve(dir, entry.name)]);
  const hashes = new Map();
  let count = 0;
  const files = walk(root);
  // Hash font bytes before their stylesheets so a font update also invalidates CSS.
  for (const file of files.filter(file => extname(file) === '.css')) {
    const base = new URL(relative(root, file).split('\\').join('/'), 'https://static.invalid/');
    const original = readFileSync(file, 'utf8');
    const rendered = original.replace(/url\(\s*(["']?)([^"'()\s]+)\1\s*\)/gi, (match, quote, value) => {
      if (/^(?:[a-z]+:|\/\/)|[${}]/i.test(value)) return match;
      const url = new URL(value, base);
      if (!/\.woff2?$/.test(url.pathname)) return match;
      const target = resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!target.startsWith(root + '/') || !existsSync(target)) return match;
      const hash = createHash('sha256').update(readFileSync(target)).digest('hex').slice(0, 16);
      const query = new URLSearchParams(url.search); query.set('v', hash);
      return `url(${quote}${value.split(/[?#]/)[0]}?${query}${url.hash}${quote})`;
    });
    if (original !== rendered) writeFileSync(file, rendered);
  }
  for (const file of files.filter(file => extname(file) === '.html')) {
    const base = new URL(relative(root, file).split('\\').join('/'), 'https://static.invalid/');
    const original = readFileSync(file, 'utf8');
    const assets = new Map();
    function version(value) {
      if (/^(?:[a-z]+:|\/\/)|[${}]/i.test(value)) return null;
      const url = new URL(value, base);
      if (!/\.(?:js|mjs|css)$/.test(url.pathname)) return null;
      const target = resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!target.startsWith(root + '/') || !existsSync(target)) return null;
      if (!hashes.has(target)) hashes.set(target, createHash('sha256').update(readFileSync(target)).digest('hex').slice(0, 16));
      const query = new URLSearchParams(url.search);
      query.set('v', hashes.get(target));
      return value.split(/[?#]/)[0] + '?' + query.toString() + url.hash;
    }
    let rendered = original.replace(/(<script\b[^>]*\bid=["']app-assets["'][^>]*>)([\s\S]*?)(<\/script>)/gi, (_, open, json, close) => {
      const manifest = JSON.parse(json);
      for (const [name, value] of Object.entries(manifest)) {
        const next = version(value);
        if (next) { assets.set(value, next); manifest[name] = next; count++; }
      }
      return open + JSON.stringify(manifest).replaceAll('<', '\\u003c') + close;
    });
    rendered = rendered.replace(/(<script\b[^>]*\bdata-version-modules[^>]*>)([\s\S]*?)(<\/script>)/gi, (_, open, json, close) => {
      const map = JSON.parse(json);
      const prefixes = Object.entries(map.imports || {}).filter(([name, value]) => name.endsWith("/") && value.endsWith("/"));
      // Exact URL mappings cover transitive relative imports without editing
      // vendor code or changing module identity between preload and import.
      for (const [name, value] of Object.entries(map.imports || {})) {
        const next = version(value); if (next) map.imports[name] = next;
      }
      const directory = resolve(file, '..');
      for (const module of files.filter(path => path.startsWith(directory + '/') && /\.m?js$/.test(path))) {
        const name = './' + relative(directory, module).split('\\').join('/');
        map.imports[name] = version(name);
        for (const [prefix, directory] of prefixes) {
          if (name.startsWith(directory)) map.imports[prefix + name.slice(directory.length)] = map.imports[name];
        }
      }
      return open + JSON.stringify(map).replaceAll('<', '\\u003c') + close;
    });
    rendered = rendered.replace(/<(?:script|link)\b[^>]*>/gi, tag => {
      if (!/^<script\b/i.test(tag) && !/\brel\s*=\s*["'](?:stylesheet|prefetch)["']/i.test(tag) && !/\bdata-dimension-script=/.test(tag) && !/\bdata-app-module(?:\s|>)/.test(tag)) return tag;
      return tag.replace(/\b(src|href)=(['"])(.*?)\2/gi, (match, attr, quote, value) => {
        const next = version(value);
        if (!next) return match;
        assets.set(value, next); count++;
        return `${attr}=${quote}${next}${quote}`;
      });
    });
    // Preload must use the exact URL of its consumer to avoid duplicate downloads.
    rendered = rendered.replace(/<link\b[^>]*\brel\s*=\s*["'](?:preload|modulepreload)["'][^>]*>/gi, tag =>
      tag.replace(/\bhref=(['"])(.*?)\1/i, (match, quote, value) => assets.has(value) ? `href=${quote}${assets.get(value)}${quote}` : match));
    if (rendered !== original) writeFileSync(file, rendered);
  }
  return count;
}
