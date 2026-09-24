import type { LocalDate } from '../../core/domain/identity';
import type { Person } from '../people/person.model';
import type { DailyTargetSnapshot } from '../activity/daily-target.model';
import type { FoodLog, Nutrients } from '../nutrition/nutrition.model';
import { comparison } from '../nutrition/diary/diary.model';
import { scaleFood } from '../nutrition/foods/food.model';
import { brandedDocument, blue, heading, label, number, pale, text } from './document-style';
import type { PdfDocument, PdfNode } from './routine-document';

export function nutritionDocument(person: Person, date: LocalDate, logs: FoodLog[], target: DailyTargetSnapshot | null): PdfDocument {
  if (logs.some(log => log.personId !== person.id || log.date !== date) || (target && (target.personId !== person.id || target.date !== date)))
    throw new Error('Hay registros de otra persona o fecha.');
  if (!logs.length) throw new Error('No hay consumo real guardado para esta fecha.');
  const totals = comparison(logs, target);
  const content: PdfNode[] = [text('ENTRENA CON JESÚS / PROGRESO NUTRICIONAL'), heading(`Consumo real · ${date}`),
    text(`Persona: ${person.displayName} · ${person.reference || 'Espacio local'}`),
    { text: 'CONSUMO REAL GUARDADO · Las kcal provienen del alimento publicado; no se derivan de las macros 4/4/9.', bold: true, color: blue, fillColor: pale, margin: [0, 8, 0, 8] }];
  if (target) content.push(text(`Objetivo guardado para ${date} · versión ${target.version} · ${totals.provisional ? 'estimación provisional' : target.calculation.result.expenditure.mode === 'manual-tdee' ? 'gasto manual declarado' : 'estimación diaria'}. Gasto: ${number(totals.expenditure!)} kcal · ajuste del objetivo: ${number(totals.adjustment!)} kcal. Balance consumo menos gasto: ${number(totals.actual.kcal - totals.expenditure!)} kcal.`));
  else content.push(text('Sin objetivo diario guardado para esta persona y fecha. No se calcula restante ni exceso.'));
  const metrics: [keyof Nutrients, string, string][] = [['kcal', 'Energía', 'kcal'], ['protein', 'Proteínas', 'g'], ['carbohydrate', 'Carbohidratos', 'g'], ['fat', 'Grasas', 'g']];
  const summary: PdfNode[][] = [[{ text: 'Métrica', bold: true }, { text: 'Consumido / objetivo', bold: true }, { text: 'Restante o exceso', bold: true }]];
  for (const [key, label, unit] of metrics) {
    const actual = totals.actual[key], goal = totals.target?.[key], difference = totals.remaining?.[key];
    summary.push([{ text: label }, { text: `${number(actual)} / ${goal === undefined ? 'sin objetivo' : number(goal)} ${unit}` },
      { text: difference === undefined ? 'Sin objetivo' : `${difference < 0 ? 'Exceso' : 'Restante'} ${number(Math.abs(difference))} ${unit}` }]);
  }
  content.push({ table: { headerRows: 1, dontBreakRows: true, widths: ['25%', '38%', '*'], body: summary }, layout: 'lightHorizontalLines', margin: [0, 8, 0, 8] });
  content.push(text('Resumen textual de los indicadores: cada cifra indica el consumo real, la meta guardada (si existe) y su diferencia; un objetivo de 0 g puede mostrar exceso.'));
  const groups = new Map<string, FoodLog[]>();
  for (const log of logs) groups.set(log.mealLabel, [...(groups.get(log.mealLabel) ?? []), log]);
  for (const [group, entries] of groups) {
    const rows: PdfNode[][] = [[{ text: `Comida real · ${label(group)}`, colSpan: 2, bold: true, color: blue, fontSize: 12 }, {}],
      [{ text: 'Alimento · gramos', bold: true }, { text: 'Kcal publicadas · P / C / G', bold: true }]];
    for (const log of entries) {
      const n = scaleFood(log.food.per100g, log.grams);
      rows.push([{ text: `${label(log.food.name)} · ${number(log.grams)} g`, margin: [3, 4, 3, 4] },
        { text: `${number(n.kcal)} kcal · ${number(n.protein)} / ${number(n.carbohydrate)} / ${number(n.fat)} g`, margin: [3, 4, 3, 4] }]);
    }
    content.push({ table: { headerRows: 2, keepWithHeaderRows: 1, dontBreakRows: true, widths: ['45%', '*'], body: rows }, layout: 'lightHorizontalLines' });
  }
  return brandedDocument(person.displayName, date, 'CONSUMO REAL', content);
}
