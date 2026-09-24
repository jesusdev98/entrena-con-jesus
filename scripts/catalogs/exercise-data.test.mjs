import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateExerciseCatalog, loadExerciseInputs, validateInputs, validateExerciseCatalog, parseOverlay, publishExercises, preserveFoodBytes, hash, serialize } from './exercise-data.mjs';
import { validateExerciseOutput } from './validate-exercises.mjs';
import { validateSvg } from './svg-validation.mjs';

let result, input;
before(async () => {
  input = await loadExerciseInputs();
  result = await generateExerciseCatalog(input);
});
const entry = slug => result.catalog.entries.find(item => item.slug === slug);
const copy = value => structuredClone(value);
const rejectsCatalog = mutate => {
  const catalog = copy(result.catalog), inventory = copy(result.inventory);
  mutate(catalog, inventory);
  assert.throws(() => validateExerciseCatalog(catalog, inventory, input));
};
const rejectsInput = mutate => {
  const changed = copy(input);
  mutate(changed);
  assert.throws(() => validateInputs(changed));
};

test('pinned inventory partitions 302 distinct identities into 250 accepted and 52 excluded', () => {
  assert.equal(result.catalog.entries.length, 250);
  assert.equal(result.inventory.records.filter(item => item.status === 'blocked').length, 47);
  assert.equal(result.inventory.records.filter(item => item.status === 'unresolved').length, 5);
  assert.equal(new Set(result.inventory.records.map(item => item.id)).size, 302);
  assert.equal([...result.files.keys()].filter(path => path.endsWith('.svg')).length, 500);
  assert.deepEqual(result.inventory.records.filter(item => item.status === 'unresolved').map(item => item.slug),
    ['scapular-push-up', 'scapular-pull-up', 'banded-hip-thrust', 'banded-pallof-press', 'sprawl']);
});

test('rejects duplicate identities, missing source rows and overlapping exclusions', () => {
  rejectsCatalog(catalog => { catalog.entries[1].id = catalog.entries[0].id; });
  rejectsCatalog((catalog, inventory) => { inventory.records.pop(); });
  rejectsCatalog((catalog, inventory) => { inventory.records[1] = inventory.records[0]; });
  rejectsInput(value => { value.unresolved['pec-deck'] = value.unresolved.sprawl; delete value.unresolved.sprawl; });
  rejectsInput(value => { value.source[1].id = value.source[0].id; });
});

test('rejects publishing excluded records or losing exclusion reasons', () => {
  rejectsCatalog(catalog => { catalog.entries[0].id = 'exercise-pec-deck'; });
  rejectsCatalog((catalog, inventory) => { inventory.records.find(item => item.status === 'blocked').exclusionReason = ''; });
  rejectsCatalog((catalog, inventory) => { inventory.records.find(item => item.status === 'unresolved').selectedFrames = [1, 3]; });
  rejectsInput(value => { value.blockers['unknown-source'] = value.blockers['pec-deck']; delete value.blockers['pec-deck']; });
});

test('independent reviewed examples cover reversals, non-default pairs and the earlier review', () => {
  const expected = { 'bench-press': [3, 1], 'romanian-deadlift': [1, 3], 'dumbbell-fly': [1, 2], 'bird-dog': [2, 1],
    'typewriter-push-up': [1, 3], 'explosive-push-up': [2, 3], 'negative-pull-up': [3, 1], 'shrimp-squat': [3, 2],
    'glute-bridge-march': [2, 1], 'flutter-kick': [1, 2], inchworm: [2, 3], 'arm-circles': [1, 3],
    'seated-forward-fold-stretch': [3, 2], 'butterfly-stretch': [1, 2] };
  for (const [slug, pair] of Object.entries(expected)) assert.deepEqual(entry(slug).media.frames.map(frame => frame.frame), pair, slug);
  assert.equal(entry('negative-pull-up').media.frames[1].label, 'Descenso con brazos extendidos');
  assert.equal(entry('glute-bridge-march').media.frames[0].label, 'Puente con ambos pies');
  assert.equal(entry('arm-circles').media.frames[0].label, 'Dirección circular indicada');
});

test('rejects unreviewed pairs, invalid frame numbers and duplicate exceptions', () => {
  rejectsCatalog(catalog => { catalog.entries[0].media.frames.reverse(); });
  rejectsCatalog(catalog => { catalog.entries[0].media.frames[0].frame = 4; });
  rejectsInput(value => { value.overlay[298].pair = [3, 1]; });
  rejectsInput(value => { value.policy.finalReview.pairExceptions['2,3'].push(193); });
  rejectsCatalog((catalog, inventory) => { inventory.records[0].presentation.labels.reverse(); });
});

test('selected source hash changes are rejected before publication', async () => {
  const changed = copy(input);
  changed.lock.assets['bench-press-3.svg'] = '0'.repeat(64);
  await assert.rejects(generateExerciseCatalog(changed), /Pinned SVG changed/);
});

test('filtered category coverage is measured from accepted entries only', () => {
  const counts = {};
  for (const item of result.catalog.entries) counts[item.category] = (counts[item.category] ?? 0) + 1;
  assert.deepEqual(counts, { strength: 217, cardio: 18, other: 1, mobility: 5, stretching: 9 });
});

test('static references never claim visible activation or repetitions', () => {
  for (const slug of ['dead-hang', 'active-hang', 'copenhagen-plank', 'kneeling-hip-flexor-stretch', 'wall-calf-stretch', 'cable-pallof-hold']) {
    const item = entry(slug);
    assert.equal(item.loggingType, 'duration');
    assert.equal(item.media.semantics, 'static-references');
    assert.ok(item.media.frames.every(frame => !/inicial|final|activ|repetición/i.test(frame.label)));
  }
  assert.equal(entry('superman-hold').media.semantics, 'setup-to-hold');
  rejectsCatalog(catalog => { catalog.entries.find(item => item.slug === 'active-hang').media.semantics = 'position-pair'; });
  rejectsCatalog(catalog => { catalog.entries.find(item => item.slug === 'dead-hang').media.frames[0].label = 'Posición inicial'; });
});

test('cycles explicitly omit complete-cycle claims and orientation is not travel', () => {
  for (const slug of ['explosive-push-up', 'hindu-push-up', 'glute-bridge-march', 'crab-walk', 'burpee', 'arm-circles']) {
    assert.equal(entry(slug).media.semantics, 'partial-sequence');
    assert.match(entry(slug).media.description, /no muestran el ciclo completo/);
  }
  assert.match(entry('crab-walk').media.review.note, /not evidence of forward travel/);
  assert.ok(entry('crab-walk').media.frames.every(frame => !/avance|adelante/i.test(frame.label)));
  rejectsCatalog(catalog => { catalog.entries.find(item => item.slug === 'burpee').media.description = 'Ciclo completo'; });
});

test('equipment includes illustrated supports despite upstream Bodyweight classification', () => {
  const expected = { dip: 'Paralelas', 'handstand-push-up': 'Paralelas bajas', 'sissy-squat': 'Barandilla de apoyo',
    'copenhagen-plank': 'Banco', 'fast-feet': 'Escalera de agilidad', 'pull-up': 'Barra de dominadas', 'dragon-flag': 'Espaldera o soporte fijo' };
  for (const [slug, support] of Object.entries(expected)) assert.ok(entry(slug).equipment.includes(support), slug);
  assert.equal(entry('assisted-pull-up').loggingType, 'assisted-reps');
  assert.equal(entry('weighted-pull-up').loggingType, 'weight-reps');
  assert.equal(entry('farmer-carry').loggingType, 'distance-duration');
  rejectsCatalog(catalog => { catalog.entries.find(item => item.slug === 'dip').equipment = ['Sin equipo']; });
});

test('Spanish overlay coverage, specific instructions and aliases are preserved', async () => {
  const bytes = await readFile('scripts/catalogs/exercises.es.tsv', 'utf8');
  assert.equal(parseOverlay(bytes).length, 302);
  assert.match(input.overlay.find(row => row.slug === 'step-up').instruction, /todo el pie/);
  assert.throws(() => parseOverlay(bytes.replace('Press de banca con barra', '')));
  assert.throws(() => parseOverlay(bytes.split('\n').slice(1).join('\n')));
  assert.throws(() => parseOverlay(bytes.replace('3,1|movement', '1,1|movement')));
  rejectsCatalog(catalog => { catalog.entries[0].instruction = 'Realiza el movimiento correctamente.'; });
  rejectsCatalog(catalog => { catalog.entries[0].aliases = []; });
});

test('every frame retains exact license, source pin, changes and qualified collection credit', () => {
  const bench = entry('bench-press').media.frames;
  assert.equal(bench[0].attribution.creator, 'Bryl Lim');
  assert.equal(bench[0].attribution.source, undefined, 'Do not fabricate direct Everkinetic origin for added frame 3');
  assert.equal(bench[1].attribution.source.name, 'Everkinetic');
  assert.match(bench[1].attribution.source.changes, /vector-traced/);
  assert.equal(bench[0].attribution.collectionCredit.author, 'Everkinetic');
  assert.match(bench[0].attribution.localChanges, /SVG bytes unchanged/);
  rejectsCatalog(catalog => { delete catalog.entries[0].media.frames[1].attribution.source.changes; });
  rejectsCatalog(catalog => { catalog.entries[0].media.frames[0].attribution.license = 'MIT'; });
  rejectsCatalog(catalog => { catalog.entries[0].media.frames[0].path = 'https://example.org/image.svg'; });
  rejectsCatalog(catalog => { catalog.entries[0].media.frames[0].sha256 = '0'.repeat(64); });
});

const svg = content => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${content}<path d="M0 0L1 1"/></svg>`;
for (const [name, content] of Object.entries({ script: '<script>alert(1)</script>', image: '<image href="https://example.org/a.png"/>',
  event: '<path onload="alert(1)"/>', style: '<path style="fill:red"/>', external: '<path fill="url(https://example.org/a)"/>',
  escapedCss: '<path fill="u\\72l(https://example.org/a)"/>', comments: '<path fill="u/**/rl(https://example.org/a)"/>',
  entityAttribute: '<path fill="url(&#104;ttps://example.org/a)"/>', missingReference: '<path fill="url(#missing)"/>',
  foreignNamespace: '<path xmlns="http://www.w3.org/1999/xhtml"/>', animation: '<animate attributeName="fill"/>',
  xmlBase: '<g xml:base="https://example.org/"/>' })) {
  test(`SVG rejects ${name}`, () => assert.throws(() => validateSvg(svg(content), name)));
}
test('SVG accepts self-contained paths/local references and rejects malformed XML/DTD/empty canvas', () => {
  validateSvg(svg('<defs><linearGradient id="paint"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path fill="url(#paint)"/>'), 'local');
  for (const bytes of ['<!DOCTYPE svg>' + svg(''), '<?xml-stylesheet href="x"?>' + svg(''), svg('<g>'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"/>']) assert.throws(() => validateSvg(bytes, 'invalid'));
});

async function sandbox(action) {
  const root = await mkdtemp(join(tmpdir(), 'exercise-pipeline-'));
  try {
    await mkdir(join(root, 'public/catalogs'), { recursive: true });
    await mkdir(join(root, 'public/exercises'), { recursive: true });
    await mkdir(join(root, 'scripts/catalogs'), { recursive: true });
    await writeFile(join(root, 'public/catalogs/foods.es.json'), Buffer.from([0, 255, 10, 13, 65]));
    await action(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('generation is idempotent, preserves food bytes, and removes only pinned stale exercise assets', async () => {
  await sandbox(async root => {
    const before = await readFile(join(root, 'public/catalogs/foods.es.json'));
    await writeFile(join(root, 'public/exercises/pec-deck-1.svg'), await readFile('.catalog-cache/pec-deck-1.svg'));
    await writeFile(join(root, 'public/keep-user-file.txt'), 'user file');
    const first = await publishExercises(result, root);
    assert.equal(first.removed, 1);
    const second = await publishExercises(result, root);
    assert.equal(second.removed, 0);
    assert.equal(first.foodSha256, hash(before));
    assert.deepEqual(await readFile(join(root, 'public/catalogs/foods.es.json')), before);
    assert.equal(await readFile(join(root, 'public/keep-user-file.txt'), 'utf8'), 'user file');
    assert.equal((await readdir(join(root, 'public/exercises'))).length, 500);
    assert.equal(await readFile(join(root, 'scripts/catalogs/exercise-inventory.json'), 'utf8'), serialize(result.inventory));
    await validateExerciseOutput(result, join(root, 'public'));
  });
});

test('unknown and modified files abort cleanup before any generated output is written', async () => {
  for (const name of ['user-picture.svg', 'pec-deck-1.svg']) await sandbox(async root => {
    const path = join(root, 'public/exercises', name);
    await writeFile(path, 'user bytes');
    await assert.rejects(publishExercises(result, root), /Unknown|Modified/);
    assert.equal(await readFile(path, 'utf8'), 'user bytes');
    assert.deepEqual(await readdir(join(root, 'public/exercises')), [name]);
  });
});

test('food-byte guard detects changes even on a failing generation path', async () => {
  await sandbox(async root => {
    await assert.rejects(preserveFoodBytes(root, async () => {
      await writeFile(join(root, 'public/catalogs/foods.es.json'), 'changed');
      throw new Error('original generation error');
    }), /changed food bytes/);
  });
});

test('built validator detects stale hashes, missing prefetch/readiness and excluded artwork', async () => {
  await sandbox(async root => {
    await publishExercises(result, root);
    const directory = join(root, 'public');
    const resources = [...result.files.keys()];
    const worker = { hashTable: Object.fromEntries([...result.files].map(([path, bytes]) => [`./${path}`, hash(bytes, 'sha1')])),
      assetGroups: [{ installMode: 'prefetch', urls: resources.map(path => `./${path}`) }] };
    const writeManifests = async (sw, required) => {
      await writeFile(join(directory, 'ngsw.json'), serialize(sw));
      await writeFile(join(directory, 'resource-manifest.json'), serialize({ resources: required }));
    };
    await writeManifests(worker, resources);
    await validateExerciseOutput(result, directory, true);
    const brokenHash = copy(worker); brokenHash.hashTable['./exercises/bench-press-3.svg'] = 'bad';
    await writeManifests(brokenHash, resources);
    await assert.rejects(validateExerciseOutput(result, directory, true), /Wrong worker hash/);
    const lazy = copy(worker); lazy.assetGroups[0].installMode = 'lazy';
    await writeManifests(lazy, resources);
    await assert.rejects(validateExerciseOutput(result, directory, true), /Missing prefetch/);
    await writeManifests(worker, resources.filter(path => path !== 'catalogs/exercises.es.json'));
    await assert.rejects(validateExerciseOutput(result, directory, true), /Readiness membership/);
    const leaked = copy(worker); leaked.assetGroups[0].urls.push('./exercises/pec-deck-1.svg');
    await writeManifests(leaked, resources);
    await assert.rejects(validateExerciseOutput(result, directory, true), /Cache contains/);
    await writeManifests(worker, resources);
    await writeFile(join(directory, 'exercises/pec-deck-1.svg'), await readFile('.catalog-cache/pec-deck-1.svg'));
    await assert.rejects(validateExerciseOutput(result, directory, true), /Unselected/);
  });
});
