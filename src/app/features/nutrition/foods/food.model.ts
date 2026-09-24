import { z } from 'zod';
import type { CustomFood, FoodSnapshot, Nutrients } from '../nutrition.model';

const amount = z.number().finite().nonnegative();
export const nutrientsSchema = z.object({ kcal: amount, protein: amount, carbohydrate: amount, fat: amount });
export const preparationLabels = {
  raw: 'Crudo', cooked: 'Cocinado', prepared: 'Preparado', dried: 'Seco', frozen: 'Congelado', unspecified: 'Sin especificar',
} as const;
export type Preparation = keyof typeof preparationLabels;
const entrySchema = z.object({
  id: z.string(), name: z.string().min(1), aliases: z.array(z.string()), group: z.string().min(1),
  preparation: z.enum(['raw', 'cooked', 'prepared', 'dried', 'frozen', 'unspecified']), per100g: nutrientsSchema,
  source: z.object({
    fdcId: z.string().regex(/^\d+$/), dataset: z.enum(['foundation', 'sr-legacy']), version: z.string().min(1),
    originalDescription: z.string().min(1), originalGroup: z.string().min(1),
    energyNutrientId: z.union([z.literal(2048), z.literal(2047), z.literal(1008)]),
    energyMethod: z.enum(['atwater-specific', 'atwater-general', 'legacy-published']),
    waterPer100g: amount.nullable(), license: z.literal('CC0-1.0'),
  }),
});
const sourceSchema = z.object({ release: z.string().min(1), file: z.string(), url: z.url(), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
const catalogSchema = z.object({
  version: z.literal(1), language: z.literal('es'),
  basis: z.object({ grams: z.literal(100), portion: z.literal('edible'), energy: z.literal('kcal'), macros: z.literal('g') }),
  energyPolicy: z.object({ precedence: z.tuple([z.literal(2048), z.literal(2047), z.literal(1008)]), authority: z.literal('application-policy'), preservePublishedEnergy: z.literal(true) }),
  sources: z.object({ foundation: sourceSchema, 'sr-legacy': sourceSchema }),
  licenseNotice: z.literal('licenses/usda-fooddata-central.txt'), entries: z.array(entrySchema).min(1),
});
export type CatalogFood = z.infer<typeof entrySchema>;
export type FoodChoice =
  | { kind: 'usda'; id: string; name: string; per100g: Nutrients; entry: CatalogFood }
  | { kind: 'custom'; id: string; name: string; per100g: Nutrients; entry: CustomFood };

export function parseFoodCatalog(input: unknown): CatalogFood[] {
  const catalog = catalogSchema.parse(input);
  const ids = new Set<string>();
  for (const food of catalog.entries) {
    const method = { 2048: 'atwater-specific', 2047: 'atwater-general', 1008: 'legacy-published' }[food.source.energyNutrientId];
    if (ids.has(food.id) || food.id !== `fdc-${food.source.fdcId}` || food.source.version !== `${food.source.dataset}/${catalog.sources[food.source.dataset].release}` || food.source.energyMethod !== method) {
      throw new Error('Invalid food catalog identity or provenance.');
    }
    ids.add(food.id);
  }
  return catalog.entries;
}
export function catalogChoice(entry: CatalogFood): FoodChoice { return { kind: 'usda', id: entry.id, name: entry.name, per100g: entry.per100g, entry }; }
export function customChoice(entry: CustomFood): FoodChoice { return { kind: 'custom', id: entry.id, name: entry.name, per100g: entry.per100g, entry }; }
export function foodSnapshot(food: FoodChoice): FoodSnapshot {
  return { foodId: food.id, name: food.name, per100g: { ...food.per100g }, source: food.kind === 'usda'
    ? { fdcId: food.entry.source.fdcId, version: food.entry.source.version } : { customFoodId: food.entry.id } };
}
export function normalizeFoodSearch(value: string): string { return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es').trim(); }
export interface FoodFilters { query: string; group: string; preparation: string }
export function filterFoods(foods: FoodChoice[], filters: FoodFilters): FoodChoice[] {
  const terms = normalizeFoodSearch(filters.query).split(/\s+/).filter(Boolean);
  return foods.filter(food => {
    const group = food.kind === 'usda' ? food.entry.group : 'Personalizados';
    const preparation = food.kind === 'usda' ? food.entry.preparation : 'unspecified';
    const search = normalizeFoodSearch(food.kind === 'usda' ? [food.name, ...food.entry.aliases, food.entry.source.originalDescription].join(' ') : food.name);
    return (!filters.group || group === filters.group) && (!filters.preparation || preparation === filters.preparation) && terms.every(term => search.includes(term));
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
/** Preview only: published energy is scaled independently from the macros. */
export function scaleFood(per100g: Nutrients, grams: number): Nutrients {
  nutrientsSchema.parse(per100g);
  amount.parse(grams);
  return nutrientsSchema.parse({ kcal: per100g.kcal * grams / 100, protein: per100g.protein * grams / 100,
    carbohydrate: per100g.carbohydrate * grams / 100, fat: per100g.fat * grams / 100 });
}
export function validateCustomFood(input: unknown): { name: string; per100g: Nutrients; source: { kind: 'user'; note: string } } {
  const value = z.object({ name: z.string().trim().min(1).max(160), note: z.string().trim().max(500),
    kcal: amount, protein: amount, carbohydrate: amount, fat: amount }).parse(input);
  return { name: value.name, per100g: { kcal: value.kcal, protein: value.protein, carbohydrate: value.carbohydrate, fat: value.fat }, source: { kind: 'user', note: value.note } };
}
