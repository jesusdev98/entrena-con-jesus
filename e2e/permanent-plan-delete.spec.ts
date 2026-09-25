import { expect, test, type Page } from '@playwright/test';
import { markLegacyWorkspace } from './support/legacy-workspace';

async function onboard(page: Page): Promise<void> {
  await page.goto('/'); await markLegacyWorkspace(page); await page.getByRole('radio', { name: /Entrenador/ }).check();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Jesús');
  await page.getByRole('button', { name: 'Crear mi espacio' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Jesús');
}
async function routines(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Rutinas', exact: true }).click();
}
async function meals(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('link', { name: 'Planes de comidas' }).click();
}
async function diary(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('link', { name: 'Diario alimentario' }).click();
}
async function dialogCheck(page: Page, name: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: new RegExp(`Eliminar definitivamente .*${name}`) });
  await expect(dialog).toBeVisible(); await expect(dialog).toContainText('irreversible');
  await expect(dialog).toContainText('entrenamientos y consumos reales');
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Eliminar definitivamente', exact: true })).toHaveCSS('background-color', 'rgb(168, 32, 50)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('routine confirmation cancels safely and permanent deletion retains actual training and correction', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 }); await onboard(page); await routines(page);
  await page.getByRole('button', { name: 'Crear rutina / recuperar nueva' }).click();
  await page.getByRole('textbox', { name: 'Nombre de la rutina' }).fill('Plan real');
  await page.getByRole('textbox', { name: 'Nombre del día' }).fill('Día real');
  const exerciseName = await page.evaluate(async () => {
    const catalog = await (await fetch(new URL('catalogs/exercises.es.json', document.baseURI))).json() as { entries: { name: string; category: string; loggingType: string }[] };
    return catalog.entries.find(entry => entry.category === 'strength' && entry.loggingType === 'weight-reps')!.name;
  });
  await page.getByRole('button', { name: 'Añadir ejercicio', exact: true }).click();
  const picker = page.getByRole('dialog'); await picker.getByRole('searchbox', { name: 'Buscar ejercicio' }).fill(exerciseName);
  await picker.getByRole('button', { name: `Ver detalles de ${exerciseName}` }).click();
  await picker.getByRole('button', { name: 'Añadir al día', exact: true }).click();
  const exercise = page.getByTestId('routine-exercise');
  await exercise.getByRole('spinbutton', { name: 'Repeticiones mínimas' }).fill('8');
  await exercise.getByRole('spinbutton', { name: 'Repeticiones máximas' }).fill('12');
  await page.getByRole('button', { name: 'Guardar rutina válida' }).click();
  await expect(page.getByTestId('routine-card')).toHaveCount(1);
  await page.getByRole('link', { name: 'Entrenar Plan real' }).click();
  await page.getByLabel('Fecha de entrenamiento').fill('2026-01-01');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  const set = page.getByTestId('actual-set').first();
  await set.getByRole('spinbutton', { name: /Peso real/ }).fill('22');
  await set.getByRole('spinbutton', { name: /Repeticiones reales/ }).fill('10');
  await set.getByRole('spinbutton', { name: /RIR real/ }).fill('1');
  await set.getByRole('spinbutton', { name: /RPE real/ }).fill('8');
  await set.getByRole('button', { name: /^Completar serie/ }).click();
  await page.getByRole('button', { name: 'Finalizar y guardar sesión' }).click();
  await routines(page);
  await page.getByRole('button', { name: 'Eliminar definitivamente Plan real' }).click();
  await dialogCheck(page, 'Plan real'); await page.screenshot({ path: info.outputPath('routine-confirm-320.png') });
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByTestId('routine-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Eliminar definitivamente Plan real' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar definitivamente', exact: true }).click();
  await expect(page.getByTestId('routine-card')).toHaveCount(0);
  await expect(page.getByText('No hay rutinas guardadas para esta persona. Crea una rutina válida para empezar a entrenar.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear primera rutina' })).toBeEnabled();
  await page.reload(); await page.getByRole('button', { name: 'Ver rutinas archivadas' }).click();
  await expect(page.getByTestId('routine-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Descargar PDF de Plan real/ })).toHaveCount(0);
  await page.getByRole('navigation').getByRole('link', { name: 'Progreso' }).click();
  await page.getByLabel('Fecha de la semana').fill('2026-01-01');
  await expect(page.getByTestId('session-summary')).toContainText('22 kg externos');
  await expect(page.getByRole('button', { name: 'Descargar PDF de entrenamientos reales de la semana' })).toBeEnabled();
  const [trainingPdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar PDF de entrenamientos reales de la semana' }).click()]);
  expect(trainingPdf.suggestedFilename()).toMatch(/entrenamiento.*\.pdf$/);
  await page.getByRole('link', { name: /^Corregir sesión/ }).click();
  await expect(page.getByTestId('actual-set')).toContainText('22 kg externos');
  await page.getByTestId('actual-set').getByRole('button', { name: /^Corregir serie/ }).click();
  await expect(page.getByTestId('actual-set').getByRole('spinbutton', { name: /Peso real/ })).toHaveValue('22');
});

test('meal confirmation and stale editor cannot resurrect deleted plan; actual intake and undo remain', async ({ page, context }, info) => {
  await page.setViewportSize({ width: 320, height: 740 }); await onboard(page); await meals(page);
  await page.getByRole('button', { name: 'Crear plan semanal / recuperar nuevo' }).click();
  await page.getByRole('textbox', { name: 'Nombre del plan' }).fill('Semana real');
  const meal = page.getByTestId('plan-day').first(); await meal.locator('summary').first().click();
  const group = meal.getByTestId('plan-meal').first();
  await group.getByRole('searchbox', { name: /Buscar alimento para/ }).fill('arroz blanco de grano largo sin enriquecer crudo');
  const choice = group.getByRole('combobox', { name: 'Elegir alimento (preparación y origen)' });
  await expect(choice.locator('option:not([value=""])').first()).toBeAttached();
  await choice.selectOption({ index: 1 }); await group.getByRole('button', { name: 'Añadir alimento (indica los gramos)' }).click();
  await group.getByTestId('planned-food').getByRole('spinbutton', { name: /^Gramos de/ }).fill('100');
  await page.getByRole('button', { name: 'Guardar plan válido' }).click();
  await expect(page.getByTestId('meal-plan-card')).toHaveCount(1);
  await diary(page); await page.getByLabel('Fecha del diario').fill('2026-09-21');
  await page.getByRole('combobox', { name: 'Comida del plan' }).selectOption({ index: 1 });
  await page.getByRole('spinbutton', { name: /Gramos reales de/ }).fill('175');
  await page.getByRole('button', { name: 'Marcar comida consumida' }).click();
  await expect(page.getByTestId('actual-food')).toContainText('175 g');
  await meals(page);
  const stale = await context.newPage(); await stale.goto(page.url());
  await stale.getByRole('button', { name: 'Editar Semana real' }).click();
  await page.getByRole('button', { name: 'Archivar Semana real' }).click();
  await page.getByRole('button', { name: 'Ver planes archivados' }).click();
  await expect(page.getByTestId('meal-plan-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Descargar PDF del plan Semana real/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Eliminar definitivamente Semana real' }).click();
  await dialogCheck(page, 'Semana real'); await page.screenshot({ path: info.outputPath('meal-confirm-320.png') });
  await page.keyboard.press('Escape'); await expect(page.getByTestId('meal-plan-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Eliminar definitivamente Semana real' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar definitivamente', exact: true }).click();
  await expect(page.getByTestId('meal-plan-card')).toHaveCount(0);
  await expect(page.getByText('No hay planes archivados. Vuelve a los planes activos o crea uno nuevo.')).toBeVisible();
  await stale.getByRole('textbox', { name: 'Notas del plan' }).fill('Edición tardía');
  await expect(stale.getByRole('heading', { name: 'El plan o borrador cambió' })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Ver planes archivados' }).click();
  await expect(page.getByTestId('meal-plan-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Descargar PDF del plan Semana real/ })).toHaveCount(0);
  await diary(page); await page.getByLabel('Fecha del diario').fill('2026-09-21');
  await expect(page.getByTestId('actual-food')).toContainText('175 g');
  await expect(page.getByRole('button', { name: 'Descargar PDF del consumo real de 2026-09-21' })).toBeEnabled();
  const [diaryPdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar PDF del consumo real de 2026-09-21' }).click()]);
  expect(diaryPdf.suggestedFilename()).toMatch(/nutricion.*\.pdf$/);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Deshacer comida consumida' }).click();
  await expect(page.getByTestId('actual-food')).toHaveCount(0);
  await stale.close();
});
