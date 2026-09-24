import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { download, workoutRoot, workoutRevision, foundationUrl, foundationHash, sha256, zipMembers } from './sources.mjs';
import { csvRows } from './csv.mjs';
import { validateSvg } from './svg-validation.mjs';

const srUrl = 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip';
const srHash = 'b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0';
const readTsv = async name => (await readFile(`scripts/catalogs/${name}.es.tsv`, 'utf8')).trim().split('\n').map(line => line.split('|'));
const manifestBytes = await download(`${workoutRoot}/packages/workout-guide/manifest.json`, 'workout-manifest.json');
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.length, 302);
const presentation = await readTsv('exercises');
const bySlug = new Map(presentation.map(row => [row[0], row]));
assert.equal(bySlug.size, 302, 'Every source exercise needs independent curation');
const blockers = JSON.parse(await readFile('scripts/catalogs/media-blockers.json', 'utf8'));
const muscleLabels = { Chest: 'Pecho', Triceps: 'Tríceps', Shoulders: 'Hombros', 'Rear Delts': 'Deltoides posteriores', 'Upper Back': 'Espalda alta', 'Posterior Chain': 'Cadena posterior', Hamstrings: 'Isquiotibiales', Back: 'Espalda', Lats: 'Dorsales', Biceps: 'Bíceps', Quads: 'Cuádriceps', Glutes: 'Glúteos', Calves: 'Pantorrillas', Forearms: 'Antebrazos', Core: 'Zona media', Legs: 'Piernas', 'Lower Back': 'Espalda baja', Adductors: 'Aductores', Mobility: 'Movilidad', Hips: 'Caderas', Abs: 'Abdominales', Abdominals: 'Abdominales', Traps: 'Trapecios' };
const equipmentLabels = { Barbell: 'Barra', Dumbbell: 'Mancuernas', Machine: 'Máquina', Cable: 'Polea', Bodyweight: 'Peso corporal', Cardio: 'Equipo cardiovascular', Plate: 'Disco', Kettlebell: 'Pesa rusa', 'Pull-up Bar': 'Barra de dominadas', Bench: 'Banco', Wall: 'Pared', Chair: 'Silla', Doorway: 'Marco', Towel: 'Toalla', Box: 'Cajón', 'Stability Ball': 'Pelota', 'Resistance Band': 'Banda elástica' };
const loggingTypes = { weight_reps: 'weight-reps', bodyweight_reps: 'bodyweight-reps', assisted_bodyweight: 'assisted-reps', duration: 'duration', distance_duration: 'distance-duration' };
Object.assign(muscleLabels, { Grip: 'Agarre', Cardio: 'Cardiovascular', Groin: 'Ingle' });
const spanishAliases = { 'bench-press': ['Press de pecho', 'Banca plana'], squat: ['Sentadillas'], 'push-up': ['Lagartijas', 'Flexión'], 'pull-up': ['Dominada'], running: ['Correr', 'Trote'], cycling: ['Bicicleta', 'Bici'], walking: ['Caminar', 'Andar'], 'deadlift': ['Peso muerto convencional'], 'lat-pulldown': ['Jalón dorsal'], 'glute-bridge': ['Elevación de pelvis'] };
const cardio = new Set(['running','walking','cycling','rowing','stair-climber','elliptical','swimming','jump-rope','assault-bike','skierg','hiking','treadmill-incline-walk','battle-ropes','mountain-climber','burpee','half-burpee','squat-thrust','high-knees','jumping-jack','skater-hop','lateral-shuffle','fast-feet','sprawl','seal-jack','plank-jack']);
const mobility = new Set(['cat-cow-stretch','arm-circles','worlds-greatest-stretch','leg-swings-stretch','torso-twist-stretch','hip-airplane']);
await Promise.all(['public/catalogs','public/exercises','public/licenses'].map(path => mkdir(path, { recursive: true })));
let assetBytes = 0, assetCount = 0;
const exercises = [];
for (const [index, source] of manifest.entries()) {
  const [, name, instruction, selection, mode] = bySlug.get(source.slug) ?? [];
  assert.ok(name && instruction && selection && mode, source.slug);
  const frames = [];
  for (const [position, number] of (selection === '0' ? [] : selection.split(',').map(Number)).entries()) {
    const frame = source.frames.find(frame => frame.index === number);
    assert.ok(frame, source.slug);
    const original = await download(`${workoutRoot}/packages/workout-guide/${frame.path}`, `${source.slug}-${number}.svg`);
    validateSvg(original.toString(), frame.path);
    const path = `exercises/${source.slug}-${number}.svg`;
    await writeFile(`public/${path}`, original);
    frames.push({ path, sha256: sha256(original), frame: number,
      label: mode === 'cycle' ? ['Fase A', 'Fase B'][position] : mode === 'hold' ? ['Apoyo y alineación', 'Postura sostenida'][position] : ['Posición inicial', 'Posición de trabajo'][position],
      attribution: frame.attribution });
    assetBytes += original.length; assetCount++;
  }
  assert.equal(frames.length, mode === 'blocked' ? 0 : 2);
  assert.equal(!!blockers[source.slug], mode === 'blocked');
  const muscles = [source.primaryMuscle, ...source.secondaryMuscles].map(value => {
    assert.ok(muscleLabels[value], `Untranslated muscle ${value}`); return muscleLabels[value];
  });
  assert.ok(equipmentLabels[source.equipment]);
  exercises.push({ id: source.id, slug: source.slug, name, aliases: [source.name, ...(spanishAliases[source.slug] ?? [])], instruction,
    category: mobility.has(source.slug) ? 'mobility' : source.isStretch ? 'stretching' : cardio.has(source.slug) ? 'cardio' : source.slug === 'farmer-carry' ? 'other' : 'strength',
    loggingType: loggingTypes[source.exerciseType], equipment: equipmentLabels[source.equipment], muscles,
    media: { mode, frames, issue: blockers[source.slug] ?? null, reviewedSheet: `poses-${String(Math.floor(index / 12) * 12 + 1).padStart(3, '0')}.png` },
    source: { revision: workoutRevision, originalName: source.name, attribution: source.attribution },
  });
}

const curatedFoods = await readTsv('foods');
const foundationZip = await download(foundationUrl, 'foundation.zip', foundationHash);
const foundation = JSON.parse(zipMembers(foundationZip).find(file => file.name.endsWith('.json')).read()).FoundationFoods.filter(Boolean);
const sourceFoods = new Map(foundation.map(food => [food.fdcId, food]));
const srZip = await download(srUrl, 'sr-legacy.zip', srHash);
const members = zipMembers(srZip);
const member = name => members.find(member => member.name === name || member.name.endsWith(`/${name}`)).read().toString();
const srWanted = new Set(curatedFoods.filter(row => row[0] === 'sr-legacy').map(row => Number(row[1])));
const srFoodRows = csvRows(member('food.csv')); const foodHeader = srFoodRows.next().value;
const srCategories = new Map([...csvRows(member('food_category.csv'))].slice(1).map(row => [row[0], row[2]]));
for (const row of srFoodRows) {
  const id = Number(row[foodHeader.indexOf('fdc_id')]);
  if (srWanted.has(id)) sourceFoods.set(id, { fdcId: id, description: row[foodHeader.indexOf('description')], foodCategory: { description: srCategories.get(row[foodHeader.indexOf('food_category_id')]) }, foodNutrients: [] });
}
const nutrientUnits = new Map([...csvRows(member('nutrient.csv'))].slice(1).map(row => [Number(row[0]), row[2]]));
const nutrientRows = csvRows(member('food_nutrient.csv')); const nutrientHeader = nutrientRows.next().value;
for (const row of nutrientRows) {
  const id = Number(row[nutrientHeader.indexOf('fdc_id')]);
  if (!srWanted.has(id)) continue;
  const nutrientId = Number(row[nutrientHeader.indexOf('nutrient_id')]);
  if (![1003,1004,1005,1008,2047,2048,1051].includes(nutrientId)) continue;
  const raw = row[nutrientHeader.indexOf('amount')];
  sourceFoods.get(id).foodNutrients.push({ nutrient: { id: nutrientId, unitName: nutrientUnits.get(nutrientId) }, amount: raw === '' ? null : Number(raw) });
}
const groupLabels = { 'Legumes and Legume Products': 'Legumbres', 'Vegetables and Vegetable Products': 'Verduras', 'Sausages and Luncheon Meats': 'Embutidos', 'Nut and Seed Products': 'Frutos secos y semillas', 'Dairy and Egg Products': 'Lácteos y huevos', 'Fruits and Fruit Juices': 'Frutas y zumos', 'Spices and Herbs': 'Condimentos', 'Fats and Oils': 'Aceites y grasas', 'Poultry Products': 'Aves', 'Soups, Sauces, and Gravies': 'Salsas', 'Baked Products': 'Panadería', 'Finfish and Shellfish Products': 'Pescados y mariscos', 'Beef Products': 'Vacuno', 'Pork Products': 'Cerdo', Sweets: 'Dulces', 'Cereal Grains and Pasta': 'Cereales y pasta', Beverages: 'Bebidas' };
const foods = curatedFoods.map(([dataset, idText, name, preparation]) => {
  const food = sourceFoods.get(Number(idText)); assert.ok(food, idText);
  const nutrients = new Map(food.foodNutrients.map(row => [row.nutrient.id, row]));
  const energy = [2048,2047,1008].map(id => nutrients.get(id)).find(Boolean);
  const rows = [energy, nutrients.get(1003), nutrients.get(1005), nutrients.get(1004)];
  assert.ok(rows.every(row => row && Number.isFinite(row.amount) && row.amount >= 0), idText);
  assert.equal(energy.nutrient.unitName.toLowerCase(), 'kcal');
  for (const row of rows.slice(1)) assert.equal(row.nutrient.unitName.toLowerCase(), 'g');
  assert.notEqual(nutrients.get(1051)?.amount, 0, `Zero-moisture research record: ${idText}`);
  const group = groupLabels[food.foodCategory.description]; assert.ok(group, food.foodCategory.description);
  return { id: `fdc-${idText}`, name, aliases: [], group, preparation, per100g: { kcal: rows[0].amount, protein: rows[1].amount, carbohydrate: rows[2].amount, fat: rows[3].amount },
    source: { fdcId: idText, dataset, release: dataset === 'foundation' ? '2026-04-30' : '2018-04', sha256: dataset === 'foundation' ? foundationHash : srHash,
      originalDescription: food.description, originalGroup: food.foodCategory.description, energyNutrientId: energy.nutrient.id, units: { energy: 'kcal', macros: 'g', basis: '100 g edible portion' },
      url: `https://fdc.nal.usda.gov/food-details/${idText}/nutrients`, license: 'CC0-1.0' } };
});
assert.ok(foods.length >= 150);
for (const name of ['LICENSE-ASSETS', 'LICENSES.md', 'ATTRIBUTION.md']) {
  await download(`${workoutRoot}/${name}`, name);
  await copyFile(`.catalog-cache/${name}`, `public/licenses/workout-guide-${name}.txt`);
}
const sourceLock = { schemaVersion: 1, workoutGuide: { revision: workoutRevision, manifestSha256: sha256(manifestBytes), license: 'CC-BY-SA-4.0' }, foundation: { url: foundationUrl, sha256: foundationHash }, srLegacy: { url: srUrl, sha256: srHash } };
await writeFile('scripts/catalogs/source-lock.json', JSON.stringify(sourceLock, null, 2));
await writeFile('public/catalogs/exercises.es.json', JSON.stringify({ version: 1, source: sourceLock.workoutGuide, entries: exercises }));
await writeFile('public/catalogs/foods.es.json', JSON.stringify({ version: 1, entries: foods }));
await writeFile('public/catalogs/provenance.json', JSON.stringify({ ...sourceLock, counts: { exercises: exercises.length, illustrated: exercises.filter(item => item.media.frames.length === 2).length, mediaBlocked: Object.keys(blockers).length, foods: foods.length, assets: assetCount, assetBytes },
  displayChanges: 'SVG originals unchanged. CSS brightness filter displays the artwork in graphite. Spanish names and original instructions added by Entrena con Jesús.',
  foodPolicy: 'Per 100 g edible portion. Energy nutrient 2048, then 2047, then 1008; never 1062 kJ. No missing or negative nutrients converted to zero. Original preparation retained.',
  foodLicense: { name: 'CC0-1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', source: 'https://fdc.nal.usda.gov/' } }, null, 2));
console.log(`Built ${exercises.length} exercises (${Object.keys(blockers).length} explicit media blockers), ${assetCount} SVGs ${(assetBytes / 1048576).toFixed(2)} MiB; ${foods.length} foods.`);
