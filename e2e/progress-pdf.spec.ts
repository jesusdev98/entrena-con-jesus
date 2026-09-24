import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function onboard(page: Page, path: string): Promise<void> {
  await page.goto(path); await page.getByRole('radio', { name: /Entrenador/ }).check();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Jesús');
  await page.getByRole('button', { name: 'Crear mi espacio' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Jesús');
}
async function plan(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('link', { name: 'Planes de comidas' }).click();
  await page.getByRole('button', { name: 'Crear plan semanal / recuperar nuevo' }).click();
  await page.getByRole('textbox', { name: 'Nombre del plan' }).fill('Menú de Jesús');
  const day = page.getByTestId('plan-day').first(); await day.locator('summary').first().click();
  const meal = day.getByTestId('plan-meal').first();
  await meal.getByRole('searchbox', { name: /Buscar alimento para/ }).fill('arroz blanco de grano largo sin enriquecer crudo');
  const choice = meal.getByRole('combobox', { name: 'Elegir alimento (preparación y origen)' });
  await expect(choice.locator('option:not([value=""])').first()).toBeAttached();
  await choice.selectOption({ index: 1 }); await meal.getByRole('button', { name: 'Añadir alimento (indica los gramos)' }).click();
  await meal.getByTestId('planned-food').getByRole('spinbutton', { name: /^Gramos de/ }).fill('150');
  await page.getByRole('button', { name: 'Guardar plan válido' }).click();
  await expect(page.getByTestId('meal-plan-card')).toContainText('Menú de Jesús');
}
async function download(page: Page, button: RegExp, outputPath: string, expected: string): Promise<number> {
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: button }).click();
  const file = await pending; expect(file.suggestedFilename()).toMatch(/^entrena-con-jesus-.*\.pdf$/);
  await file.saveAs(outputPath); const bytes = await readFile(outputPath); const raw = bytes.toString('latin1');
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-'); expect(bytes.length).toBeGreaterThan(5000);
  expect(raw).toContain('/ToUnicode'); expect(raw).toContain('/Font');
  expect(raw).toContain(expected); // PDF metadata subject identifies the document type even with compressed page streams.
  await expect(page.getByRole('status').filter({ hasText: 'PDF descargado.' })).toBeVisible();
  return (raw.match(/\/Type\s*\/Page\b/g) ?? []).length;
}
async function diary(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('link', { name: 'Diario alimentario' }).click();
  await page.getByLabel('Fecha del diario').fill('2026-09-21');
  await page.getByRole('combobox', { name: 'Comida del plan' }).selectOption({ index: 1 });
  await page.getByRole('spinbutton', { name: /Gramos reales de/ }).fill('100');
  await page.getByRole('button', { name: 'Marcar comida consumida' }).click();
  await expect(page.getByTestId('actual-food')).toHaveCount(1);
}
async function target(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('link', { name: 'Actividad diaria y objetivos' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Borrador recuperado' })).toBeVisible();
  await page.getByLabel('Fecha de actividad').fill('2026-09-21');
  await expect(page.getByRole('heading', { name: 'Jesús · 2026-09-21' })).toBeVisible();
  await page.getByLabel('Método de gasto diario').selectOption('manual-tdee');
  await page.getByRole('spinbutton', { name: 'Gasto diario manual (kcal)' }).fill('2100');
  await page.getByRole('textbox', { name: 'Fuente o motivo del gasto diario manual' }).fill('Estimación propia');
  await page.getByRole('button', { name: 'Guardar actividad y objetivo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Actividad y objetivo guardados' })).toBeVisible();
}
async function training(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Rutinas', exact: true }).click();
  await page.getByRole('button', { name: 'Crear rutina / recuperar nueva' }).click();
  await page.getByRole('textbox', { name: 'Nombre de la rutina' }).fill('Fuerza real');
  await page.getByRole('button', { name: 'Añadir ejercicio', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('searchbox', { name: 'Buscar ejercicio' }).fill('peso muerto');
  await dialog.getByRole('button', { name: /Ver detalles de/ }).first().click();
  await dialog.getByRole('button', { name: 'Añadir al día' }).click();
  const exercise = page.getByTestId('routine-exercise').first();
  await exercise.getByRole('spinbutton', { name: 'Repeticiones mínimas' }).fill('8');
  await exercise.getByRole('spinbutton', { name: 'Repeticiones máximas' }).fill('12');
  await exercise.getByRole('spinbutton', { name: 'Peso externo (kg)' }).fill('20');
  await exercise.getByRole('button', { name: 'Duplicar serie 1' }).click();
  await page.getByRole('button', { name: 'Guardar rutina válida' }).click();
  await page.getByRole('link', { name: 'Entrenar Fuerza real' }).click();
  await page.getByLabel('Fecha de entrenamiento').fill('2026-09-21');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  const sets = page.getByTestId('actual-set');
  await sets.first().getByRole('spinbutton', { name: /Peso real/ }).fill('22');
  await sets.first().getByRole('spinbutton', { name: /Repeticiones reales/ }).fill('10');
  await sets.first().getByRole('spinbutton', { name: /RIR real/ }).fill('1');
  await sets.first().getByRole('spinbutton', { name: /RPE real/ }).fill('8');
  await sets.first().getByRole('button', { name: /^Completar serie/ }).click();
  await sets.nth(1).getByRole('button', { name: /^No realizada/ }).click();
  await page.getByRole('button', { name: 'Finalizar y guardar sesión' }).click();
  await expect(page.getByText('Sesión finalizada y guardada. Ya aparece en el historial.')).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Progreso', exact: true }).click();
  await page.getByLabel('Fecha de la semana').fill('2026-09-21');
  await expect(page.getByRole('region', { name: 'Semana seleccionada' }).getByTestId('session-summary')).toHaveCount(1);
}
async function offline(page: Page, path: string): Promise<void> {
  await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
  await expect(page.getByText('Recursos de esta entrega disponibles sin conexión.', { exact: true })).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(async () => {
    const worker = await navigator.serviceWorker.ready;
    const { resources } = await (await fetch(new URL('resource-manifest.json', document.baseURI))).json() as { resources: string[] };
    const cached = await Promise.all([...resources, 'resource-manifest.json'].map(resource => caches.match(new URL(resource, document.baseURI))));
    return worker.active?.state === 'activated' && !!navigator.serviceWorker.controller && cached.every(result => result?.ok);
  })).toBe(true);
  await page.context().setOffline(true); await page.reload(); expect(new URL(page.url()).pathname).toBe(path);
}

for (const path of ['/', '/entrena/']) test(`three actual saved PDF downloads offline at ${path}`, async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 }); await onboard(page, path); await plan(page); await diary(page); await training(page);
  await offline(page, path);
  const remote: string[] = []; page.on('request', request => { if (new URL(request.url()).origin !== new URL(page.url()).origin) remote.push(request.url()); });
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('link', { name: 'Planes de comidas' }).click();
  await page.getByLabel('Fecha de objetivo guardado como referencia indicativa (opcional)').fill('2026-09-21');
  expect(await download(page, /Descargar PDF del plan Menú de Jesús/, info.outputPath('meal.pdf'), 'PLAN PREVISTO')).toBeGreaterThan(0);
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('link', { name: 'Diario alimentario' }).click();
  await page.getByLabel('Fecha del diario').fill('2026-09-21');
  expect(await download(page, /Descargar PDF del consumo real/, info.outputPath('nutrition.pdf'), 'CONSUMO REAL')).toBeGreaterThan(0);
  await page.getByRole('navigation').getByRole('link', { name: 'Progreso', exact: true }).click();
  await page.getByLabel('Fecha de la semana').fill('2026-09-21');
  await page.getByLabel('Fecha exacta (opcional)').fill('2026-09-21');
  expect(await download(page, /Descargar PDF de entrenamientos reales/, info.outputPath('training.pdf'), 'ENTRENAMIENTO REAL')).toBeGreaterThan(0);
  expect(remote).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: /Descargar PDF de entrenamientos reales/ }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('progress-controls-320.png') });
  await page.getByRole('link', { name: 'Gestionar personas' }).click();
  await page.getByRole('link', { name: 'Añadir cliente' }).click();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Jesús');
  await page.getByRole('textbox', { name: 'Referencia' }).fill('Otro espacio');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByRole('combobox', { name: 'Persona activa' }).locator('option:checked')).toContainText('Otro espacio');
  await page.getByRole('navigation').getByRole('link', { name: 'Progreso', exact: true }).click();
  await page.getByLabel('Fecha de la semana').fill('2026-09-21');
  await expect(page.getByRole('button', { name: /Descargar PDF de entrenamientos reales/ })).toBeDisabled();
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('link', { name: 'Planes de comidas' }).click();
  await expect(page.getByTestId('meal-plan-card')).toHaveCount(0);
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('link', { name: 'Diario alimentario' }).click();
  await page.getByLabel('Fecha del diario').fill('2026-09-21');
  await expect(page.getByRole('button', { name: /Descargar PDF del consumo real/ })).toBeDisabled();
});

test('saved manual target is reported separately from published actual intake', async ({ page }, info) => {
  await onboard(page, '/'); await plan(page); await target(page); await diary(page);
  await page.getByRole('button', { name: /Descargar PDF del consumo real/ }).scrollIntoViewIfNeeded();
  expect(await download(page, /Descargar PDF del consumo real/, info.outputPath('nutrition-target.pdf'), 'CONSUMO REAL')).toBe(1);
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('link', { name: 'Planes de comidas' }).click();
  await page.getByLabel('Fecha de objetivo guardado como referencia indicativa (opcional)').fill('2026-09-21');
  expect(await download(page, /Descargar PDF del plan Menú de Jesús/, info.outputPath('meal-target.pdf'), 'PLAN PREVISTO')).toBeGreaterThan(0);
});

test('long saved meal plan produces repeated table headers across complete pages', async ({ page }, info) => {
  await onboard(page, '/'); await plan(page);
  await page.getByRole('button', { name: 'Editar Menú de Jesús' }).click();
  await page.getByRole('textbox', { name: 'Notas del plan' }).fill('Indicaciones planificadas. '.repeat(90));
  for (let index = 0; index < 5; index++) await page.getByRole('button', { name: 'Duplicar semana 1', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar plan válido' }).click();
  await expect(page.getByTestId('meal-plan-card')).toContainText('6 semanas');
  expect(await download(page, /Descargar PDF del plan Menú de Jesús/, info.outputPath('long-meal.pdf'), 'PLAN PREVISTO')).toBe(19);
});

test('long actual training history paginates frozen targets and completed sets', async ({ page }, info) => {
  await onboard(page, '/'); await training(page);
  await page.evaluate(async () => {
    const name = (await indexedDB.databases()).find(item => item.name?.includes('entrena'))!.name!;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('trainingSessions', 'readwrite'); const store = tx.objectStore('trainingSessions');
    const saved = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const request = store.getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    for (let i = 0; i < 16; i++) store.add({ ...structuredClone(saved[0]), id: crypto.randomUUID(), notes: `Notas de sesión ${i + 1}: ` + 'Resultados registrados. '.repeat(14) });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  });
  await page.getByRole('button', { name: 'Actualizar historial' }).click();
  await expect(page.getByRole('region', { name: 'Semana seleccionada' }).getByTestId('session-summary')).toHaveCount(17);
  expect(await download(page, /Descargar PDF de entrenamientos reales/, info.outputPath('long-training.pdf'), 'ENTRENAMIENTO REAL')).toBe(6);
});
