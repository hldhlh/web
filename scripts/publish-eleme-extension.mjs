import {createHash} from 'node:crypto';
import {readFile, writeFile, rename, mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root = new URL('../tools/eleme-meal-monitor/', import.meta.url);
const files = ['manifest.json', 'background.js', 'auto-policy.mjs', 'auto-click.js', 'content.js', 'meituan.js', 'timing.js', 'logic.mjs', 'update.mjs', 'popup.html', 'popup.css', 'popup.js', 'progress.js', 'icons/icon128.png'];
const hash = createHash('sha256');
for (const file of files) hash.update(file).update('\0').update(await readFile(new URL(file, root)));
const build = hash.digest('hex');
async function atomic(name, content, directory = root) {
  const temp = new URL(`${name}.tmp`, directory);
  await writeFile(temp, content);
  await rename(temp, new URL(name, directory));
}
await atomic('build-id.mjs', `export const BUILD_ID = '${build}';\n`);
await atomic('revision.json', `${JSON.stringify({build})}\n`);
console.log(`Published local Edge extension build ${build.slice(0, 12)}. Running extension checks within approximately 30 seconds while Edge is awake.`);

if (process.argv[2]) {
  const destination = pathToFileURL(resolve(process.argv[2]) + '/');
  if (destination.href !== root.href) {
    await mkdir(new URL('icons/', destination), {recursive: true});
    // Remove the old marker first: an awake extension must not reload a partially copied package.
    await atomic('revision.json', '{}\n', destination);
    for (const name of [...files, 'README.md', 'build-id.mjs']) await atomic(name, await readFile(new URL(name, root)), destination);
    await atomic('revision.json', await readFile(new URL('revision.json', root)), destination);
    console.log(`Synced extension to ${destination.pathname}`);
  }
}
