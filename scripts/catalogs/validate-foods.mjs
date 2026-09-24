import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { generateFoodCatalog, validateFoodCatalog } from './food-data.mjs';

const bytes = await readFile('public/catalogs/foods.es.json', 'utf8');
const catalog = JSON.parse(bytes);
validateFoodCatalog(catalog);
const expected = await generateFoodCatalog();
assert.equal(bytes, JSON.stringify(expected) + '\n', 'Food catalog differs from pinned sources/curation; regenerate it');
const notice = await readFile(`public/${catalog.licenseNotice}`, 'utf8');
assert.ok(notice.includes('CC0 1.0') && notice.includes('https://fdc.nal.usda.gov/'), 'Missing USDA license notice');
const publicFiles = await readdir('public', { recursive: true });
assert.ok(!publicFiles.some(path => /\.zip$|\.csv$|(^|[/\\])(?:foundation\.json|\.catalog-cache)(?:$|[/\\])/i.test(path)), 'Raw food sources leaked into public');
const counts = key => Object.fromEntries([...new Set(catalog.entries.map(key))]
  .map(value => [value, catalog.entries.filter(food => key(food) === value).length]));
console.log(`PASS: ${catalog.entries.length} unique foods; exact offline regeneration; source IDs, nutrients, units, provenance and public boundary verified.`);
console.log(JSON.stringify({ datasets: counts(food => food.source.dataset), groups: counts(food => food.group),
  preparation: counts(food => food.preparation), energy: counts(food => food.source.energyNutrientId), bytes: Buffer.byteLength(bytes) }, null, 2));

if (process.argv.includes('--built')) {
  const directory = 'dist/entrena-con-jesus/browser';
  const worker = JSON.parse(await readFile(`${directory}/ngsw.json`, 'utf8'));
  const resources = JSON.parse(await readFile(`${directory}/resource-manifest.json`, 'utf8')).resources;
  for (const [path, expectedBytes] of [['catalogs/foods.es.json', bytes], [catalog.licenseNotice, notice]]) {
    assert.equal(await readFile(`${directory}/${path}`, 'utf8'), expectedBytes, `Built artifact differs: ${path}`);
    assert.ok(resources.includes(path), `Missing readiness resource: ${path}`);
    assert.ok(worker.assetGroups.some(group => group.installMode === 'prefetch' && group.urls.includes(`./${path}`)),
      `Missing prefetch asset: ${path}`);
    assert.equal(worker.hashTable[`./${path}`], createHash('sha1').update(expectedBytes).digest('hex'), `Stale worker hash: ${path}`);
  }
  const files = await readdir(directory, { recursive: true });
  assert.ok(!files.some(path => /\.zip$|\.csv$|(^|[/\\])(?:foundation\.json|\.catalog-cache)(?:$|[/\\])/i.test(path)), 'Raw food sources leaked into build');
  console.log('PASS: built food catalog and notice match, both are in readiness/prefetch manifests with correct hashes; no raw archives/CSV/cache in build. Static evidence only.');
}
