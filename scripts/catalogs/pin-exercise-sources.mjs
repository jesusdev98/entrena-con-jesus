// Explicit maintainer operation after reviewing an already verified cache; never called by generation.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { sha256, workoutRevision, workoutRoot } from './sources.mjs';

const manifestBytes = await readFile('.catalog-cache/workout-manifest.json');
const manifest = JSON.parse(manifestBytes);
const intake = JSON.parse(await readFile('.catalog-cache/artwork-hashes.json', 'utf8'));
assert.equal(intake.revision, workoutRevision);
assert.equal(manifest.length, 302);
const assets = {};
let bytes = 0;
for (const exercise of manifest) for (const frame of exercise.frames) {
  const file = `${exercise.slug}-${frame.index}.svg`;
  const content = await readFile(`.catalog-cache/${file}`);
  assert.equal(sha256(content), intake.files[file], `Intake hash mismatch: ${file}`);
  assets[file] = sha256(content); bytes += content.length;
}
assert.equal(Object.keys(assets).length, 906);
assert.equal(Object.keys(intake.files).length, 906);
const notices = {};
for (const file of ['LICENSE-ASSETS', 'LICENSES.md', 'ATTRIBUTION.md']) {
  notices[file] = sha256(await readFile(`.catalog-cache/${file}`));
}
const lock = { version: 1, revision: workoutRevision, manifestUrl: `${workoutRoot}/packages/workout-guide/manifest.json`,
  manifestSha256: sha256(manifestBytes), notices, assets };
await writeFile('scripts/catalogs/exercise-source-lock.json', JSON.stringify(lock, null, 2) + '\n');
console.log(JSON.stringify({ records: manifest.length, assets: Object.keys(assets).length, bytes,
  manifestSha256: lock.manifestSha256, foodSha256: sha256(await readFile('public/catalogs/foods.es.json')),
  equipment: [...new Set(manifest.map(item => item.equipment))],
  muscles: [...new Set(manifest.flatMap(item => [item.primaryMuscle, ...item.secondaryMuscles]))],
  loggingTypes: [...new Set(manifest.map(item => item.exerciseType))] }, null, 2));
