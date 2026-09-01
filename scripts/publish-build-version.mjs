import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outputRoot = resolve(process.argv[2] || '.');
const manifest = JSON.parse(readFileSync(join(outputRoot, 'version.json'), 'utf8'));
const version = String(manifest?.version || '').trim();
const url = String(process.env.AUTO_OFFICE_SUPABASE_URL || '').replace(/\/$/, '');
const key = String(process.env.AUTO_OFFICE_SUPABASE_ANON_KEY || '').trim();

if (!/^[0-9a-f]{7,40}$/i.test(version)) throw new Error('Invalid build version.');
if (!url || !key) throw new Error('Realtime version publishing is not configured.');

const response = await fetch(`${url}/rest/v1/academy_state?on_conflict=id`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal'
  },
  body: JSON.stringify({
    id: 'app-version',
    payload: {
      version,
      commit: manifest.commit,
      publishedAt: new Date().toISOString()
    },
    updated_at: new Date().toISOString()
  })
});

if (!response.ok) {
  const detail = await response.text();
  throw new Error(`Realtime version publish failed (${response.status}): ${detail}`);
}

console.log(`Published realtime version ${version}.`);
