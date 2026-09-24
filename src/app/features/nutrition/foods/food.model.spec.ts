import { describe, expect, it } from 'vitest';
import { catalogChoice, filterFoods, foodSnapshot, parseFoodCatalog, scaleFood, validateCustomFood } from './food.model';
import { catalogFixture, foodFixture } from './food.fixtures';

describe('food catalog contracts', () => {
  it('searches accents, aliases, original descriptions and multiple terms without changing preparation', () => {
    const food = { ...foodFixture(), name: 'Judías cocidas', aliases: ['Fríjoles'] };
    const foods = [catalogChoice(food)];
    for (const query of [' JUDIAS ', 'frijoles', 'white cooked', 'judías cooked']) expect(filterFoods(foods, { query, group: '', preparation: '' })).toEqual(foods);
    expect(filterFoods(foods, { query: '', group: '', preparation: 'raw' })).toEqual([]);
    expect(filterFoods(foods, { query: '', group: 'Verduras', preparation: '' })).toEqual([]);
    expect(filterFoods(foods, { query: 'judias', group: 'Cereales', preparation: 'cooked' })).toEqual(foods);
  });
  it('scales the independent published energy, including zero and fractions', () => {
    expect(scaleFood(foodFixture().per100g, 150)).toEqual({ kcal: 195, protein: expect.closeTo(4.035, 10), carbohydrate: expect.closeTo(42.255, 10), fat: expect.closeTo(0.42, 10) });
    expect(scaleFood(foodFixture().per100g, 0)).toEqual({ kcal: 0, protein: 0, carbohydrate: 0, fat: 0 });
    expect(scaleFood(foodFixture().per100g, 12.5).kcal).toBe(16.25);
    expect(scaleFood(foodFixture().per100g, 100).kcal).not.toBe(4 * 2.69 + 4 * 28.17 + 9 * 0.28);
  });
  it.each([-1, Infinity, NaN])('rejects invalid preview grams %s', grams => expect(() => scaleFood(foodFixture().per100g, grams)).toThrow());
  it('rejects scaled overflow rather than displaying infinity', () => expect(() => scaleFood({ kcal: Number.MAX_VALUE, protein: 0, carbohydrate: 0, fat: 0 }, 1000)).toThrow());
  it('maps a detached compatible snapshot with source identity and singular carbohydrate', () => {
    const food = catalogChoice(foodFixture());
    const snapshot = foodSnapshot(food);
    expect(snapshot.source).toEqual({ fdcId: '1', version: 'sr-legacy/2018-04' });
    snapshot.per100g.carbohydrate = 0;
    expect(food.per100g.carbohydrate).toBe(28.17);
  });
  it('validates the catalog basis, source identity, version, energy method and uniqueness', () => {
    expect(parseFoodCatalog(catalogFixture())).toEqual([foodFixture()]);
    const wrongBasis = catalogFixture(); wrongBasis.basis.grams = 1;
    const duplicate = catalogFixture(); duplicate.entries.push(foodFixture());
    const wrongSource = catalogFixture(); wrongSource.entries[0].source.fdcId = '2';
    const wrongVersion = catalogFixture(); wrongVersion.entries[0].source.version = 'unknown';
    const wrongEnergy = catalogFixture(); wrongEnergy.entries[0].source.energyNutrientId = 2048;
    const negative = catalogFixture(); negative.entries[0].per100g.protein = -1;
    for (const invalid of [wrongBasis, duplicate, wrongSource, wrongVersion, wrongEnergy, negative, { version: 2 }]) expect(() => parseFoodCatalog(invalid)).toThrow();
  });
  it('accepts explicit zero and unrounded values with user-only provenance', () => {
    expect(validateCustomFood({ name: ' Agua ', note: ' Etiqueta ', kcal: 0, protein: 0, carbohydrate: 0, fat: 0.12345 })).toEqual({
      name: 'Agua', source: { kind: 'user', note: 'Etiqueta' }, per100g: { kcal: 0, protein: 0, carbohydrate: 0, fat: 0.12345 },
    });
  });
  it.each([null, '', -1, NaN, Infinity])('rejects missing or invalid custom nutrient %s', amount => {
    for (const key of ['kcal', 'protein', 'carbohydrate', 'fat']) expect(() => validateCustomFood({ name: 'Food', note: '', kcal: 1, protein: 1, carbohydrate: 1, fat: 1, [key]: amount })).toThrow();
  });
  it('rejects a whitespace-only name and excessive references', () => {
    const value = { name: ' ', note: '', kcal: 0, protein: 0, carbohydrate: 0, fat: 0 };
    expect(() => validateCustomFood(value)).toThrow();
    expect(() => validateCustomFood({ ...value, name: 'Food', note: 'a'.repeat(501) })).toThrow();
  });
});
