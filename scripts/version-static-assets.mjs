import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';

// Content versions survive unrelated releases; only HTML references to deployed
// scripts/styles are rewritten. Dynamic loaders retain their existing URLs.
export function versionStaticAssets(root) {
  root = resolve(root);
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(resolve(dir, entry.name)) : [resolve(dir, entry.name)]);
  const hashes = new Map();
  let count = 0;
  for (const file of walk(root).filter(file => extname(file) === '.html')) {
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
    let rendered = original.replace(/<(?:script|link)\b[^>]*>/gi, tag => {
      if (!/^<script\b/i.test(tag) && !/\brel\s*=\s*["']stylesheet["']/i.test(tag)) return tag;
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
