import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, unlink, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { validateSvg } from './svg-validation.mjs';

export const revision = 'aac599224bb9780305239607ef98540b7e0ce389';
const sourceRoot = `https://raw.githubusercontent.com/bryllim/workout-guide/${revision}`;
const licenseUrl = 'https://creativecommons.org/licenses/by-sa/4.0/';
export const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
export const serialize = value => JSON.stringify(value) + '\n';
const text = value => typeof value === 'string' && value.trim().length > 0 && !/[<>\u0000-\u001f]|\b(?:placeholder|undefined)\b/i.test(value) && !/^(?:TODO|TBD)$/i.test(value.trim());
const unique = (values, message) => assert.equal(new Set(values).size, values.length, message);

const muscles = { Chest: 'Pecho', Triceps: 'Tríceps', Shoulders: 'Hombros', 'Rear Delts': 'Deltoides posteriores', 'Upper Back': 'Espalda alta', 'Posterior Chain': 'Cadena posterior', Hamstrings: 'Isquiotibiales', Back: 'Espalda', Lats: 'Dorsales', Biceps: 'Bíceps', Quads: 'Cuádriceps', Glutes: 'Glúteos', Calves: 'Pantorrillas', Forearms: 'Antebrazos', Core: 'Zona media', Legs: 'Piernas', 'Lower Back': 'Espalda baja', Adductors: 'Aductores', Mobility: 'Movilidad', Hips: 'Caderas', Abs: 'Abdominales', Abdominals: 'Abdominales', Traps: 'Trapecios', Grip: 'Agarre', Cardio: 'Cardiovascular', Groin: 'Ingle' };
const equipment = { Barbell: 'Barra', Dumbbell: 'Mancuernas', Machine: 'Máquina', Cable: 'Polea', Bodyweight: 'Peso corporal', Cardio: 'Equipo cardiovascular', Plate: 'Disco', Kettlebell: 'Pesa rusa', 'Pull-up Bar': 'Barra de dominadas', Bench: 'Banco', Wall: 'Pared', Chair: 'Silla', Doorway: 'Marco resistente', Towel: 'Toalla', Box: 'Cajón', 'Stability Ball': 'Pelota', 'Resistance Band': 'Banda elástica' };
const loggingTypes = { weight_reps: 'weight-reps', bodyweight_reps: 'bodyweight-reps', assisted_bodyweight: 'assisted-reps', duration: 'duration', distance_duration: 'distance-duration' };
const cardio = new Set(['running', 'walking', 'cycling', 'rowing', 'stair-climber', 'elliptical', 'jump-rope', 'assault-bike', 'skierg', 'treadmill-incline-walk', 'battle-ropes', 'mountain-climber', 'burpee', 'high-knees', 'jumping-jack', 'skater-hop', 'lateral-shuffle', 'fast-feet']);
const mobility = new Set(['cat-cow-stretch', 'arm-circles', 'worlds-greatest-stretch', 'leg-swings-stretch', 'hip-airplane']);
const category = source => mobility.has(source.slug) ? 'mobility' : source.isStretch ? 'stretching' : cardio.has(source.slug) ? 'cardio' : source.slug === 'farmer-carry' ? 'other' : 'strength';

export function parseOverlay(bytes) {
  const rows = bytes.trim().split(/\r?\n/).map(line => {
    const fields = line.split('|');
    assert.equal(fields.length, 5, 'Exercise overlay requires five fields');
    const [slug, name, instruction, selection, mode] = fields;
    assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(text(name) && name.length >= 5 && text(instruction) && instruction.length >= 40, `Incomplete Spanish overlay: ${slug}`);
    assert.ok(['movement', 'cycle', 'hold', 'blocked'].includes(mode), `Invalid presentation: ${slug}`);
    assert.match(selection, mode === 'blocked' ? /^0$/ : /^[123],[123]$/);
    const pair = mode === 'blocked' ? [] : selection.split(',').map(Number);
    unique(pair, `Repeated frame: ${slug}`);
    return { slug, name, instruction, pair, mode };
  });
  assert.equal(rows.length, 302, 'Spanish overlay must retain all 302 source rows');
  unique(rows.map(row => row.slug), 'Duplicate overlay slug');
  unique(rows.map(row => row.instruction), 'Repeated generic instruction');
  return rows;
}

export async function loadExerciseInputs() {
  const names = ['exercise-source-lock.json', 'media-blockers.json', 'exercise-unresolved.json', 'exercise-review-notes.json', 'exercise-review-policy.json', 'exercise-aliases.es.json', 'exercise-equipment.json', 'exercises.es.tsv'];
  const bytes = await Promise.all(names.map(name => readFile(`scripts/catalogs/${name}`, 'utf8')));
  const [lock, blockers, unresolved, notes, policy, aliases, equipmentOverrides] = bytes.slice(0, 7).map(value => JSON.parse(value));
  const manifestBytes = await readFile('.catalog-cache/workout-manifest.json');
  assert.equal(lock.revision, revision);
  assert.equal(policy.revision, revision);
  assert.equal(hash(manifestBytes), lock.manifestSha256, 'Pinned source manifest changed');
  const inputs = { lock, blockers, unresolved, notes, policy, aliases, equipmentOverrides,
    source: JSON.parse(manifestBytes), overlay: parseOverlay(bytes[7]),
    inputHashes: Object.fromEntries(names.map((name, index) => [name, hash(bytes[index])])) };
  validateInputs(inputs);
  return inputs;
}

export function validateInputs(input) {
  const { source, overlay, blockers, unresolved, policy, notes, lock } = input;
  assert.equal(source.length, 302);
  assert.equal(overlay.length, 302);
  unique(source.map(item => item.id), 'Duplicate source ID');
  unique(source.map(item => item.slug), 'Duplicate source slug');
  assert.equal(Object.keys(blockers).length, 47, 'Expected 47 blocked records');
  assert.equal(Object.keys(unresolved).length, 5, 'Expected 5 unresolved records');
  const excluded = [...Object.keys(blockers), ...Object.keys(unresolved)];
  unique(excluded, 'Blocked/unresolved overlap');
  assert.equal(source.filter(item => !excluded.includes(item.slug)).length, 250);
  for (const slug of excluded) {
    assert.ok(source.some(item => item.slug === slug), `Unknown exclusion: ${slug}`);
    assert.ok(text(blockers[slug] ?? unresolved[slug]), `Missing exclusion reason: ${slug}`);
  }
  for (const map of [input.aliases, input.equipmentOverrides, notes.overrides, policy.labels, policy.notes]) {
    for (const slug of Object.keys(map)) assert.ok(source.some(item => item.slug === slug), `Unknown curation key: ${slug}`);
  }
  const final = policy.finalReview;
  assert.equal(final.start, 193);
  assert.equal(final.end, 302);
  const exceptions = Object.values(final.pairExceptions).flat();
  unique(exceptions, 'Duplicate pair exception');
  for (const positions of [exceptions, final.blockedPositions, final.unresolvedPositions, final.holdPositions, final.referenceOnlyPositions, final.cyclePositions]) {
    unique(positions, 'Duplicate reviewed position');
    assert.ok(positions.every(n => Number.isInteger(n) && n >= 193 && n <= 302));
  }
  assert.deepEqual(source.flatMap((item, i) => i >= 192 && blockers[item.slug] ? [i + 1] : []), final.blockedPositions);
  assert.deepEqual(source.flatMap((item, i) => i >= 192 && unresolved[item.slug] ? [i + 1] : []), final.unresolvedPositions);
  const filenames = [];
  for (const [index, item] of source.entries()) {
    const row = overlay[index];
    assert.equal(row.slug, item.slug, 'Overlay/source order mismatch');
    assert.equal(row.mode === 'blocked', !!blockers[item.slug], `Blocker/overlay mismatch: ${item.slug}`);
    assert.ok(item.id === `exercise-${item.slug}`);
    assert.deepEqual(item.frames.map(frame => frame.index), [1, 2, 3]);
    for (const frame of item.frames) {
      assert.equal(frame.path, `assets/${item.slug}/frame-${frame.index}.svg`);
      const filename = `${item.slug}-${frame.index}.svg`;
      assert.match(lock.assets[filename], /^[a-f0-9]{64}$/);
      filenames.push(filename);
    }
    if (excluded.includes(item.slug)) continue;
    if (index >= 192) {
      const pair = Object.entries(final.pairExceptions).find(([, positions]) => positions.includes(index + 1))?.[0].split(',').map(Number) ?? final.defaultPair;
      assert.deepEqual(row.pair, pair, `Supplied reviewed pair mismatch: ${item.slug}`);
      assert.equal(row.mode, final.holdPositions.includes(index + 1) ? 'hold' : final.cyclePositions.includes(index + 1) ? 'cycle' : 'movement', `Reviewed mode mismatch: ${item.slug}`);
    }
    if (row.mode === 'hold') assert.equal(item.exerciseType, 'duration', `Hold logging: ${item.slug}`);
    assert.ok(equipment[item.equipment] && loggingTypes[item.exerciseType]);
    assert.ok([item.primaryMuscle, ...item.secondaryMuscles].every(value => muscles[value]), `Untranslated muscle: ${item.slug}`);
  }
  unique(filenames, 'Duplicate source frame');
  assert.deepEqual(Object.keys(lock.assets).sort(), filenames.sort(), 'Source lock must cover all 906 frames');
}

function equipmentFor(source, row, overrides) {
  const values = overrides[source.slug] ?? [equipment[source.equipment]];
  // Explicit support words in the curated variant supplement the upstream single equipment field.
  const supports = [/\bbanco\b/i.test(row.instruction) ? 'Banco' : null,
    /\bplataforma\b/i.test(row.instruction) && source.equipment === 'Dumbbell' ? 'Plataforma estable' : null,
    /\bcuña\b/i.test(row.instruction) ? 'Cuña estable' : null,
    /\bancla(?:je|da|do)\b/i.test(row.instruction) ? 'Anclaje estable' : null];
  return [...new Set([...values, ...supports.filter(Boolean)])];
}

function presentationFor(input, row, position) {
  const override = input.notes.overrides[row.slug];
  const labels = input.policy.labels[row.slug] ?? override?.labels ?? (row.mode === 'cycle' ? ['Fase de referencia A', 'Fase de referencia B'] : ['Posición de referencia A', 'Posición de referencia B']);
  if (row.mode === 'hold') assert.ok(override?.labels, `Hold needs reviewed posture labels: ${row.slug}`);
  const referenceOnly = input.policy.finalReview.referenceOnlyPositions.includes(position) || ['side-plank', 'cable-pallof-hold'].includes(row.slug);
  const description = row.mode === 'cycle' ? 'Dos fases de referencia; no muestran el ciclo completo ni todos los pasos intermedios.' : row.mode === 'hold' ? referenceOnly
    ? 'Dos referencias de postura; no muestran una repetición, activación muscular visible ni un aumento de recorrido.'
    : 'Preparación y postura sostenida; no representan repeticiones.'
    : 'Dos posiciones de referencia del movimiento; no describen por sí solas toda la técnica.';
  return { mode: row.mode, semantics: row.mode === 'cycle' ? 'partial-sequence' : row.mode === 'hold' ? referenceOnly ? 'static-references' : 'setup-to-hold' : 'position-pair', description, labels,
    review: { sourcePosition: position, evidence: position <= 192 ? 'earlier-overlay-and-source-pair-notes' : 'supplied-final-110-review',
      sheet: `poses-${String(Math.floor((position - 1) / 12) * 12 + 1).padStart(3, '0')}.png`,
      note: input.policy.notes[row.slug] ?? override?.note ?? input.notes.sheets[Math.floor((position - 1) / 12)].note } };
}

const localChanges = 'SVG bytes unchanged. Selected and ordered reviewed frames; added original Spanish names, aliases, instructions and presentation labels. No artwork recoloring or geometry changes.';
const collectionCredit = { author: 'Everkinetic', url: 'https://github.com/everkinetic/data', license: 'CC BY-SA 4.0', licenseUrl,
  scope: 'Original collection foundation; direct frame adaptations and their changes are identified separately in upstream attribution.' };

export async function generateExerciseCatalog(input) {
  input ??= await loadExerciseInputs();
  validateInputs(input);
  const files = new Map();
  for (const [name, expectedHash] of Object.entries(input.lock.notices)) {
    const bytes = await readFile(`.catalog-cache/${name}`);
    assert.equal(hash(bytes), expectedHash, `Pinned notice changed: ${name}`);
    files.set(`licenses/workout-guide-${name}.txt`, bytes);
  }
  const entries = [], records = [];
  for (const [index, source] of input.source.entries()) {
    const row = input.overlay[index];
    const reason = input.blockers[source.slug] ?? input.unresolved[source.slug];
    const status = input.blockers[source.slug] ? 'blocked' : input.unresolved[source.slug] ? 'unresolved' : 'accepted';
    const inventory = { sourcePosition: index + 1, id: source.id, slug: source.slug, originalName: source.name, status,
      sourceFrames: source.frames.map(frame => ({ frame: frame.index, path: frame.path, sha256: input.lock.assets[`${source.slug}-${frame.index}.svg`] })),
      selectedFrames: reason ? [] : row.pair, exclusionReason: reason ?? null };
    records.push(inventory);
    if (reason) continue;
    const presentation = presentationFor(input, row, index + 1);
    inventory.review = presentation.review;
    inventory.presentation = { mode: presentation.mode, semantics: presentation.semantics, labels: presentation.labels };
    const frames = [];
    for (const [order, number] of row.pair.entries()) {
      const frame = source.frames.find(value => value.index === number);
      const filename = `${source.slug}-${number}.svg`;
      const bytes = await readFile(`.catalog-cache/${filename}`);
      assert.equal(hash(bytes), input.lock.assets[filename], `Pinned SVG changed: ${filename}`);
      validateSvg(bytes.toString(), filename);
      const path = `exercises/${filename}`;
      files.set(path, bytes);
      frames.push({ path, frame: number, label: presentation.labels[order], sha256: hash(bytes),
        attribution: { ...frame.attribution, sourceUrl: `${sourceRoot}/packages/workout-guide/${frame.path}`,
          collectionCredit, localChanges } });
    }
    entries.push({ id: source.id, slug: source.slug, name: row.name, aliases: input.aliases[source.slug] ?? [], instruction: row.instruction,
      category: category(source), loggingType: loggingTypes[source.exerciseType], equipment: equipmentFor(source, row, input.equipmentOverrides),
      muscles: [...new Set([source.primaryMuscle, ...source.secondaryMuscles].map(value => muscles[value]))],
      media: { mode: presentation.mode, semantics: presentation.semantics, description: presentation.description, frames, review: presentation.review },
      source: { revision, originalName: source.name, originalEquipment: source.equipment, attribution: source.attribution } });
  }
  const noticePath = 'licenses/exercises-notice.txt';
  const notice = `Exercise artwork — Entrena con Jesús v1\n\n250 illustrated exercises, 500 selected SVG frames from 302 source records.\n52 exclusions (47 blocked, 5 unresolved) are unavailable in v1.\n\nWorkout Guide by Bryl Lim (https://bryllim.com), revision ${revision}\nhttps://github.com/bryllim/workout-guide/tree/${revision}\nArtwork license: CC BY-SA 4.0 — ${licenseUrl}\nOriginal collection foundation: Everkinetic — https://github.com/everkinetic/data\n${collectionCredit.scope}\n\nPer-frame source URLs, authors, licenses and original adaptation changes are in\ncatalogs/exercises.es.json. Upstream adaptation: transparent 512 × 512 rasterization,\nmonochrome recoloring and vector tracing where explicitly recorded by the source.\nLocal changes: ${localChanges}\n\nLicense text: workout-guide-LICENSE-ASSETS.txt\nOriginal attribution and licensing notices: workout-guide-ATTRIBUTION.md.txt and\nworkout-guide-LICENSES.md.txt. Keep credits and license links with redistributed\nartwork and derivatives; adapted artwork remains under CC BY-SA 4.0.\n\nVisual semantic curation is not clinical, biomechanical or coaching certification.\nStatic pairs are references or entry-to-hold; cyclic pairs omit intermediate phases.\n`;
  files.set(noticePath, Buffer.from(notice));
  const catalog = { version: 1, language: 'es', source: { revision, manifestSha256: input.lock.manifestSha256, license: 'CC-BY-SA-4.0' }, licenseNotice: noticePath, entries };
  const inventory = { version: 1, revision, manifestSha256: input.lock.manifestSha256, decision: input.policy.decision, inputHashes: input.inputHashes,
    counts: { source: 302, accepted: 250, blocked: 47, unresolved: 5, excluded: 52, selectedFrames: 500 }, records };
  validateExerciseCatalog(catalog, inventory, input);
  files.set('catalogs/exercises.es.json', Buffer.from(serialize(catalog)));
  return { catalog, inventory, files, input };
}

export function validateExerciseCatalog(catalog, inventory, input) {
  assert.equal(catalog.version, 1);
  assert.equal(catalog.language, 'es');
  assert.deepEqual(catalog.source, { revision, manifestSha256: input.lock.manifestSha256, license: 'CC-BY-SA-4.0' });
  assert.equal(catalog.licenseNotice, 'licenses/exercises-notice.txt');
  assert.equal(catalog.entries.length, 250, 'Exactly 250 accepted exercises required');
  unique(catalog.entries.map(item => item.id), 'Duplicate accepted ID');
  unique(catalog.entries.map(item => item.slug), 'Duplicate accepted slug');
  assert.equal(inventory.records.length, 302);
  unique(inventory.records.map(item => item.id), 'Duplicate inventory ID');
  unique(inventory.records.map(item => item.slug), 'Duplicate inventory slug');
  assert.equal(inventory.revision, revision);
  assert.equal(inventory.manifestSha256, input.lock.manifestSha256);
  assert.equal(inventory.decision, input.policy.decision);
  assert.deepEqual(inventory.inputHashes, input.inputHashes);
  assert.deepEqual(inventory.counts, { source: 302, accepted: 250, blocked: 47, unresolved: 5, excluded: 52, selectedFrames: 500 });
  for (const [index, record] of inventory.records.entries()) {
    const source = input.source[index];
    const expectedStatus = input.blockers[source.slug] ? 'blocked' : input.unresolved[source.slug] ? 'unresolved' : 'accepted';
    assert.equal(record.id, source.id);
    assert.equal(record.slug, source.slug);
    assert.equal(record.originalName, source.name);
    assert.equal(record.sourcePosition, index + 1);
    assert.equal(record.status, expectedStatus, `Exclusion status: ${source.slug}`);
    assert.equal(record.exclusionReason, input.blockers[source.slug] ?? input.unresolved[source.slug] ?? null);
    assert.deepEqual(record.selectedFrames, expectedStatus === 'accepted' ? input.overlay[index].pair : []);
    assert.deepEqual(record.sourceFrames, source.frames.map(frame => ({ frame: frame.index, path: frame.path, sha256: input.lock.assets[`${source.slug}-${frame.index}.svg`] })));
    if (expectedStatus === 'accepted') {
      const presentation = presentationFor(input, input.overlay[index], index + 1);
      assert.deepEqual(record.review, presentation.review);
      assert.deepEqual(record.presentation, { mode: presentation.mode, semantics: presentation.semantics, labels: presentation.labels });
    } else {
      assert.equal(record.review, undefined, 'Excluded record cannot claim accepted pair review');
      assert.equal(record.presentation, undefined);
    }
  }
  const accepted = inventory.records.filter(record => record.status === 'accepted');
  assert.deepEqual(catalog.entries.map(item => item.id), accepted.map(item => item.id), 'Accepted/excluded partition mismatch');
  for (const item of catalog.entries) {
    const index = input.source.findIndex(source => source.id === item.id);
    const source = input.source[index], row = input.overlay[index];
    const presentation = presentationFor(input, row, index + 1);
    assert.equal(item.slug, source.slug);
    assert.equal(item.name, row.name);
    assert.equal(item.instruction, row.instruction);
    assert.deepEqual(item.aliases, input.aliases[item.slug] ?? []);
    assert.ok(item.aliases.every(text));
    assert.equal(item.category, category(source));
    assert.equal(item.loggingType, loggingTypes[source.exerciseType]);
    assert.deepEqual(item.equipment, equipmentFor(source, row, input.equipmentOverrides));
    assert.ok(item.equipment.every(text));
    assert.deepEqual(item.muscles, [...new Set([source.primaryMuscle, ...source.secondaryMuscles].map(value => muscles[value]))]);
    assert.equal(item.media.mode, row.mode);
    assert.equal(item.media.semantics, presentation.semantics, `Dishonest presentation: ${item.slug}`);
    assert.equal(item.media.description, presentation.description);
    assert.deepEqual(item.media.review, presentation.review);
    assert.deepEqual(item.media.frames.map(frame => frame.frame), row.pair, `Reviewed pair changed: ${item.slug}`);
    assert.deepEqual(item.media.frames.map(frame => frame.label), presentation.labels, `Reviewed labels changed: ${item.slug}`);
    assert.ok(presentation.labels.every(text));
    assert.deepEqual(item.source, { revision, originalName: source.name, originalEquipment: source.equipment, attribution: source.attribution });
    for (const frame of item.media.frames) {
      const original = source.frames.find(value => value.index === frame.frame);
      assert.equal(frame.path, `exercises/${item.slug}-${frame.frame}.svg`, 'Nonlocal or incorrect frame path');
      assert.equal(frame.sha256, input.lock.assets[`${item.slug}-${frame.frame}.svg`]);
      assert.equal(frame.attribution.creator, 'Bryl Lim');
      assert.equal(frame.attribution.license, 'CC BY-SA 4.0');
      assert.equal(frame.attribution.licenseUrl, licenseUrl);
      assert.deepEqual(frame.attribution, { ...original.attribution, sourceUrl: `${sourceRoot}/packages/workout-guide/${original.path}`, collectionCredit, localChanges }, 'Frame attribution/changes lost');
    }
  }
}

export async function preserveFoodBytes(root, action) {
  const path = join(root, 'public/catalogs/foods.es.json');
  const before = await readFile(path);
  try { return await action(); }
  finally { assert.deepEqual(await readFile(path), before, 'Exercise pipeline changed food bytes'); }
}

export function assertOwnedAsset(filename, bytes, lock) {
  assert.ok(Object.hasOwn(lock.assets, filename), `Unknown exercise file retained; resolve manually: ${filename}`);
  assert.equal(hash(bytes), lock.assets[filename], `Modified/unknown exercise file retained: ${filename}`);
}

export async function publishExercises(result, root = '.') {
  return preserveFoodBytes(root, async () => {
    const directory = join(root, 'public/exercises');
    await mkdir(directory, { recursive: true });
    assert.ok(!(await lstat(directory)).isSymbolicLink(), 'Generated directory must not be a symlink');
    const stale = [];
    // Preflight every existing asset before writing or deleting anything. A name alone is not ownership.
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      assert.ok(entry.isFile(), `Unknown exercise entry retained: ${entry.name}`);
      assertOwnedAsset(entry.name, await readFile(join(directory, entry.name)), result.input.lock);
      if (!result.files.has(`exercises/${entry.name}`)) stale.push(entry.name);
    }
    for (const [path, bytes] of result.files) {
      assert.match(path, /^(?:exercises\/[a-z0-9-]+\.svg|catalogs\/exercises\.es\.json|licenses\/(?:workout-guide-[A-Za-z.-]+|exercises-notice)\.txt)$/);
      const output = join(root, 'public', path);
      await mkdir(join(output, '..'), { recursive: true });
      try { assert.ok((await lstat(output)).isFile(), `Refusing non-file output: ${output}`); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      await writeFile(output, bytes);
    }
    for (const filename of stale) await unlink(join(directory, filename));
    await writeFile(join(root, 'scripts/catalogs/exercise-inventory.json'), serialize(result.inventory));
    return { removed: stale.length, foodSha256: hash(await readFile(join(root, 'public/catalogs/foods.es.json'))) };
  });
}

export function exerciseStats(result) {
  const countBy = key => Object.fromEntries([...new Set(result.catalog.entries.map(key))].map(value => [value, result.catalog.entries.filter(item => key(item) === value).length]));
  const assetBytes = [...result.files].filter(([path]) => path.startsWith('exercises/')).reduce((sum, [, bytes]) => sum + bytes.length, 0);
  return { ...result.inventory.counts, categories: countBy(item => item.category), presentation: countBy(item => item.media.mode),
    catalogBytes: result.files.get('catalogs/exercises.es.json').length, assetBytes,
    totalPublicBytes: [...result.files.values()].reduce((sum, bytes) => sum + bytes.length, 0) };
}
