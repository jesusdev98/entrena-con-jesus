// Explicit source intake only. Normal generation/validation is offline and hash-locked.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { sha256 } from './sources.mjs';

const root = 'scripts/catalogs/met-sources';
await mkdir(root, { recursive: true });
const lockPath = 'scripts/catalogs/met-source-lock.json';
let existing;
try { existing = JSON.parse(await readFile(lockPath, 'utf8')); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (existing) throw new Error('MET sources are already pinned; review a new edition explicitly instead of overwriting the lock.');
const pages = ['home', 'adult-compendium', 'occupation', 'walking', 'conditioning-exercise', 'running', 'bicycling', 'older-adult-compendium'];
const sources = [];
for (const page of pages) {
  const url = `https://pacompendium.com/${page === 'home' ? '' : `${page}/`}`;
  const path = `${root}/${page}.html`;
  let bytes;
  try { bytes = await readFile(path); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(path, bytes);
  }
  sources.push({ page, url, path, sha256: sha256(bytes) });
}
await writeFile(lockPath, JSON.stringify({ version: 1, edition: '2024', retrievedOn: new Date().toISOString().slice(0, 10), sources }, null, 2) + '\n');
console.log(`Pinned ${sources.length} official MET source pages; no public catalogs changed.`);
