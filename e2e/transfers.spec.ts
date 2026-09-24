import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function onboard(page: Page, mode: 'Entrenador' | 'Cliente', path = '/'): Promise<void> {
  await page.goto(path);
  await page.getByRole('radio', { name: new RegExp(mode) }).check();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill(mode === 'Entrenador' ? 'Entrenador' : 'Cliente');
  await page.getByRole('button', { name: 'Crear mi espacio' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText(mode);
}
async function open(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('link', { name: /Compartir planes/ }).click();
  await expect(page.getByRole('heading', { name: 'Compartir planes' })).toBeVisible();
}
async function exportFile(page: Page, name: string): Promise<Buffer> {
  await open(page);
  await page.getByLabel('Plan guardado de esta persona').selectOption({ label: name });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar JSON' }).click();
  return readFile(await (await download).path());
}
async function importFile(page: Page, file: Buffer, choice: 'Aceptar revisión recibida' | 'Conservar original local' | 'Guardar copia independiente'): Promise<void> {
  await open(page);
  await page.getByLabel('Archivo JSON recibido').setInputFiles({ name: 'plan.json', mimeType: 'application/json', buffer: file });
  await expect(page.getByRole('heading', { name: 'Revisión previa' })).toBeVisible();
  await page.getByRole('radio', { name: choice }).check();
  await page.getByRole('checkbox', { name: 'Confirmo el destino y esta decisión' }).check();
  await page.getByRole('button', { name: 'Aplicar decisión' }).click();
  await expect(page.getByText('Decisión aplicada.', { exact: false })).toBeVisible();
}
async function isolated(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  return { context, page: await context.newPage() };
}
async function ready(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
  await expect(page.getByText('Recursos de esta entrega disponibles sin conexión.', { exact: true })).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const manifest = await (await fetch(new URL('resource-manifest.json', document.baseURI))).json() as { resources: string[] };
    const resources = await Promise.all([...manifest.resources, 'resource-manifest.json'].map(resource => caches.match(new URL(resource, document.baseURI))));
    return registration.active?.state === 'activated' && navigator.serviceWorker.controller !== null && resources.length > 1 && resources.every(response => response?.ok);
  })).toBe(true);
}

test('trainer and client review a selected plan across isolated contexts at 320px', async ({ browser, page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 }); await onboard(page, 'Entrenador');
  await page.getByRole('link', { name: 'Gestionar personas' }).click(); await page.getByRole('link', { name: 'Añadir cliente' }).click();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Alex');
  await page.getByRole('textbox', { name: 'Referencia' }).fill('Cliente A');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByRole('combobox', { name: 'Persona activa' }).locator('option:checked')).toContainText('Cliente A');
  const first = await page.getByRole('combobox', { name: 'Persona activa' }).inputValue();
  await page.getByRole('link', { name: 'Gestionar personas' }).click(); await page.getByRole('link', { name: 'Añadir cliente' }).click();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Alex');
  await page.getByRole('textbox', { name: 'Referencia' }).fill('Cliente B');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByRole('combobox', { name: 'Persona activa' }).locator('option:checked')).toContainText('Cliente B');
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(first);
  await expect(page.getByRole('combobox', { name: 'Persona activa' }).locator('option:checked')).toContainText('Cliente A');
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.locator('a[href*="meal-plans"]').first().click();
  await page.getByRole('button', { name: 'Crear plan semanal / recuperar nuevo' }).click();
  await page.getByRole('textbox', { name: 'Nombre del plan' }).fill('Plan para Alex');
  await page.getByRole('button', { name: 'Guardar plan válido', exact: true }).click();
  await expect(page.getByText('Plan de comidas guardado en esta persona.', { exact: true })).toBeVisible();
  const firstFile = await exportFile(page, 'Comidas · Plan para Alex');
  expect(JSON.parse(firstFile.toString()).payload.plans).toHaveLength(1);
  const client = await isolated(browser);
  try {
    await onboard(client.page, 'Cliente');
    await importFile(client.page, firstFile, 'Aceptar revisión recibida');
    await client.page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
    await client.page.locator('a[href*="meal-plans"]').first().click();
    await client.page.getByRole('button', { name: 'Editar Plan para Alex' }).click();
    await client.page.getByRole('textbox', { name: 'Nombre del plan' }).fill('Plan ajustado');
    await client.page.getByRole('button', { name: 'Guardar plan válido', exact: true }).click();
    const returnFile = await exportFile(client.page, 'Comidas · Plan ajustado');
    await open(page);
    await page.getByLabel('Archivo JSON recibido').setInputFiles({ name: 'return.json', mimeType: 'application/json', buffer: returnFile });
    await expect(page.getByText('Plan.name', { exact: true })).toBeVisible();
    await expect(page.getByText(/Destino elegido: Alex · Cliente A/)).toBeVisible();
    await expect(page.getByText(/Versión recibida/)).toBeVisible();
    await page.getByText('Plan.name', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('plan-review-320.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('radio', { name: 'Conservar original local' }).check();
    await page.getByRole('checkbox', { name: 'Confirmo el destino y esta decisión' }).check();
    await page.getByRole('button', { name: 'Aplicar decisión' }).click();
    await expect(page.getByText('Decisión aplicada.', { exact: false })).toBeVisible();
    await importFile(page, returnFile, 'Aceptar revisión recibida');
    await importFile(page, returnFile, 'Aceptar revisión recibida');
    await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(await page.getByRole('combobox', { name: 'Persona activa' }).locator('option').filter({ hasText: 'Cliente B' }).getAttribute('value') ?? '');
    await expect(page.getByRole('combobox', { name: 'Persona activa' }).locator('option:checked')).toContainText('Cliente B');
    await open(page);
    await expect(page.getByLabel('Plan guardado de esta persona').locator('option')).toHaveCount(1);
  } finally { await client.context.close(); }
});

test('plan file import and export work offline after both isolated caches are ready', async ({ browser, page }) => {
  await onboard(page, 'Entrenador');
  const client = await isolated(browser);
  try {
    await onboard(client.page, 'Cliente');
    await ready(page); await ready(client.page);
    await page.context().setOffline(true); await client.context.setOffline(true);
    await page.reload(); await client.page.reload();
    await page.getByRole('navigation').getByRole('link', { name: 'Alimentación' }).click();
    await page.getByRole('button', { name: 'Añadir alimento personalizado' }).click();
    await page.getByRole('textbox', { name: 'Nombre del alimento' }).fill('Receta sin conexión');
    for (const [label, value] of [['Energía', '140'], ['Proteínas', '5'], ['Carbohidratos', '20'], ['Grasas', '4']]) {
      await page.getByRole('spinbutton', { name: new RegExp(`^${label} \\(`) }).fill(value);
    }
    await page.getByRole('button', { name: 'Guardar alimento', exact: true }).click();
    await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
    await page.locator('a[href*="meal-plans"]').first().click();
    await page.getByRole('button', { name: 'Crear plan semanal / recuperar nuevo' }).click();
    await page.getByRole('textbox', { name: 'Nombre del plan' }).fill('Plan sin conexión');
    const day = page.getByTestId('plan-day').first(); await day.locator('summary').first().click();
    const meal = day.getByTestId('plan-meal').first();
    await meal.getByRole('searchbox', { name: /Buscar alimento para/ }).fill('Receta sin conexión');
    const option = meal.getByRole('combobox', { name: 'Elegir alimento (preparación y origen)' }).locator('option:not([value=""])').first();
    await expect(option).toBeAttached();
    await meal.getByRole('combobox', { name: 'Elegir alimento (preparación y origen)' }).selectOption(await option.getAttribute('value') ?? '');
    await meal.getByRole('button', { name: 'Añadir alimento (indica los gramos)' }).click();
    await meal.getByTestId('planned-food').first().getByRole('spinbutton', { name: /^Gramos de / }).fill('125');
    await page.getByRole('button', { name: 'Guardar plan válido', exact: true }).click();
    const file = await exportFile(page, 'Comidas · Plan sin conexión');
    await importFile(client.page, file, 'Aceptar revisión recibida');
    await client.page.reload();
    await client.page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
    await client.page.locator('a[href*="meal-plans"]').first().click();
    await client.page.getByRole('button', { name: 'Editar Plan sin conexión' }).click();
    await client.page.getByTestId('plan-day').first().locator('summary').first().click();
    await expect(client.page.getByTestId('planned-food').first()).toContainText('Receta sin conexión');
    await client.page.getByRole('button', { name: 'Cerrar y conservar borrador' }).click();
    const back = await exportFile(client.page, 'Comidas · Plan sin conexión');
    expect(JSON.parse(back.toString()).payload.plans[0].planId).toBe(JSON.parse(file.toString()).payload.plans[0].planId);
  } finally { await client.context.close(); }
});

async function progressFile(page: Page, date: string): Promise<Buffer> {
  await open(page);
  await page.getByLabel('Desde', { exact: true }).fill(date);
  await page.getByLabel('Hasta', { exact: true }).fill(date);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar progreso JSON' }).click();
  return readFile(await (await download).path());
}
async function progressReview(page: Page, buffer: Buffer): Promise<void> {
  await open(page);
  await page.getByLabel('Archivo de progreso JSON recibido').setInputFiles({ name: 'progreso.json', mimeType: 'application/json', buffer });
  await expect(page.getByRole('heading', { name: 'Revisión del progreso' })).toBeVisible();
}
async function confirmProgress(page: Page): Promise<void> {
  await page.getByRole('checkbox', { name: 'Confirmo la persona destinataria y las decisiones del progreso' }).check();
  await page.getByRole('button', { name: 'Aplicar progreso revisado' }).click();
  await expect(page.getByText('Progreso aplicado.', { exact: false })).toBeVisible();
}
async function actualFood(page: Page, date: string, grams: string): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.locator('a[href*="diary"]').first().click();
  await page.getByLabel('Fecha del diario').fill(date);
  await page.getByRole('searchbox', { name: 'Buscar alimento USDA o personalizado' }).fill('arroz');
  const option = page.getByLabel('Elegir alimento y origen').locator('option:not([value=""])').first();
  await expect(option).toBeAttached();
  await page.getByLabel('Elegir alimento y origen').selectOption(await option.getAttribute('value') ?? '');
  await page.getByRole('spinbutton', { name: 'Gramos consumidos' }).fill(grams);
  await page.getByRole('button', { name: 'Registrar alimento consumido' }).click();
  await expect(page.getByTestId('actual-food')).toHaveCount(1);
}

test('selected trainer plan → client actual training and diary → trainer review, conflicts and weekly history at 320px', async ({ browser, page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 }); await onboard(page, 'Entrenador');
  await page.getByRole('link', { name: 'Gestionar personas' }).click(); await page.getByRole('link', { name: 'Añadir cliente' }).click();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Alex');
  await page.getByRole('textbox', { name: 'Referencia' }).fill('Destinatario A');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByRole('combobox', { name: 'Persona activa' }).locator('option:checked')).toContainText('Destinatario A');
  const a = await page.getByRole('combobox', { name: 'Persona activa' }).inputValue();
  await page.getByRole('link', { name: 'Gestionar personas' }).click(); await page.getByRole('link', { name: 'Añadir cliente' }).click();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Alex');
  await page.getByRole('textbox', { name: 'Referencia' }).fill('Destinatario B');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(a);
  await expect(page.getByRole('combobox', { name: 'Persona activa' }).locator('option:checked')).toContainText('Destinatario A');
  await page.getByRole('navigation').getByRole('link', { name: 'Rutinas', exact: true }).click();
  await page.getByRole('button', { name: 'Crear rutina / recuperar nueva', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nombre de la rutina' }).fill('Rutina enviada');
  await page.getByRole('button', { name: 'Añadir ejercicio', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('searchbox', { name: 'Buscar ejercicio' }).fill('press');
  await dialog.getByRole('button', { name: /^Ver detalles de / }).first().click();
  await dialog.getByRole('button', { name: 'Añadir al día' }).click();
  const exercise = page.getByTestId('routine-exercise').first();
  await exercise.getByRole('spinbutton', { name: 'Repeticiones mínimas' }).fill('8');
  await exercise.getByRole('spinbutton', { name: 'Repeticiones máximas' }).fill('12');
  await exercise.getByRole('spinbutton', { name: 'Peso externo (kg)' }).fill('20');
  await page.getByRole('button', { name: 'Guardar rutina válida' }).click();
  await expect(page.getByText('Rutina válida guardada en esta persona.')).toBeVisible();
  const plan = await exportFile(page, 'Rutina · Rutina enviada');
  const client = await isolated(browser);
  try {
    await onboard(client.page, 'Cliente');
    await importFile(client.page, plan, 'Aceptar revisión recibida');
    await client.page.getByRole('navigation').getByRole('link', { name: 'Rutinas', exact: true }).click();
    await client.page.getByRole('link', { name: 'Entrenar Rutina enviada' }).click();
    await client.page.getByLabel('Fecha de entrenamiento').fill('2026-01-01');
    await client.page.getByRole('button', { name: 'Iniciar sesión' }).click();
    const set = client.page.getByTestId('actual-set').first();
    await set.getByRole('spinbutton', { name: /Peso real/ }).fill('25');
    await set.getByRole('spinbutton', { name: /Repeticiones reales/ }).fill('10');
    await set.getByRole('spinbutton', { name: /RPE real/ }).fill('8');
    await set.getByRole('button', { name: /^Completar serie/ }).click();
    await client.page.getByRole('button', { name: 'Finalizar y guardar sesión' }).click();
    await expect(client.page.getByText('Sesión finalizada y guardada. Ya aparece en el historial.')).toBeVisible();
    await actualFood(client.page, '2026-01-01', '120');
    const original = await progressFile(client.page, '2026-01-01');
    expect(JSON.parse(original.toString()).payload.sessions).toHaveLength(1);
    expect(JSON.parse(original.toString()).payload.foodLogs).toHaveLength(1);
    await progressReview(page, original);
    await expect(page.getByTestId('progress-record')).toHaveCount(2);
    await page.getByTestId('progress-record').first().locator('summary').click();
    await page.screenshot({ path: info.outputPath('progress-review-320.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await confirmProgress(page);
    await progressReview(page, original);
    await expect(page.getByText('Ya está presente')).toHaveCount(2);
    await confirmProgress(page);
    await page.getByRole('navigation').getByRole('link', { name: 'Progreso', exact: true }).click();
    await page.getByLabel('Fecha de la semana', { exact: true }).fill('2026-01-01');
    await expect(page.getByRole('region', { name: 'Semana seleccionada' })).toContainText('25 kg externos');
    await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
    await page.locator('a[href*="diary"]').first().click();
    await page.getByLabel('Fecha del diario').fill('2026-01-01');
    await expect(page.getByTestId('actual-food')).toHaveCount(1);
    await expect(page.getByText('No hay objetivo guardado para esta persona y fecha.', { exact: false })).toBeVisible();
    await client.page.getByRole('navigation').getByRole('link', { name: 'Progreso', exact: true }).click();
    await client.page.getByLabel('Fecha de la semana', { exact: true }).fill('2026-01-01');
    await client.page.getByRole('region', { name: 'Semana seleccionada' }).getByRole('link', { name: /^Corregir sesión/ }).click();
    const correction = client.page.getByTestId('actual-set').first();
    await correction.getByRole('button', { name: /^Corregir serie/ }).click();
    await correction.getByRole('spinbutton', { name: /Peso real/ }).fill('27');
    await correction.getByRole('button', { name: /^Completar serie/ }).click();
    await client.page.getByRole('button', { name: 'Guardar corrección intencional' }).click();
    await client.page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
    await client.page.locator('a[href*="diary"]').first().click();
    await client.page.getByLabel('Fecha del diario').fill('2026-01-01');
    await client.page.getByRole('button', { name: /^Editar registro real de / }).first().click();
    await client.page.getByRole('spinbutton', { name: /^Gramos reales de / }).fill('150');
    await client.page.getByRole('button', { name: 'Guardar cambio real' }).click();
    const changed = await progressFile(client.page, '2026-01-01');
    await progressReview(page, changed);
    await expect(page.getByText('Conflicto: el registro cambió', { exact: false })).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Aplicar progreso revisado' })).toBeDisabled();
    await page.getByRole('radio', { name: 'Conservar registro local' }).first().check();
    await page.getByRole('radio', { name: 'Reemplazar con recibido' }).last().check();
    await confirmProgress(page);
    await progressReview(page, changed);
    await page.getByRole('radio', { name: 'Reemplazar con recibido' }).check();
    await confirmProgress(page);
    await page.getByRole('navigation').getByRole('link', { name: 'Progreso', exact: true }).click();
    await page.getByLabel('Fecha de la semana', { exact: true }).fill('2026-01-01');
    await expect(page.getByRole('region', { name: 'Semana seleccionada' })).toContainText('27 kg externos');
    const unchangedPlan = await exportFile(page, 'Rutina · Rutina enviada');
    expect(JSON.parse(unchangedPlan.toString()).payload).toEqual(JSON.parse(plan.toString()).payload);
    await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(await page.getByRole('combobox', { name: 'Persona activa' }).locator('option').filter({ hasText: 'Destinatario B' }).getAttribute('value') ?? '');
    await open(page);
    await page.getByLabel('Archivo de progreso JSON recibido').setInputFiles({ name: 'progreso.json', mimeType: 'application/json', buffer: changed });
    await expect(page.getByRole('alert')).toContainText('vinculada a otra persona local');
    await page.getByRole('navigation').getByRole('link', { name: 'Progreso', exact: true }).click();
    await page.getByLabel('Fecha de la semana', { exact: true }).fill('2026-01-01');
    await expect(page.getByRole('region', { name: 'Semana seleccionada' }).getByTestId('session-summary')).toHaveCount(0);
  } finally { await client.context.close(); }
});

for (const path of ['/', '/entrena/']) {
test(`actual diary progress crosses isolated offline caches without network upload at ${path}`, async ({ browser, page }) => {
  await onboard(page, 'Entrenador', path);
  const client = await isolated(browser);
  try {
    await onboard(client.page, 'Cliente', path);
    await ready(page); await ready(client.page);
    await page.context().setOffline(true); await client.context.setOffline(true);
    await page.reload(); await client.page.reload();
    await actualFood(client.page, '2026-01-01', '110');
    const file = await progressFile(client.page, '2026-01-01');
    await progressReview(page, file); await confirmProgress(page);
    await page.reload();
    await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
    await page.locator('a[href*="diary"]').first().click();
    await page.getByLabel('Fecha del diario').fill('2026-01-01');
    await expect(page.getByTestId('actual-food')).toHaveCount(1);
    expect(new URL(page.url()).pathname).toBe(path);
    expect(new URL(client.page.url()).pathname).toBe(path);
  } finally { await client.context.close(); }
});
}
