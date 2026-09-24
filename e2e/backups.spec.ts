import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function onboard(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await page.getByRole('radio', { name: /Entrenador/ }).check();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Entrenador');
  await page.getByRole('button', { name: 'Crear mi espacio' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Entrenador');
}
async function transfers(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('link', { name: /Compartir planes/ }).click();
  await expect(page.getByRole('heading', { name: 'Copia completa de este dispositivo' })).toBeVisible();
}
async function download(page: Page): Promise<Buffer> {
  await transfers(page);
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar copia completa JSON' }).click();
  return readFile(await (await event).path());
}
async function review(page: Page, buffer: Buffer): Promise<void> {
  await transfers(page);
  await page.getByLabel('Archivo de copia completa JSON').setInputFiles({ name: 'copia.json', mimeType: 'application/json', buffer });
  await expect(page.getByRole('heading', { name: 'Revisión antes de reemplazar' })).toBeVisible();
}
async function ready(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
  await expect(page.getByText('Recursos de esta entrega disponibles sin conexión.', { exact: true })).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(async () => {
    const worker = await navigator.serviceWorker.ready;
    const manifest = await (await fetch(new URL('resource-manifest.json', document.baseURI))).json() as { resources: string[] };
    const responses = await Promise.all([...manifest.resources, 'resource-manifest.json'].map(resource => caches.match(new URL(resource, document.baseURI))));
    return worker.active?.state === 'activated' && !!navigator.serviceWorker.controller && responses.length > 1 && responses.every(response => response?.ok);
  })).toBe(true);
}

test('trainer client, routine, actual workout, food and daily target survive reviewed replacement at 320px', async ({ browser, page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 }); await onboard(page);
  await page.getByRole('link', { name: 'Gestionar personas' }).click(); await page.getByRole('link', { name: 'Añadir cliente' }).click();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Alex');
  await page.getByRole('textbox', { name: 'Referencia' }).fill('Persona A');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByRole('combobox', { name: 'Persona activa' }).locator('option:checked')).toContainText('Persona A');
  const owner = await page.getByRole('combobox', { name: 'Persona activa' }).inputValue();
  await page.getByRole('navigation').getByRole('link', { name: 'Rutinas', exact: true }).click();
  await page.getByRole('button', { name: 'Crear rutina / recuperar nueva' }).click();
  await page.getByRole('textbox', { name: 'Nombre de la rutina' }).fill('Respaldo real');
  await page.getByRole('button', { name: 'Añadir ejercicio', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('searchbox', { name: 'Buscar ejercicio' }).fill('press');
  await dialog.getByRole('button', { name: /^Ver detalles de / }).first().click();
  await dialog.getByRole('button', { name: 'Añadir al día' }).click();
  await page.getByTestId('routine-exercise').first().getByRole('spinbutton', { name: 'Repeticiones mínimas' }).fill('8');
  await page.getByTestId('routine-exercise').first().getByRole('spinbutton', { name: 'Repeticiones máximas' }).fill('12');
  await page.getByRole('button', { name: 'Guardar rutina válida' }).click();
  await page.getByRole('link', { name: 'Entrenar Respaldo real' }).click();
  await page.getByLabel('Fecha de entrenamiento').fill('2026-01-01');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  const set = page.getByTestId('actual-set').first();
  await set.getByRole('spinbutton', { name: /Peso real/ }).fill('22');
  await set.getByRole('spinbutton', { name: /Repeticiones reales/ }).fill('9');
  await set.getByRole('spinbutton', { name: /RPE real/ }).fill('8');
  await set.getByRole('button', { name: /^Completar serie/ }).click();
  await page.getByRole('button', { name: 'Finalizar y guardar sesión' }).click();
  await expect(page.getByText('Sesión finalizada y guardada. Ya aparece en el historial.')).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.locator('a[href*="diary"]').first().click();
  await page.getByLabel('Fecha del diario').fill('2026-01-01');
  await page.getByRole('searchbox', { name: 'Buscar alimento USDA o personalizado' }).fill('arroz');
  const option = page.getByLabel('Elegir alimento y origen').locator('option:not([value=""])').first();
  await expect(option).toBeAttached();
  await page.getByLabel('Elegir alimento y origen').selectOption(await option.getAttribute('value') ?? '');
  await page.getByRole('spinbutton', { name: 'Gramos consumidos' }).fill('120');
  await page.getByRole('button', { name: 'Registrar alimento consumido' }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('link', { name: 'Actividad diaria y objetivos' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Borrador recuperado' })).toBeVisible();
  await page.getByLabel('Fecha de actividad').fill('2026-01-01');
  await page.getByRole('combobox', { name: 'Método de gasto diario' }).selectOption('manual-tdee');
  await page.getByRole('spinbutton', { name: /Gasto diario manual/ }).fill('2200');
  await page.getByRole('textbox', { name: 'Fuente o motivo del gasto diario manual' }).fill('Valor registrado');
  await page.getByRole('button', { name: 'Guardar actividad y objetivo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Actividad y objetivo guardados' })).toBeVisible();
  const file = await download(page);
  const payload = JSON.parse(file.toString()).payload;
  expect(payload.settings).toHaveLength(1); expect(payload.routineRevisions).toHaveLength(1);
  expect(payload.trainingSessions).toHaveLength(1); expect(payload.foodLogs).toHaveLength(1); expect(payload.dailySnapshots).toHaveLength(1);
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: { width: 320, height: 740 } });
  try {
    const dest = await context.newPage(); await onboard(dest);
    const sibling = await context.newPage(); await sibling.goto('/');
    await expect(sibling.getByTestId('active-person-name')).toHaveText('Entrenador');
    await review(dest, file);
    await expect(dest.getByText(`ID ${owner}`)).toBeVisible();
    await dest.getByRole('heading', { name: 'Revisión antes de reemplazar' }).scrollIntoViewIfNeeded();
    await dest.screenshot({ path: info.outputPath('backup-review-320.png') });
    expect(await dest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dest.getByRole('button', { name: 'Cancelar restauración' }).click();
    expect((JSON.parse((await download(dest)).toString()).payload.people as unknown[])).toHaveLength(1);
    await review(dest, file);
    await dest.getByRole('checkbox', { name: /Confirmo que esta copia reemplazará/ }).check();
    await dest.getByRole('button', { name: 'Restaurar y reemplazar datos' }).click();
    await expect(dest.getByRole('combobox', { name: 'Persona activa' }).locator('option:checked')).toContainText('Persona A');
    await expect(sibling.getByTestId('active-person-name')).toHaveText('Alex');
    await dest.getByRole('navigation').getByRole('link', { name: 'Progreso', exact: true }).click();
    await dest.getByLabel('Fecha de la semana', { exact: true }).fill('2026-01-01');
    await expect(dest.getByRole('region', { name: 'Semana seleccionada' })).toContainText('22 kg externos');
    await dest.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
    await dest.locator('a[href*="diary"]').first().click();
    await dest.getByLabel('Fecha del diario').fill('2026-01-01');
    await expect(dest.getByTestId('actual-food')).toHaveCount(1);
    await dest.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
    await dest.getByRole('button', { name: 'Cliente', exact: true }).click();
    await expect(dest.getByText('Modo actual: Cliente')).toBeVisible();
    await expect(dest.getByTestId('active-person-name')).toHaveText('Entrenador');
    await dest.getByRole('button', { name: 'Entrenador', exact: true }).click();
    await expect(dest.getByText('Modo actual: Entrenador')).toBeVisible();
    await expect(dest.getByRole('combobox', { name: 'Persona activa' })).toBeEnabled();
    await dest.getByRole('combobox', { name: 'Persona activa' }).selectOption(owner);
    await expect(dest.getByRole('combobox', { name: 'Persona activa' }).locator('option:checked')).toContainText('Persona A');
    await expect(dest.getByTestId('active-person-name')).toHaveText('Alex');
  } finally { await context.close(); }
});

for (const path of ['/', '/entrena/']) test(`full backup export and restore work after complete offline cache at ${path}`, async ({ page, context }) => {
  await onboard(page, path); await ready(page);
  await context.setOffline(true); await page.reload();
  const file = await download(page);
  await review(page, file);
  await page.getByRole('checkbox', { name: /Confirmo que esta copia reemplazará/ }).check();
  await page.getByRole('button', { name: 'Restaurar y reemplazar datos' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Entrenador');
  expect(new URL(page.url()).pathname).toBe(path);
  expect((JSON.parse((await download(page)).toString()).payload.people as unknown[])).toHaveLength(1);
});
