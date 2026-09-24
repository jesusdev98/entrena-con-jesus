import { describe, expect, it } from 'vitest';
import { localDate, newId } from '../../core/domain/identity';
import { activityContext, actualActivity } from '../activity/activity.fixtures';
import { calculateActivity, type DailyTargetSnapshot } from '../activity/daily-target.model';
import { mealDraft } from '../nutrition/meal-plans/meal.fixtures';
import type { FoodLog, MealPlanRevision } from '../nutrition/nutrition.model';
import { emptyProfile, type Person } from '../people/person.model';
import { performed, sessionFixture } from '../training/training.fixtures';
import { mealDocument } from './meal-document';
import { nutritionDocument } from './nutrition-document';
import { trainingDocument } from './training-document';
import { pdfFilename } from './progress-export';

const day = localDate('2026-09-21');
const now = '2026-09-23T12:00:00Z';
function fixtures() {
  const person: Person = { id: newId(), displayName: 'Jesús', reference: '', kind: 'personal', archived: false, profile: emptyProfile(), createdAt: now, updatedAt: now };
  const draft = mealDraft(person.id);
  const plan: MealPlanRevision = { id: newId(), planId: draft.payload.planId, parentRevisionId: null, personId: person.id,
    name: 'Arroz y más', createdAt: now, updatedAt: now, content: draft.payload.content as MealPlanRevision['content'] };
  const food = plan.content.weeks[0].days[0].meals[0].foods[0].food;
  const log: FoodLog = { id: newId(), personId: person.id, createdAt: now, updatedAt: now, date: day, mealLabel: 'Desayuno', food, grams: 100, source: null };
  const context = activityContext(), activity = actualActivity();
  const target: DailyTargetSnapshot = { id: newId(), personId: person.id, createdAt: now, updatedAt: now, date: day,
    version: 1, schemaVersion: 2, context, activity, calculation: calculateActivity(activity, context) };
  return { person, plan, log, target };
}
describe('separate saved PDF documents', () => {
  it('distinguishes planned from actual, scales published kcal independently, and checks target date and owner', () => {
    const { person, plan, log, target } = fixtures();
    const planned = mealDocument(person, plan, target), actual = nutritionDocument(person, day, [log], target);
    const p = JSON.stringify(planned.content), a = JSON.stringify(actual.content);
    expect(p).toContain('PLAN PREVISTO'); expect(p).toContain('195 kcal'); expect(p).toContain('150 g');
    expect(p).toContain('Referencia indicativa independiente'); expect(p).not.toContain('CONSUMO REAL GUARDADO');
    expect(a).toContain('CONSUMO REAL GUARDADO'); expect(a).toContain('130 kcal'); expect(a).toContain('100 g');
    expect(a).toContain('Restante'); expect(a).toContain('versión 1');
    expect(actual['pageMargins']).toEqual([43, 51, 43, 48]); expect(actual['background']).toBeTypeOf('function');
    expect(() => nutritionDocument(person, day, [{ ...log, personId: newId() }], null)).toThrow('otra persona');
    expect(() => nutritionDocument(person, day, [{ ...log, date: localDate('2026-09-22') }], null)).toThrow('fecha');
    expect(() => nutritionDocument(person, day, [log], { ...target, date: localDate('2026-09-22') })).toThrow('fecha');
    expect(() => mealDocument({ ...person, id: newId() }, plan)).toThrow('otra persona');
  });
  it('shows missing/zero targets and explicit excess without macro-derived energy', () => {
    const { person, log, target } = fixtures();
    expect(JSON.stringify(nutritionDocument(person, day, [log], null).content)).toContain('Sin objetivo diario guardado');
    const zero = structuredClone(target); zero.calculation = { ...target.calculation, result: { ...target.calculation.result,
      targetKcal: 50, macroGrams: { protein: 0, carbohydrate: 0, fat: 0 } } };
    const output = JSON.stringify(nutritionDocument(person, day, [log], zero).content);
    expect(output).toContain('Exceso 80 kcal'); expect(output).toContain('Exceso 2,5 g');
    expect(output).toContain('130 kcal');
    expect(() => nutritionDocument(person, day, [], null)).toThrow('No hay consumo');
  });
  it('flows many days, portions and sessions with repeated headers and continuation notes', () => {
    const { person, plan } = fixtures();
    const original = plan.content.weeks[0].days[0];
    plan.content.weeks = Array.from({ length: 8 }, (_, index) => ({ id: newId(), name: `Semana ${index + 1}`,
      days: Array.from({ length: 7 }, () => ({ ...structuredClone(original), id: newId(), meals: original.meals.map(meal =>
        ({ ...structuredClone(meal), foods: Array.from({ length: 9 }, () => ({ ...structuredClone(original.meals[0].foods[0]), id: newId() })) })) })) }));
    plan.content.notes = 'Plan '.repeat(280);
    const content = JSON.stringify(mealDocument(person, plan).content);
    expect(content).toContain('Semana 8'); expect(content).toContain('continuación'); expect(content).toContain('"headerRows":1');
    expect(content).toContain('"dontBreakRows":true');
    const session = { ...performed(sessionFixture(person.id)), date: day, status: 'completed' as const, version: 1 };
    session.exercises[0].sets[0] = { ...session.exercises[0].sets[0], status: 'skipped', actual: null, rpe: null };
    const training = JSON.stringify(trainingDocument(person, day, localDate('2026-09-27'), null, Array.from({ length: 30 }, () => session)).content);
    expect(training).toContain('No realizada · sin valores reales'); expect(training).toContain('Previsto:');
    expect(training).toContain('Duración total manual: 40 min'); expect(training).toContain('RPE');
    expect(training).toContain('"headerRows":2');
    expect(() => trainingDocument(person, day, localDate('2026-09-27'), null, [{ ...session, personId: newId() }])).toThrow('otra persona');
    expect(pdfFilename('comidas', '../../á/<script>', plan.id)).toMatch(/^entrena-con-jesus-comidas-a-script-/);
  });
  it('keeps headings with following content and rejects empty or inconsistent saved selections', () => {
    const { person, plan, log, target } = fixtures();
    const pdf = mealDocument(person, plan);
    const pageBreakBefore = pdf['pageBreakBefore'] as (node: { headlineLevel?: number }, following: unknown[]) => boolean;
    expect(pageBreakBefore({ headlineLevel: 1 }, [])).toBe(true);
    expect(pageBreakBefore({ headlineLevel: 1 }, [{}])).toBe(false);
    expect(pageBreakBefore({}, [])).toBe(false);
    plan.content.weeks = [];
    expect(JSON.stringify(mealDocument(person, plan).content)).toContain('no contiene semanas');
    expect(() => nutritionDocument(person, day, [log], { ...target, personId: newId() })).toThrow('otra persona');
    expect(() => nutritionDocument(person, day, [{ ...log, grams: Number.NaN }], null)).toThrow();
    const malformed = fixtures().plan; malformed.content.weeks[0].days[0].meals[0].foods[0].grams = Number.NaN;
    expect(() => mealDocument(person, { ...malformed, personId: person.id })).toThrow();
    expect(() => trainingDocument(person, day, day, null, [])).toThrow('No hay sesiones');
    const session = { ...performed(sessionFixture(person.id)), date: localDate('2026-09-22'), status: 'completed' as const };
    expect(() => trainingDocument(person, day, day, null, [session])).toThrow('fuera del período');
  });
});
