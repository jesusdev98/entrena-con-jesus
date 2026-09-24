import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { generateExerciseCatalog, validateExerciseCatalog, serialize, hash, exerciseStats, preserveFoodBytes } from './exercise-data.mjs';

export async function validateExerciseOutput(result, directory, built = false) {
  const expectedAssets = [...result.files.keys()].filter(path => path.startsWith('exercises/')).map(path => path.slice('exercises/'.length)).sort();
  assert.deepEqual((await readdir(`${directory}/exercises`)).sort(), expectedAssets, 'Unselected/unknown/missing exercise asset');
  for (const [path, bytes] of result.files) assert.deepEqual(await readFile(`${directory}/${path}`), bytes, `Stale or modified output: ${path}`);
  const files = await readdir(directory, { recursive: true });
  assert.ok(!files.some(path => /(?:^|[/\\])(?:\.catalog-cache|catalog-review|workout-manifest\.json|exercise-inventory\.json|poses-\d+\.png)(?:$|[/\\])/i.test(path)), 'Source inventory/review images leaked into output');
  if (!built) return;
  const worker = JSON.parse(await readFile(`${directory}/ngsw.json`, 'utf8'));
  const resources = JSON.parse(await readFile(`${directory}/resource-manifest.json`, 'utf8')).resources;
  const normalize = path => path.replace(/^\.\//, '').replace(/^\//, '');
  for (const paths of [resources, Object.keys(worker.hashTable), worker.assetGroups.flatMap(group => group.urls)]) {
    assert.deepEqual([...new Set(paths.map(normalize).filter(path => path.startsWith('exercises/')).map(path => path.slice('exercises/'.length)))].sort(), expectedAssets, 'Cache contains excluded/unselected artwork or omits a selected frame');
  }
  for (const [path, bytes] of result.files) {
    assert.equal(resources.filter(value => value === path).length, 1, `Readiness membership: ${path}`);
    assert.ok(worker.assetGroups.some(group => group.installMode === 'prefetch' && group.urls.includes(`./${path}`)), `Missing prefetch: ${path}`);
    assert.equal(worker.hashTable[`./${path}`], hash(bytes, 'sha1'), `Wrong worker hash: ${path}`);
  }
}

export async function validateExercises({ built = false } = {}) {
  await preserveFoodBytes('.', async () => {
    const result = await generateExerciseCatalog();
    const catalog = JSON.parse(await readFile('public/catalogs/exercises.es.json', 'utf8'));
    const inventoryBytes = await readFile('scripts/catalogs/exercise-inventory.json', 'utf8');
    validateExerciseCatalog(catalog, JSON.parse(inventoryBytes), result.input);
    assert.equal(inventoryBytes, serialize(result.inventory), 'Review/exclusion inventory is stale');
    await validateExerciseOutput(result, 'public');
    if (built) await validateExerciseOutput(result, 'dist/entrena-con-jesus/browser', true);
    console.log(JSON.stringify(exerciseStats(result), null, 2));
    console.log(`PASS: exercise partition, reviewed pairs, Spanish overlay, pinned SVG bytes/safety, attribution, exclusions and food preservation${built ? '; built bytes/readiness/prefetch hashes' : ''}.`);
  });
}

if (process.argv[1]?.endsWith('/validate-exercises.mjs') || process.argv[1]?.endsWith('\\validate-exercises.mjs')) {
  await validateExercises({ built: process.argv.includes('--built') });
}
