import { execFileSync } from 'node:child_process';
import { cpSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, '_site');
const files = JSON.parse(readFileSync(resolve(root, 'deploy/public-files.json'), 'utf8'));
if (!Array.isArray(files) || !files.length || new Set(files).size !== files.length) {
  throw new Error('Public file list must be a nonempty array without duplicates.');
}

// Validate the entire explicit allowlist before replacing the previous build.
for (const file of files) {
  if (typeof file !== 'string' || file.startsWith('/') || file.includes('\\') ||
      file.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid public path: ${file}`);
  }
  const source = resolve(root, file);
  if (!lstatSync(source).isFile() || realpathSync(source) !== source ||
      source.startsWith(output + sep)) {
    throw new Error(`Public source must be a regular repository file: ${file}`);
  }
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output);
for (const file of files) {
  const target = resolve(output, file);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(resolve(root, file), target);
}
execFileSync(process.execPath, [resolve(root, 'scripts/generate-build-meta.mjs'), output], {
  stdio: 'inherit'
});
console.log(`Built ${files.length} public files plus version.json in _site/.`);
