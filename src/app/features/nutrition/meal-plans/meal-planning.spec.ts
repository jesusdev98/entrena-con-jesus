import { describe, expect, it } from 'vitest';
import { newId } from '../../../core/domain/identity';
import { catalogChoice, type CatalogFood } from '../foods/food.model';
import { duplicateContent, duplicateWeek, editRows, newPlannedFood, newWeek, planErrors, previewTotal, savedContent, totalWeeks } from './meal-planning';
import { mealDraft, testFood } from './meal.fixtures';

describe('planned meals and independent food snapshots', () => {
  it('scales published kcal independently from macros through each ordered level', () => {
    const owner = newId(); const week = newWeek(); const choice = testFood(owner);
    week.days[0].meals[0].foods.push({ ...newPlannedFood(choice, 250), grams: 250 });
    expect(totalWeeks([week])).toEqual({ kcal: 325, protein: 6.25, carbohydrate: 70, fat: 0.75 });
    expect(previewTotal([{ ...week, days: week.days.map(day => ({ ...day, meals: day.meals.map(meal => ({ ...meal, foods: meal.foods })) })) }])).toEqual(totalWeeks([week]));
    choice.per100g.kcal = 999;
    expect(totalWeeks([week]).kcal).toBe(325);
  });
  it('keeps cooked/raw USDA source and custom source detached when copying every descendant', () => {
    const draft = mealDraft(newId()); const week = draft.payload.content.weeks[0];
    const source = { fdcId: '123', version: 'sr-legacy/2024' };
    const catalog = { id: 'fdc-123', name: 'Arroz crudo', per100g: { kcal: 360, protein: 7, carbohydrate: 78, fat: 1 },
      source: { ...source, dataset: 'sr-legacy', originalDescription: 'raw', originalGroup: 'grain', energyNutrientId: 1008, energyMethod: 'legacy-published', waterPer100g: 0, license: 'CC0-1.0' },
      aliases: [], group: 'Granos', preparation: 'raw' } as CatalogFood;
    week.days[0].meals[0].foods.push(newPlannedFood(catalogChoice(catalog), 80));
    const copy = duplicateContent(draft.payload.content); const original = week.days[0].meals[0].foods;
    const cloned = copy.weeks[0].days[0].meals[0].foods;
    expect(copy.weeks[0].id).not.toBe(week.id); expect(copy.weeks[0].days[0].id).not.toBe(week.days[0].id);
    expect(copy.weeks[0].days[0].meals[0].id).not.toBe(week.days[0].meals[0].id);
    expect(cloned.map(item => item.id)).not.toEqual(original.map(item => item.id));
    expect(cloned[1].food.source).toEqual(source);
    cloned[0].food.per100g.kcal = 900; cloned[1].food.name = 'Modified';
    expect(original[0].food.per100g.kcal).toBe(130); expect(original[1].food.name).toBe('Arroz crudo');
    expect(duplicateWeek(week).days[0].meals[0].foods[0].id).not.toBe(original[0].id);
  });
  it('reorders, duplicates, removes and rejects incomplete or repeated identities', () => {
    const draft = mealDraft(newId()); const week = draft.payload.content.weeks[0];
    expect(planErrors(draft.payload.name, draft.payload.content)).toEqual([]);
    const rows = editRows([week], week.id, 'duplicate', duplicateWeek);
    expect(rows).toHaveLength(2); expect(editRows(rows, rows[1].id, 'up', duplicateWeek)[0].id).toBe(rows[1].id);
    expect(editRows(rows, rows[1].id, 'remove', duplicateWeek)).toEqual([week]);
    week.days[0].meals[0].foods[0].grams = null;
    expect(planErrors(draft.payload.name, draft.payload.content)).toContain('Indica gramos mayores que cero para cada alimento.');
    expect(() => savedContent(draft.payload.name, draft.payload.content)).toThrow();
    week.days[0].meals[0].foods[0].grams = 150;
    week.days[0].meals[0].foods[0].id = week.id;
    expect(planErrors(draft.payload.name, draft.payload.content).join()).toContain('identidades únicas');
  });
});
