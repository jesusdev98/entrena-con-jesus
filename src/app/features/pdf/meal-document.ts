import type { Person } from '../people/person.model';
import type { DailyTargetSnapshot } from '../activity/daily-target.model';
import type { MealPlanRevision, Nutrients } from '../nutrition/nutrition.model';
import { plannedMealTotal } from '../nutrition/diary/diary.model';
import { scaleFood } from '../nutrition/foods/food.model';
import { brandedDocument, blue, chunks, heading, label, number, pale, text } from './document-style';
import type { PdfDocument, PdfNode } from './routine-document';

const values = (v: Nutrients) => `${number(v.kcal)} kcal · P ${number(v.protein)} g · C ${number(v.carbohydrate)} g · G ${number(v.fat)} g`;
const cell = (value: string, bold = false): PdfNode => ({ text: value, fontSize: 9, bold, margin: [3, 4, 3, 4] });

export function mealDocument(person: Person, revision: MealPlanRevision, target: DailyTargetSnapshot | null = null): PdfDocument {
  if (person.id !== revision.personId || (target && target.personId !== person.id)) throw new Error('El plan o el objetivo pertenece a otra persona.');
  const content: PdfNode[] = [text('ENTRENA CON JESÚS / PLANIFICACIÓN'), heading(label(revision.name)),
    text(`Persona: ${person.displayName} · ${person.reference || 'Espacio local'}`),
    text(`Revisión guardada: ${revision.updatedAt.slice(0, 10)} · ID ${revision.id}`),
    { text: 'PLAN PREVISTO · No es consumo registrado. Las semanas y los días son posiciones del plan, no fechas de ingesta.', bold: true, color: blue, fillColor: pale, margin: [0, 8, 0, 8] }];
  if (target) content.push(text(`Referencia indicativa independiente para ${target.date} · objetivo guardado v${target.version}: ${number(target.calculation.result.targetKcal)} kcal · P ${number(target.calculation.result.macroGrams.protein)} g · C ${number(target.calculation.result.macroGrams.carbohydrate)} g · G ${number(target.calculation.result.macroGrams.fat)} g. No asigna este plan a esa fecha ni representa consumo.`));
  else content.push(text('Sin objetivo diario guardado de referencia; el plan no tiene fecha asignada.'));
  if (revision.content.notes) content.push(...chunks(revision.content.notes, 'Notas del plan'));
  if (!revision.content.weeks.length) content.push(text('Este plan guardado no contiene semanas ni comidas previstas.'));
  for (const [wi, week] of revision.content.weeks.entries()) for (const [di, day] of week.days.entries()) {
    const dayHeading = `Semana ${wi + 1}: ${label(week.name)} · Día ${di + 1}: ${label(day.name)}`;
    const dayTotal: Nutrients = { kcal: 0, protein: 0, carbohydrate: 0, fat: 0 };
    if (!day.meals.length) content.push({ stack: [heading(dayHeading), text('Día sin comidas previstas.')], unbreakable: true });
    for (const [mi, meal] of day.meals.entries()) {
      const total = plannedMealTotal(meal);
      for (const key of Object.keys(dayTotal) as (keyof Nutrients)[]) dayTotal[key] += total[key];
       const rows: PdfNode[][] = mi === 0 ? [[{ text: dayHeading, colSpan: 2, bold: true, color: blue, fontSize: 12, margin: [3, 7, 3, 7] }, {}]] : [];
       rows.push([cell(`COMIDA PREVISTA · ${label(meal.name)}`, true), cell('Cantidad · energía y macronutrientes', true)]);
       for (const item of meal.foods) rows.push([cell(label(item.food.name)), cell(`${number(item.grams)} g · ${values(scaleFood(item.food.per100g, item.grams))}`)]);
       rows.push([cell(`Total ${label(meal.name)}`, true), cell(values(total), true)]);
       content.push({ table: { headerRows: mi === 0 ? 2 : 1, keepWithHeaderRows: 1, dontBreakRows: true, widths: ['36%', '*'], body: rows },
        layout: { fillColor: (row: number) => row === 0 ? pale : null }, margin: [0, 5, 0, 6] });
    }
    content.push({ text: `TOTAL PREVISTO DEL DÍA · ${values(dayTotal)}`, bold: true, color: blue, margin: [0, 3, 0, 9] });
  }
  return brandedDocument(person.displayName, revision.name, 'PLAN PREVISTO', content);
}
