import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { generateMetCatalog, validateMetCatalog, notice, noticePath } from './met-data.mjs';

export function verifyMetBuiltFile(path, expected, actual, resources, worker) {
  assert.equal(actual, expected, `Built MET bytes differ: ${path}`);
  assert.ok(resources.includes(path), `Missing MET readiness resource: ${path}`);
  assert.ok(worker.assetGroups.some(group => group.installMode === 'prefetch' && group.urls.includes(`./${path}`)), `Missing MET prefetch: ${path}`);
  assert.equal(worker.hashTable[`./${path}`], createHash('sha1').update(expected).digest('hex'), `Stale MET worker hash: ${path}`);
}

export async function validateMets({ built = false } = {}) {
  const bytes = await readFile('public/catalogs/activity-mets.json', 'utf8');
  validateMetCatalog(JSON.parse(bytes));
  assert.equal(bytes, JSON.stringify(await generateMetCatalog()) + '\n', 'MET catalog differs from pinned primary pages/Spanish selection');
  assert.equal(await readFile(`public/${noticePath}`, 'utf8'), notice);
  for (const directory of ['public', ...(built ? ['dist/entrena-con-jesus/browser'] : [])]) {
    const files = await readdir(directory, { recursive: true });
    assert.ok(!files.some(path => /met-sources|met-source-lock|mets\.es\.tsv/.test(path)), 'Raw MET sources leaked into served assets');
  }
  if (built) {
    const root = 'dist/entrena-con-jesus/browser';
    const worker = JSON.parse(await readFile(`${root}/ngsw.json`, 'utf8'));
    const resources = JSON.parse(await readFile(`${root}/resource-manifest.json`, 'utf8')).resources;
    for (const [path, expected] of [['catalogs/activity-mets.json', bytes], [noticePath, notice]]) {
      verifyMetBuiltFile(path, expected, await readFile(`${root}/${path}`, 'utf8'), resources, worker);
    }
  }
  console.log(`PASS: 31 MET entries; exact primary-source extraction, hashes, table baselines, Spanish curation and citation${built ? '; built bytes/readiness/prefetch hashes' : ''}. ${Buffer.byteLength(bytes)} catalog bytes. Static evidence only.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await validateMets({ built: process.argv.includes('--built') });
