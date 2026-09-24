import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { csvRows } from './csv.mjs';
import { createFoodCatalog, csvObjects, extractNutrients, parseSelection, readLegacy,
  validateFoodCatalog, verifyArchive } from './food-data.mjs';
import { chicken, legacyCsv, nutrient, rice } from './food-fixtures.mjs';

const fixtureCatalog = () => createFoodCatalog(parseSelection('foundation|2512381|Arroz crudo|raw'),
  new Map([['foundation', new Map([['2512381', rice()]])]]));

test('looks up nutrient.id, not row ID; preserves rice published kcal and precision', () => {
  const food = rice();
  food.foodNutrients.push({ id: 1003, nutrient: { id: 9999, unitName: 'g' }, amount: 999 });
  assert.deepEqual(extractNutrients(food).per100g, { kcal: 370, protein: 7.04, carbohydrate: 80.3, fat: 1.03 });
  assert.notEqual(370, 7.04 * 4 + 80.3 * 4 + 1.03 * 9);
});

test('preserves genuine zero carbohydrate and independently verified chicken values', () => {
  assert.deepEqual(extractNutrients(chicken()).per100g, { kcal: 112, protein: 22.5, carbohydrate: 0, fat: 1.93 });
});

test('per-100-g basis is not rescaled by serving weights, volume, or nested ingredient nutrients', () => {
  const food = rice();
  food.servingSize = 50; food.servingSizeUnit = 'ml';
  food.foodPortions = [{ gramWeight: 185, amount: 1 }];
  food.inputFoods = [{ foodNutrients: [nutrient(2048, 999, 'kcal'), nutrient(1003, 999)] }];
  assert.deepEqual(extractNutrients(food).per100g, { kcal: 370, protein: 7.04, carbohydrate: 80.3, fat: 1.03 });
  food.foodNutrients = food.foodNutrients.filter(row => row.nutrient.id !== 1003);
  assert.throws(() => extractNutrients(food), /Missing\/invalid nutrient 1003/);
});

test('energy precedence uses specific then general then legacy, never kJ', () => {
  const food = rice();
  food.foodNutrients.push(nutrient(2047, 350, 'kcal'), nutrient(1008, 360, 'kcal'), nutrient(1062, 1548, 'kJ'));
  assert.equal(extractNutrients(food).energyNutrientId, 2048);
  food.foodNutrients = food.foodNutrients.filter(row => row.nutrient.id !== 2048);
  assert.equal(extractNutrients(food).per100g.kcal, 350);
  assert.equal(extractNutrients(food).energyMethod, 'atwater-general');
  food.foodNutrients = food.foodNutrients.filter(row => row.nutrient.id !== 2047);
  assert.equal(extractNutrients(food).per100g.kcal, 360);
  food.foodNutrients = food.foodNutrients.filter(row => row.nutrient.id !== 1008);
  assert.throws(() => extractNutrients(food), /Missing kcal/);
});

for (const value of [null, undefined, '', '7.04', -1, NaN, Infinity]) {
  test(`rejects missing/invalid protein (${String(value)}) instead of fabricating zero`, () => {
    const food = rice(); food.foodNutrients[0].amount = value;
    assert.throws(() => extractNutrients(food), /Missing\/invalid nutrient 1003/);
  });
}

test('invalid preferred energy does not silently fall back to a different calculation', () => {
  const food = rice(); food.foodNutrients.find(row => row.nutrient.id === 2048).amount = -1;
  food.foodNutrients.push(nutrient(1008, 360, 'kcal'));
  assert.throws(() => extractNutrients(food), /Missing\/invalid nutrient 2048/);
});

test('rejects mg as g and kJ as kcal instead of applying incorrect thousandfold/energy scaling', () => {
  const food = rice(); food.foodNutrients[0].nutrient.unitName = 'mg';
  assert.throws(() => extractNutrients(food), /Invalid unit/);
  food.foodNutrients[0].nutrient.unitName = 'G';
  food.foodNutrients.find(row => row.nutrient.id === 2048).nutrient.unitName = 'kJ';
  assert.throws(() => extractNutrients(food), /Invalid unit/);
});

test('rejects ambiguous duplicate nutrient rows', () => {
  const food = rice(); food.foodNutrients.push(nutrient(1003, 8));
  assert.throws(() => extractNutrients(food), /Duplicate nutrient/);
});

test('excludes dry-matter research records but allows legitimate zero-water oil', () => {
  for (const description of ['Rice, 0% moisture', 'Rice, 0.0 % moisture', 'Rice, dry-matter basis']) {
    assert.throws(() => extractNutrients({ ...rice(), description }), /research record/);
  }
  const food = rice(); food.foodNutrients.find(row => row.nutrient.id === 1051).amount = 0;
  assert.throws(() => extractNutrients(food), /Zero-moisture non-oil/);
  food.description = 'Synthetic oil'; food.foodCategory.description = 'Fats and Oils';
  assert.equal(extractNutrients(food).waterPer100g, 0);
});

test('rejects null food; missing water remains unknown, not zero', () => {
  assert.throws(() => extractNutrients(null), /Missing food/);
  const food = rice(); food.foodNutrients = food.foodNutrients.filter(row => row.nutrient.id !== 1051);
  assert.equal(extractNutrients(food).waterPer100g, null);
});

test('CSV joins use header names and nutrient_id, accept case-normalized units, skip unselected foods', () => {
  const foods = readLegacy(name => legacyCsv[name], new Set(['42']));
  assert.equal(foods.size, 1);
  assert.equal(foods.get('42').description, 'Test rice, cooked');
  assert.deepEqual(extractNutrients(foods.get('42')).per100g,
    { kcal: 130, protein: 2.5, carbohydrate: 28, fat: 0.5 });
});

test('empty CSV amounts remain missing rather than Number(empty) becoming zero', () => {
  const foods = readLegacy(name => legacyCsv[name].replace('2.5,1003', ',1003'), new Set(['42']));
  assert.throws(() => extractNutrients(foods.get('42')), /Missing\/invalid nutrient 1003/);
});

test('CSV handles commas, escaped quotes, embedded newline, CRLF and absent trailing newline', () => {
  assert.deepEqual([...csvRows('id,description\r\n1,"Rice, \"\"test\"\"\nfood"')],
    [['id', 'description'], ['1', 'Rice, "test"\nfood']]);
  assert.throws(() => [...csvRows('id,description\n1,"unfinished')], /Unterminated/);
  assert.throws(() => [...csvObjects('id\n1\n', ['amount'])], /Missing CSV columns/);
  assert.throws(() => [...csvObjects('id,id\n1,2', ['id'])], /Duplicate CSV columns/);
  assert.throws(() => [...csvObjects('id,amount\n1', ['id'])], /Malformed CSV row/);
});

test('selection rejects duplicate IDs/names, unknown datasets, malformed IDs and preparations', () => {
  const row = 'foundation|2512381|Arroz crudo|raw';
  assert.throws(() => parseSelection(`${row}\n${row}`), /Duplicate/);
  assert.throws(() => parseSelection(`${row}\nfoundation|2|ARROZ CRUDO|raw`), /Duplicate/);
  for (const invalid of ['unknown|1|Arroz|raw', 'foundation|0|Arroz|raw', 'foundation|1||raw',
    'foundation|1|Arroz|grilled', `${row}|extra`]) assert.throws(() => parseSelection(invalid));
});

test('source IDs must resolve in their dataset and raw cannot be relabeled cooked', () => {
  const sources = new Map([['foundation', new Map([['2512381', rice()]])]]);
  assert.throws(() => createFoodCatalog(parseSelection('foundation|2512381|Arroz cocido|cooked'), sources), /Unproven cooking/);
  assert.throws(() => createFoodCatalog(parseSelection('foundation|42|Arroz crudo|raw'), sources), /Missing source food/);
});

test('pan-broiled is explicit cooking even without the word cooked', () => {
  const food = chicken(); food.description = 'Synthetic chicken, pan-broiled crumbles';
  const catalog = createFoodCatalog(parseSelection('foundation|2646170|Pollo cocinado en sartén|cooked'),
    new Map([['foundation', new Map([['2646170', food]])]]));
  assert.equal(catalog.entries[0].preparation, 'cooked');
});

test('catalog rejects duplicates, wrong counts, invalid numbers, source IDs and energy units/policy', () => {
  const catalog = fixtureCatalog(); validateFoodCatalog(catalog, 1);
  assert.throws(() => validateFoodCatalog(catalog), /at least 150/);
  catalog.entries.push(structuredClone(catalog.entries[0]));
  assert.throws(() => validateFoodCatalog(catalog, 1), /Duplicate food/);
  for (const mutate of [c => c.entries[0].per100g.fat = -1, c => c.entries[0].per100g.protein = NaN,
    c => c.entries[0].source.fdcId = '42', c => c.entries[0].source.energyNutrientId = 1062,
    c => c.basis.energy = 'kJ', c => c.basis.grams = 1, c => c.sources.foundation.sha256 = 'tampered']) {
    const changed = structuredClone(fixtureCatalog()); mutate(changed);
    assert.throws(() => validateFoodCatalog(changed, 1));
  }
});

test('corrupted archive fails checksum before parsing', () => {
  assert.throws(() => verifyArchive(Buffer.from('not the pinned ZIP'), '0'.repeat(64)), /checksum mismatch/);
});

test('generated catalog retains verified samples, distinct raw/cooked rice and zero-water olive oil', async () => {
  const catalog = JSON.parse(await readFile('public/catalogs/foods.es.json', 'utf8'));
  validateFoodCatalog(catalog);
  const foods = new Map(catalog.entries.map(food => [food.source.fdcId, food]));
  assert.deepEqual(foods.get('2512381').per100g, { kcal: 370, protein: 7.04, carbohydrate: 80.3, fat: 1.03 });
  assert.deepEqual(foods.get('2646170').per100g, { kcal: 112, protein: 22.5, carbohydrate: 0, fat: 1.93 });
  assert.equal(foods.get('169757').preparation, 'cooked');
  assert.notDeepEqual(foods.get('169757').per100g, foods.get('2512381').per100g);
  assert.equal(foods.get('171413').source.waterPer100g, 0);
  assert.equal(foods.get('171413').per100g.kcal, 884);
});
