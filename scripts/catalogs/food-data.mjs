import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { foundationUrl, foundationHash, sha256, zipMembers } from './sources.mjs';
import { csvRows } from './csv.mjs';

export const foodSources = {
  foundation: { release: '2026-04-30', file: 'foundation.zip', url: foundationUrl, sha256: foundationHash },
  'sr-legacy': { release: '2018-04', file: 'sr-legacy.zip',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip',
    sha256: 'b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0' },
};
export const energyMethods = { 2048: 'atwater-specific', 2047: 'atwater-general', 1008: 'legacy-published' };
const energyOrder = [2048, 2047, 1008];
const nutrientIds = [1003, 1004, 1005, 1051, ...energyOrder];
const preparations = ['raw', 'cooked', 'prepared', 'dried', 'frozen', 'unspecified'];
const groups = {
  'Legumes and Legume Products': 'Legumbres', 'Vegetables and Vegetable Products': 'Verduras',
  'Sausages and Luncheon Meats': 'Embutidos', 'Nut and Seed Products': 'Frutos secos y semillas',
  'Dairy and Egg Products': 'Lácteos y huevos', 'Fruits and Fruit Juices': 'Frutas y zumos',
  'Spices and Herbs': 'Condimentos', 'Fats and Oils': 'Aceites y grasas', 'Poultry Products': 'Aves',
  'Soups, Sauces, and Gravies': 'Salsas', 'Baked Products': 'Panadería',
  'Finfish and Shellfish Products': 'Pescados y mariscos', 'Beef Products': 'Vacuno',
  'Pork Products': 'Cerdo', Sweets: 'Dulces', 'Cereal Grains and Pasta': 'Cereales y pasta', Beverages: 'Bebidas',
};
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const text = value => typeof value === 'string' && value.trim().length > 0;
const normalized = value => value.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');

export function parseSelection(input) {
  const seen = new Set(), names = new Set();
  return input.trim().split(/\r?\n/).map((line, index) => {
    const fields = line.split('|');
    const [dataset, id, name, preparation] = fields;
    assert.ok(fields.length === 4 && Object.hasOwn(foodSources, dataset), `Invalid selection line ${index + 1}`);
    assert.match(id, /^[1-9]\d*$/);
    assert.ok(Number.isSafeInteger(Number(id)) && text(name) && preparations.includes(preparation), id);
    assert.ok(!seen.has(id) && !names.has(normalized(name)), `Duplicate selection: ${id}`);
    seen.add(id); names.add(normalized(name));
    return { dataset, id, name, preparation };
  });
}

// FDC amounts already use 100 g edible portion, even for drinks. Never use serving weights or inputFoods.
export function extractNutrients(food) {
  assert.ok(food && Array.isArray(food.foodNutrients), 'Missing food record/nutrients');
  assert.ok(!/\b0(?:\.0+)?\s*%\s*moisture\b|dry[- ]matter basis/i.test(food.description), 'Zero-moisture research record');
  const rows = new Map();
  for (const row of food.foodNutrients) {
    if (!nutrientIds.includes(row?.nutrient?.id)) continue;
    assert.ok(!rows.has(row.nutrient.id), `Duplicate nutrient ${row.nutrient.id}`);
    rows.set(row.nutrient.id, row);
  }
  const amount = (id, unit) => {
    const row = rows.get(id);
    assert.ok(row && nonnegative(row.amount), `Missing/invalid nutrient ${id}`);
    assert.equal(row.nutrient.unitName?.toLowerCase(), unit, `Invalid unit for nutrient ${id}`);
    return row.amount;
  };
  const water = rows.has(1051) ? amount(1051, 'g') : null;
  // Pure oil can legitimately contain zero water; this is not a dry-matter research normalization.
  assert.ok(water !== 0 || food.foodCategory?.description === 'Fats and Oils', 'Zero-moisture non-oil record');
  const energyNutrientId = energyOrder.find(id => rows.has(id));
  assert.ok(energyNutrientId, 'Missing kcal energy (kJ is not a fallback)');
  return {
    per100g: { kcal: amount(energyNutrientId, 'kcal'), protein: amount(1003, 'g'),
      carbohydrate: amount(1005, 'g'), fat: amount(1004, 'g') },
    energyNutrientId, energyMethod: energyMethods[energyNutrientId], waterPer100g: water,
  };
}

export function* csvObjects(input, required) {
  const rows = csvRows(input), header = rows.next().value;
  assert.ok(header && required.every(key => header.includes(key)), 'Missing CSV columns');
  assert.equal(new Set(header).size, header.length, 'Duplicate CSV columns');
  for (const row of rows) {
    assert.equal(row.length, header.length, 'Malformed CSV row');
    yield Object.fromEntries(header.map((key, index) => [key, row[index]]));
  }
}

export function readLegacy(member, wanted) {
  const categories = new Map([...csvObjects(member('food_category.csv'), ['id', 'description'])]
    .map(row => [row.id, row.description]));
  const units = new Map([...csvObjects(member('nutrient.csv'), ['id', 'unit_name'])]
    .map(row => [Number(row.id), row.unit_name]));
  const foods = new Map();
  for (const row of csvObjects(member('food.csv'), ['fdc_id', 'data_type', 'description', 'food_category_id'])) {
    if (!wanted.has(row.fdc_id)) continue;
    assert.equal(row.data_type, 'sr_legacy_food');
    assert.ok(!foods.has(row.fdc_id), `Duplicate SR food ${row.fdc_id}`);
    foods.set(row.fdc_id, { fdcId: Number(row.fdc_id), description: row.description,
      foodCategory: { description: categories.get(row.food_category_id) }, foodNutrients: [] });
  }
  for (const row of csvObjects(member('food_nutrient.csv'), ['fdc_id', 'nutrient_id', 'amount'])) {
    if (!wanted.has(row.fdc_id) || !nutrientIds.includes(Number(row.nutrient_id))) continue;
    assert.ok(foods.has(row.fdc_id), `Orphan SR nutrient ${row.fdc_id}`);
    foods.get(row.fdc_id).foodNutrients.push({ nutrient: { id: Number(row.nutrient_id),
      unitName: units.get(Number(row.nutrient_id)) }, amount: row.amount.trim() === '' ? null : Number(row.amount) });
  }
  return foods;
}

export function verifyArchive(bytes, expectedHash) {
  assert.equal(sha256(bytes), expectedHash, 'Source archive checksum mismatch');
  return zipMembers(bytes);
}

// Cache-only by construction: importing this module or generating a catalog never invokes download().
export async function loadFoodSources(selection) {
  const result = new Map();
  for (const dataset of new Set(selection.map(row => row.dataset))) {
    const pin = foodSources[dataset];
    const members = verifyArchive(await readFile(`.catalog-cache/${pin.file}`), pin.sha256);
    const member = name => {
      const matches = members.filter(item => item.name === name || item.name.endsWith(`/${name}`));
      assert.equal(matches.length, 1, `Expected one ${name}`);
      return matches[0].read().toString('utf8');
    };
    let foods;
    if (dataset === 'foundation') {
      const files = members.filter(item => item.name.endsWith('.json'));
      assert.equal(files.length, 1, 'Expected one Foundation JSON');
      const root = JSON.parse(files[0].read()).FoundationFoods;
      assert.ok(Array.isArray(root), 'Missing FoundationFoods array');
      foods = new Map();
      for (const food of root) {
        if (food === null) continue; // Known null array element; no recursive ingredient extraction.
        assert.ok(food && Number.isSafeInteger(food.fdcId) && food.fdcId > 0, 'Invalid Foundation identity');
        assert.ok(!foods.has(String(food.fdcId)), `Duplicate Foundation food ${food.fdcId}`);
        foods.set(String(food.fdcId), food);
      }
    } else {
      foods = readLegacy(member, new Set(selection.filter(row => row.dataset === dataset).map(row => row.id)));
    }
    result.set(dataset, foods);
  }
  return result;
}

export function createFoodCatalog(selection, sources) {
  const entries = selection.map(({ dataset, id, name, preparation }) => {
    const food = sources.get(dataset)?.get(id);
    assert.ok(food && String(food.fdcId) === id, `Missing source food ${dataset}/${id}`);
    const { per100g, ...nutritionMetadata } = extractNutrients(food);
    const group = groups[food.foodCategory?.description];
    assert.ok(group && text(food.description), `Missing group/description ${id}`);
    if (preparation === 'cooked') assert.match(food.description, /\bcooked\b|\btoasted\b|\bpan-broiled\b/i, `Unproven cooking ${id}`);
    if (preparation === 'raw') assert.match(food.description, /\braw\b/i, `Unproven raw state ${id}`);
    if (preparation === 'frozen') assert.match(food.description, /\bfrozen\b/i, `Unproven frozen state ${id}`);
    return { id: `fdc-${id}`, name, aliases: [], group, preparation, per100g,
      source: { fdcId: id, version: `${dataset}/${foodSources[dataset].release}`, dataset,
        originalDescription: food.description, originalGroup: food.foodCategory.description,
        ...nutritionMetadata, license: 'CC0-1.0' } };
  });
  return { version: 1, language: 'es', basis: { grams: 100, portion: 'edible', energy: 'kcal', macros: 'g' },
    energyPolicy: { precedence: energyOrder, authority: 'application-policy', preservePublishedEnergy: true },
    sources: foodSources, licenseNotice: 'licenses/usda-fooddata-central.txt', entries };
}

export function validateFoodCatalog(catalog, minimum = 150) {
  assert.equal(catalog.version, 1);
  assert.equal(catalog.language, 'es');
  assert.deepEqual(catalog.sources, foodSources);
  assert.deepEqual(catalog.basis, { grams: 100, portion: 'edible', energy: 'kcal', macros: 'g' });
  assert.deepEqual(catalog.energyPolicy, { precedence: energyOrder, authority: 'application-policy', preservePublishedEnergy: true });
  assert.equal(catalog.licenseNotice, 'licenses/usda-fooddata-central.txt');
  assert.ok(Array.isArray(catalog.entries) && catalog.entries.length >= minimum, `Expected at least ${minimum} foods`);
  const ids = new Set(), names = new Set(), descriptions = new Set();
  for (const food of catalog.entries) {
    const source = food.source;
    assert.ok(source && Object.hasOwn(foodSources, source.dataset), 'Unknown food source');
    assert.match(source.fdcId, /^[1-9]\d*$/);
    assert.ok(Number.isSafeInteger(Number(source.fdcId)), 'Invalid FDC ID');
    assert.equal(food.id, `fdc-${source.fdcId}`);
    assert.equal(source.version, `${source.dataset}/${foodSources[source.dataset].release}`);
    assert.equal(source.license, 'CC0-1.0');
    assert.ok(text(food.name) && text(source.originalDescription) && text(source.originalGroup), food.id);
    assert.equal(food.group, groups[source.originalGroup]);
    assert.ok(text(food.group) && preparations.includes(food.preparation), food.id);
    assert.ok(Array.isArray(food.aliases) && food.aliases.every(text), food.id);
    assert.ok(!ids.has(food.id) && !names.has(normalized(food.name)) &&
      !descriptions.has(normalized(source.originalDescription)), `Duplicate food identity ${food.id}`);
    ids.add(food.id); names.add(normalized(food.name)); descriptions.add(normalized(source.originalDescription));
    assert.deepEqual(Object.keys(food.per100g).sort(), ['carbohydrate', 'fat', 'kcal', 'protein']);
    assert.ok(Object.values(food.per100g).every(nonnegative), `Invalid nutrients ${food.id}`);
    assert.ok(energyOrder.includes(source.energyNutrientId), `Invalid energy ID ${food.id}`);
    assert.equal(source.energyMethod, energyMethods[source.energyNutrientId]);
    assert.ok(source.waterPer100g === null || nonnegative(source.waterPer100g), `Invalid moisture ${food.id}`);
    assert.ok(source.waterPer100g !== 0 || food.group === 'Aceites y grasas', `Zero-moisture non-oil ${food.id}`);
    assert.doesNotMatch(source.originalDescription, /\b0(?:\.0+)?\s*%\s*moisture\b|dry[- ]matter basis/i);
  }
  if (minimum >= 150) {
    assert.ok(new Set(catalog.entries.map(food => food.group)).size >= 12, 'Insufficient food-group diversity');
    assert.ok(catalog.entries.filter(food => food.preparation === 'cooked').length >= 15, 'Insufficient cooked coverage');
  }
}

export async function generateFoodCatalog() {
  const selection = parseSelection(await readFile('scripts/catalogs/foods.es.tsv', 'utf8'));
  const catalog = createFoodCatalog(selection, await loadFoodSources(selection));
  validateFoodCatalog(catalog);
  return catalog;
}
