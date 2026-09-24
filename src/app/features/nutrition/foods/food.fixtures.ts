import type { CatalogFood } from './food.model';

/** Synthetic metadata for adversarial UI tests; never shipped as catalog data. */
export function foodFixture(): CatalogFood {
  return { id: 'fdc-1', name: 'Arroz cocido de prueba', aliases: ['Arroz blanco'], group: 'Cereales', preparation: 'cooked',
    per100g: { kcal: 130, protein: 2.69, carbohydrate: 28.17, fat: 0.28 },
    source: { fdcId: '1', dataset: 'sr-legacy', version: 'sr-legacy/2018-04', originalDescription: 'Rice, white, cooked', originalGroup: 'Cereal grains',
      energyNutrientId: 1008, energyMethod: 'legacy-published', waterPer100g: 68.44, license: 'CC0-1.0' } };
}
export function catalogFixture() {
  const source = { release: '2018-04', file: 'fixture.zip', url: 'https://example.org/fixture.zip', sha256: 'a'.repeat(64) };
  return { version: 1, language: 'es', basis: { grams: 100, portion: 'edible', energy: 'kcal', macros: 'g' },
    energyPolicy: { precedence: [2048, 2047, 1008], authority: 'application-policy', preservePublishedEnergy: true },
    sources: { foundation: source, 'sr-legacy': source }, licenseNotice: 'licenses/usda-fooddata-central.txt', entries: [foodFixture()] };
}
