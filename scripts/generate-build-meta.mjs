import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputRoot = resolve(process.argv[2] || repositoryRoot);

function git(args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8'
  }).trim();
}

function commitMeta(pathspec) {
  const record = git(['log', '-1', '--format=%H%x00%h%x00%cI', '--', pathspec]);
  if (!record) return null;
  const [commit, version, updatedAt] = record.split('\0');
  return { version, commit, updatedAt };
}

const build = commitMeta('.') || {
  version: git(['rev-parse', '--short', 'HEAD']),
  commit: git(['rev-parse', 'HEAD']),
  updatedAt: new Date().toISOString()
};

const appsRoot = join(repositoryRoot, 'apps');
const apps = {};

for (const entry of readdirSync(appsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const indexPath = join(appsRoot, entry.name, 'index.html');
  if (!existsSync(indexPath)) continue;
  const meta = commitMeta(`apps/${entry.name}`);
  if (meta) apps[entry.name] = meta;
}

const manifest = {
  ...build,
  generatedAt: new Date().toISOString(),
  apps
};

writeFileSync(join(outputRoot, 'version.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const serviceWorkerPath = join(outputRoot, 'sw.js');
if (existsSync(serviceWorkerPath)) {
  const serviceWorker = readFileSync(serviceWorkerPath, 'utf8');
  const rendered = serviceWorker.replaceAll('__BUILD_VERSION__', build.version);
  writeFileSync(serviceWorkerPath, rendered);
}

console.log(`Generated version ${build.version} for ${Object.keys(apps).length} apps.`);
