// Run from the project root. Only --sanitize changes the designated locked page and its pin.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { sha256 } from './sources.mjs';
import { generateMetCatalog } from './met-data.mjs';
import { inspectMetHtml, sanitizeMetHtml } from './sanitize-met-html.mjs';

const mode = process.argv[2] ?? '--scan';
if (!['--scan', '--sanitize'].includes(mode) || process.argv.length > 3) throw new Error('Use --scan or --sanitize');
const lockPath = 'scripts/catalogs/met-source-lock.json';
const lock = JSON.parse(await readFile(lockPath, 'utf8'));
const names = ['home', 'adult-compendium', 'occupation', 'walking', 'conditioning-exercise', 'running', 'bicycling', 'older-adult-compendium'];
if (lock.sources.length !== names.length || new Set(lock.sources.map(source => source.page)).size !== names.length) throw new Error('Unexpected MET source count');
const pages = [];
for (const source of lock.sources) {
  if (!names.includes(source.page) || source.path !== `scripts/catalogs/met-sources/${source.page}.html`) throw new Error('Unexpected MET source path');
  const bytes = await readFile(source.path);
  if (sha256(bytes) !== source.sha256) throw new Error(`MET source hash mismatch: ${source.page}`);
  const html = bytes.toString('utf8');
  pages.push({ source, html, result: inspectMetHtml(html) });
}
const jwt = pages.reduce((sum, page) => sum + page.result.jwt, 0);
const targets = pages.reduce((sum, page) => sum + page.result.targets, 0);
console.log(`MET source classification: ${jwt} valid JWT header(s), ${targets} designated field(s) across ${pages.length} pinned pages.`);
async function checkServedAssets(originalValue) {
  for (const root of ['public', 'dist/entrena-con-jesus/browser']) {
    let files;
    try { files = await readdir(root, { recursive: true, withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const file of files) {
      if (!file.isFile()) continue;
      const bytes = await readFile(`${file.parentPath}/${file.name}`);
      if (originalValue && bytes.includes(originalValue)) throw new Error('Designated JWT present in served assets; no files changed');
      if (inspectMetHtml(bytes.toString('utf8')).jwt) throw new Error('Valid JWT present in served assets; no files changed');
    }
  }
}
if (mode === '--scan') {
  await checkServedAssets();
  console.log('Served assets: no valid JWT headers.');
}
if (mode === '--sanitize') {
  const home = pages.find(page => page.source.page === 'home');
  if (jwt !== 1 || targets !== 1 || !home.result.safeTarget || pages.some(page => page !== home && (page.result.jwt || page.result.targets))) {
    throw new Error('Expected exactly one verified home-page JWT; no files changed');
  }
  const { sanitized, count, originalValue } = sanitizeMetHtml(home.html);
  if (pages.some(page => page !== home && (page.result.jwt || page.result.targets)) || inspectMetHtml(sanitized).jwt) {
    throw new Error('Unsafe MET source survivor; no files changed');
  }
  // Check the exact in-memory value against served files; never print or persist it.
  await checkServedAssets(originalValue);
  const before = await generateMetCatalog();
  await writeFile(home.source.path, sanitized);
  home.source.sha256 = sha256(Buffer.from(sanitized));
  await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
  const current = await generateMetCatalog();
  const expected = structuredClone(before);
  expected.sources.find(source => source.page === 'home').sha256 = home.source.sha256;
  for (const entry of expected.entries) if (entry.source.url === home.source.url) entry.source.sha256 = home.source.sha256;
  if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('MET catalog changed beyond the sanitized page pin');
  console.log(`Sanitized ${count} designated JWT; ${current.entries.length} MET identities and values preserved.`);
}
