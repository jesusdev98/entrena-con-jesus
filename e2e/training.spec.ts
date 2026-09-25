import { expect, test, type Locator, type Page } from '@playwright/test';
import { markLegacyWorkspace } from './support/legacy-workspace';

async function onboard(page: Page, path = '/'): Promise<void> {
  await page.goto(path); await markLegacyWorkspace(page); await page.getByRole('radio', { name: /Entrenador/ }).check();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Jesús'); await page.getByRole('button', { name: 'Crear mi espacio' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Jesús');
}
async function routines(page: Page): Promise<void> { await page.getByRole('navigation').getByRole('link', { name: 'Rutinas', exact: true }).click(); }
async function progress(page: Page, date = '2026-01-01'): Promise<Locator> {
  await page.getByRole('navigation').getByRole('link', { name: 'Progreso', exact: true }).click();
  await page.getByLabel('Fecha de la semana', { exact: true }).fill(date); return page.getByRole('region', { name: 'Semana seleccionada', exact: true });
}
async function add(page: Page, category: string, loggingType: string): Promise<Locator> {
  const name = await page.evaluate(async ({ category, loggingType }) => {
    const catalog = await (await fetch(new URL('catalogs/exercises.es.json', document.baseURI))).json() as { entries: { name: string; category: string; loggingType: string }[] };
    return catalog.entries.find(e => e.category === category && e.loggingType === loggingType)!.name;
  }, { category, loggingType });
  await page.getByRole('button', { name: 'Añadir ejercicio', exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByRole('searchbox', { name: 'Buscar ejercicio' }).fill(name); await dialog.getByRole('button', { name: `Ver detalles de ${name}`, exact: true }).click();
  await dialog.getByRole('button', { name: 'Añadir al día', exact: true }).click(); return page.getByTestId('routine-exercise').last();
}
async function plan(page: Page, mixed = false): Promise<void> {
  await routines(page); await page.getByRole('button', { name: 'Crear rutina / recuperar nueva', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nombre de la rutina', exact: true }).fill('Plan real');
  await page.getByRole('textbox', { name: 'Nombre del día', exact: true }).fill('Día mixto');
  const weights = await add(page, 'strength', 'weight-reps');
  await weights.getByRole('spinbutton', { name: 'Repeticiones mínimas', exact: true }).fill('8');
  await weights.getByRole('spinbutton', { name: 'Repeticiones máximas', exact: true }).fill('12');
  await weights.getByRole('spinbutton', { name: 'Peso externo (kg)', exact: true }).fill('20.5');
  await weights.getByRole('spinbutton', { name: 'RIR objetivo', exact: true }).fill('2');
  if (mixed) {
    await weights.getByRole('button', { name: 'Duplicar serie 1', exact: true }).click();
    const cardio = await add(page, 'cardio', 'distance-duration'); await cardio.getByRole('spinbutton', { name: 'Distancia (m)', exact: true }).fill('1500'); await cardio.getByRole('spinbutton', { name: 'Duración (s)', exact: true }).fill('600');
    const stretch = await add(page, 'stretching', 'duration'); await stretch.getByRole('spinbutton', { name: 'Duración (s)', exact: true }).fill('30');
  }
  await page.getByRole('button', { name: 'Guardar rutina válida', exact: true }).click(); await expect(page.getByText('Rutina válida guardada en esta persona.', { exact: true })).toBeVisible();
}
async function start(page: Page, date = '2026-01-01'): Promise<void> {
  await page.getByRole('link', { name: 'Entrenar Plan real', exact: true }).click();
  await page.getByLabel('Fecha de entrenamiento', { exact: true }).fill(date); await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Registro · Plan real · Día mixto', exact: true })).toBeFocused();
}
async function weight(set: Locator, value = '22.75'): Promise<void> {
  await set.getByRole('spinbutton', { name: /Peso real/ }).fill(value); await set.getByRole('spinbutton', { name: /Repeticiones reales/ }).fill('10');
  await set.getByRole('spinbutton', { name: /RIR real/ }).fill('1.5'); await set.getByRole('spinbutton', { name: /RPE real/ }).fill('8.5');
  await set.getByRole('button', { name: /^Completar serie/ }).click(); await expect(set.getByRole('button', { name: /^Corregir serie/ })).toBeFocused();
}
async function finish(page: Page, correction = false): Promise<void> {
  await page.getByRole('button', { name: correction ? 'Guardar corrección intencional' : 'Finalizar y guardar sesión', exact: true }).click();
  await expect(page.getByText('Sesión finalizada y guardada. Ya aparece en el historial.', { exact: true })).toBeVisible();
}
async function client(page: Page, reference: string): Promise<string> {
  await page.getByRole('link', { name: 'Gestionar personas' }).click(); await page.getByRole('link', { name: 'Añadir cliente' }).click();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Alex'); await page.getByRole('textbox', { name: 'Referencia' }).fill(reference); await page.getByRole('button', { name: 'Guardar perfil' }).click();
  const select = page.getByRole('combobox', { name: 'Persona activa' }); await expect(select.locator('option:checked')).toContainText(reference); return select.inputValue();
}

test('mixed actual session, explicit partial completion, revision immutability, correction, weekly comparison and 320px', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 }); await onboard(page); await plan(page, true); await start(page);
  const sets = page.getByTestId('actual-set'); await expect(sets).toHaveCount(4); await expect(sets.first().getByRole('spinbutton', { name: /Peso real/ })).toHaveValue('');
  await sets.first().getByRole('button', { name: /^Completar serie/ }).click(); await expect(sets.first().getByRole('alert')).toContainText('RPE');
  expect(await page.locator('app-training-editor').evaluate(root => {
    const ids = [...root.querySelectorAll('[id]')].map(node => node.id); const labels = [...root.querySelectorAll('label')];
    return new Set(ids).size === ids.length && labels.every(label => label.control) && new Set(labels.map(l => l.textContent)).size === labels.length;
  })).toBe(true);
  await sets.first().getByRole('spinbutton', { name: /Peso real/ }).fill('22.75');
  await expect(page.getByText('Borrador guardado. Sesión aún sin finalizar.', { exact: true })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: /^Continuar 2026-01-01/ }).click(); await expect(sets.first().getByRole('spinbutton', { name: /Peso real/ })).toHaveValue('22.75');
  await sets.first().scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('training-320.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await weight(sets.first()); await page.getByRole('button', { name: 'Finalizar y guardar sesión', exact: true }).click(); await expect(page.getByRole('alert').first()).toContainText('pendientes');
  await sets.nth(1).getByRole('button', { name: /^No realizada/ }).click();
  await sets.nth(2).getByRole('spinbutton', { name: /Distancia real/ }).fill('1250'); await sets.nth(2).getByRole('spinbutton', { name: /Duración real/ }).fill('510');
  await expect(sets.nth(2).getByRole('spinbutton', { name: /RIR real/ })).toHaveCount(0); await sets.nth(2).getByRole('spinbutton', { name: /RPE real/ }).fill('6.5'); await sets.nth(2).getByRole('button', { name: /^Completar serie/ }).click();
  await sets.nth(3).getByRole('spinbutton', { name: /Duración real/ }).fill('25'); await sets.nth(3).getByRole('spinbutton', { name: /RPE real/ }).fill('3'); await sets.nth(3).getByRole('button', { name: /^Completar serie/ }).click();
  await page.getByRole('spinbutton', { name: 'Duración de la sesión (min)', exact: true }).fill('42.5'); await finish(page); await page.reload();
  let week = await progress(page); await expect(week.getByTestId('session-summary')).toHaveCount(1); await expect(week).toContainText('2025-12-29 a 2026-01-04');
  await expect(week).toContainText('20.5 kg externos'); await expect(week).toContainText('22.75 kg externos'); await expect(week).toContainText('RPE 8.5'); await expect(week).toContainText('RIR real 1.5');
  await expect(week).toContainText('1250 m · 510 s'); await expect(week).toContainText('25 s · RPE 3'); await expect(week).toContainText('No realizada'); await expect(week).toContainText('3 series realizadas');
  await week.getByRole('heading').first().scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('history-320.png') }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await week.locator('table').first().scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('actual-vs-planned-320.png') });
  await routines(page); await page.getByRole('button', { name: 'Editar Plan real', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Peso externo (kg)', exact: true }).first().fill('99'); await page.getByRole('button', { name: 'Guardar rutina válida', exact: true }).click();
  await expect(page.getByText('Rutina válida guardada en esta persona.', { exact: true })).toBeVisible();
  week = await progress(page); await expect(week).toContainText('20.5 kg externos'); await expect(week).not.toContainText('99 kg externos');
  await week.getByRole('link', { name: /^Corregir sesión/ }).click(); await page.getByTestId('actual-set').first().getByRole('button', { name: /^Corregir serie/ }).click();
  await weight(page.getByTestId('actual-set').first(), '23.25'); await finish(page, true);
  await routines(page); await start(page, '2026-01-08'); await weight(sets.first(), '24');
  for (const set of await sets.all()) { const skip = set.getByRole('button', { name: /^No realizada/ }); if (await skip.count()) await skip.click(); }
  await finish(page); week = await progress(page, '2026-01-08'); await page.getByLabel('Comparar con la semana de', { exact: true }).fill('2026-01-01');
  const comparison = page.getByRole('region', { name: 'Semana de comparación', exact: true }); await expect(week).toContainText('24 kg externos'); await expect(week).toContainText('99 kg externos');
  await expect(comparison).toContainText('23.25 kg externos'); await expect(comparison).toContainText('20.5 kg externos');
  const exerciseId = await page.getByLabel('Filtrar por ejercicio', { exact: true }).locator('option').evaluateAll(options => (options.find(option => option.textContent?.includes('cardio')) as HTMLOptionElement | undefined)?.value);
  // Select the cardio identity from saved options using the displayed exercise in the second row.
  const cardioName = await comparison.locator('app-session-summary h4').nth(1).textContent();
  const selectedId = exerciseId ?? await page.getByLabel('Filtrar por ejercicio', { exact: true }).locator('option').evaluateAll((options, name) => (options.find(option => option.textContent?.startsWith(name!)) as HTMLOptionElement).value, cardioName);
  await page.getByLabel('Filtrar por ejercicio', { exact: true }).selectOption(selectedId); await expect(comparison.locator('h4')).toHaveCount(1); await expect(comparison).toContainText('1250 m · 510 s');
  await page.getByLabel('Fecha exacta (opcional)', { exact: true }).fill('2026-01-01'); await expect(week.getByTestId('session-summary')).toHaveCount(0); await expect(comparison.getByTestId('session-summary')).toHaveCount(1);
  await page.getByLabel('Fecha exacta (opcional)', { exact: true }).fill(''); await expect(week.getByTestId('session-summary')).toHaveCount(1);
});

test('actual drafts and saved history isolate same-name people and client/trainer workspaces', async ({ page }) => {
  await onboard(page); const a = await client(page, 'Mañana'); const b = await client(page, 'Tarde');
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(a); await plan(page); await start(page);
  await page.getByRole('spinbutton', { name: /Peso real/ }).fill('31.25');
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(b); await expect(page.getByRole('button', { name: /^Continuar / })).toHaveCount(0);
  let week = await progress(page); await expect(week.getByTestId('session-summary')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(a); await routines(page);
  await page.getByRole('link', { name: 'Registrar entrenamiento / continuar borrador', exact: true }).click(); await page.getByRole('button', { name: /^Continuar 2026-01-01/ }).click();
  await expect(page.getByRole('spinbutton', { name: /Peso real/ })).toHaveValue('31.25'); await weight(page.getByTestId('actual-set'), '31.25'); await finish(page);
  await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click(); await page.getByRole('button', { name: 'Cliente', exact: true }).click();
  week = await progress(page); await expect(week.getByTestId('session-summary')).toHaveCount(0);
  await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click(); await page.getByRole('button', { name: 'Entrenador', exact: true }).click();
  week = await progress(page); await expect(week).toContainText('31.25 kg externos'); await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(b);
  await expect(week.getByTestId('session-summary')).toHaveCount(0);
});

test('stale cross-tab session cannot overwrite saved actuals without explicit recovery', async ({ page, context }) => {
  await onboard(page); await plan(page); await start(page); await weight(page.getByTestId('actual-set')); await expect(page.getByText('Borrador guardado. Sesión aún sin finalizar.', { exact: true })).toBeVisible();
  const other = await context.newPage(); await other.goto(page.url()); await other.getByRole('button', { name: /^Continuar 2026-01-01/ }).click();
  await other.getByRole('textbox', { name: 'Notas de la sesión', exact: true }).fill('Saved from another tab'); await finish(other);
  await page.getByRole('textbox', { name: 'Notas de la sesión', exact: true }).fill('My local correction');
  const comparison = page.getByRole('region', { name: 'Comparación de sesión', exact: true }); await expect(comparison).toContainText('My local correction'); await expect(comparison).toContainText('Saved from another tab');
  await expect(page.getByRole('button', { name: 'Finalizar y guardar sesión', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Descartar mis cambios y recuperar versión durable', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Notas de la sesión', exact: true })).toHaveValue('Saved from another tab');
  await page.getByRole('textbox', { name: 'Notas de la sesión', exact: true }).fill('Reviewed correction'); await finish(page, true);
  const week = await progress(page); await expect(week.getByTestId('session-summary')).toHaveCount(1); await expect(week).toContainText('Reviewed correction'); await other.close();
});

for (const path of ['/', '/entrena/']) {
  test(`logs, recovers and reads actual history offline with cache proof at ${path}`, async ({ page, context }) => {
    await onboard(page, path); await plan(page); await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
    await expect(page.getByText('Recursos de esta entrega disponibles sin conexión.', { exact: true })).toBeVisible({ timeout: 30000 });
    expect(await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const manifest = await (await fetch(new URL('resource-manifest.json', document.baseURI))).json() as { resources: string[] };
      const resources = await Promise.all([...manifest.resources, 'resource-manifest.json'].map(resource => caches.match(new URL(resource, document.baseURI))));
      return registration.active?.state === 'activated' && !!navigator.serviceWorker.controller && resources.length > 1 && resources.every(response => response?.ok);
    })).toBe(true);
    await context.setOffline(true); await page.reload(); await routines(page); await start(page);
    await page.getByRole('spinbutton', { name: /Peso real/ }).fill('27.5'); await expect(page.getByText('Borrador guardado. Sesión aún sin finalizar.', { exact: true })).toBeVisible();
    await page.reload(); await page.getByRole('button', { name: /^Continuar 2026-01-01/ }).click(); await expect(page.getByRole('spinbutton', { name: /Peso real/ })).toHaveValue('27.5');
    await page.getByText('Instrucciones e ilustraciones guardadas', { exact: true }).click(); const images = page.locator('app-training-editor img'); await expect(images).toHaveCount(2);
    for (const image of await images.all()) expect(await image.evaluate(async element => { await (element as HTMLImageElement).decode(); return (element as HTMLImageElement).naturalWidth > 0; })).toBe(true);
    await weight(page.getByTestId('actual-set'), '27.5'); await finish(page); await progress(page); await page.reload();
    await page.getByLabel('Fecha de la semana', { exact: true }).fill('2026-01-01'); const week = page.getByRole('region', { name: 'Semana seleccionada', exact: true });
    await expect(week).toContainText('27.5 kg externos'); await expect(week).toContainText('RPE 8.5'); await expect(week.getByTestId('session-summary')).toHaveCount(1); expect(new URL(page.url()).pathname).toBe(path);
  });
}
