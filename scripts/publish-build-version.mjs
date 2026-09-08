import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { publishVersion } from './version-notification.mjs';

const outputRoot = resolve(process.argv[2] || '.');
const manifest = JSON.parse(readFileSync(join(outputRoot, 'version.json'), 'utf8'));
const version = String(manifest?.version || '').trim();
const url = String(process.env.AUTO_OFFICE_SUPABASE_URL || '').replace(/\/$/, '');
const key = String(process.env.AUTO_OFFICE_SUPABASE_ANON_KEY || '').trim();

if (!/^[0-9a-f]{7,40}$/i.test(version)) throw new Error('Invalid build version.');
if (!url || !key) throw new Error('Realtime version publishing is not configured.');

await publishVersion({manifest,url,key,siteUrl:process.env.AUTO_OFFICE_SITE_URL});
console.log(`Confirmed public version ${version}; realtime broadcast accepted by server.`);
