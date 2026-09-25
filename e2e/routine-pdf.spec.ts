import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { markLegacyWorkspace } from './support/legacy-workspace';

async function savedRoutine(page: Page, path: string): Promise<void> {
  await page.goto(path); await markLegacyWorkspace(page); await page.getByRole('radio', { name: /Entrenador/ }).check();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Jesús');
  await page.getByRole('button', { name: 'Crear mi espacio' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Jesús');
  await page.getByRole('navigation').getByRole('link', { name: 'Rutinas', exact: true }).click();
  await page.getByRole('button', { name: 'Crear rutina / recuperar nueva' }).click();
  await page.getByRole('textbox', { name: 'Nombre de la rutina' }).fill('Plan ilustrado');
  const day = page.getByTestId('routine-day').first(); await day.getByRole('button', { name: 'Añadir ejercicio', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('searchbox', { name: 'Buscar ejercicio' }).fill('peso muerto');
  const first = dialog.getByRole('button', { name: /Ver detalles de/ }).first();
  await first.click(); await dialog.getByRole('button', { name: 'Añadir al día' }).click();
  const exercise = day.getByTestId('routine-exercise').first();
  if (await exercise.getByRole('spinbutton', { name: 'Repeticiones mínimas' }).count()) {
    await exercise.getByRole('spinbutton', { name: 'Repeticiones mínimas' }).fill('8');
    await exercise.getByRole('spinbutton', { name: 'Repeticiones máximas' }).fill('12');
  } else { await exercise.getByRole('spinbutton', { name: 'Duración (s)' }).fill('30'); }
  await page.getByRole('button', { name: 'Guardar rutina válida', exact: true }).click();
  await expect(page.getByText('Rutina válida guardada en esta persona.', { exact: true })).toBeVisible();
}

test('long saved plan downloads multiple complete PDF pages with credits', async ({ page }, testInfo) => {
  await savedRoutine(page, '/');
  await page.getByRole('button', { name: 'Editar Plan ilustrado' }).click();
  await page.getByRole('textbox', { name: 'Notas de la rutina' }).fill('Instrucciones de planificación extensas. '.repeat(45));
  for (let index = 0; index < 4; index++) await page.getByRole('button', { name: 'Duplicar semana 1', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar rutina válida', exact: true }).click();
  await expect(page.getByText('Rutina válida guardada en esta persona.', { exact: true })).toBeVisible();
  const requests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).origin !== new URL(page.url()).origin) requests.push(request.url()); });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar PDF de Plan ilustrado' }).click();
  const download = await pending; await download.saveAs(testInfo.outputPath('long-routine.pdf'));
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect((bytes.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(4);
  expect(requests).toEqual([]);
  await expect(page.getByRole('status').filter({ hasText: /PDF descargado/ })).toBeVisible();
});

for (const path of ['/', '/entrena/']) {
  test(`download selected saved illustrated routine PDF offline at ${path}`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 740 }); await savedRoutine(page, path);
    await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
    await expect(page.getByText('Recursos de esta entrega disponibles sin conexión.', { exact: true })).toBeVisible({ timeout: 30000 });
    expect(await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const manifest = await (await fetch(new URL('resource-manifest.json', document.baseURI))).json() as { resources: string[] };
      const responses = await Promise.all([...manifest.resources, 'resource-manifest.json'].map(resource => caches.match(new URL(resource, document.baseURI))));
      return registration.active?.state === 'activated' && !!navigator.serviceWorker.controller && responses.every(response => response?.ok);
    })).toBe(true);
    await context.setOffline(true); await page.reload();
    await page.getByRole('navigation').getByRole('link', { name: 'Rutinas', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Descargar PDF de Plan ilustrado' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('pdf-controls-320.png') });
    const requests: string[] = [];
    page.on('request', request => { if (new URL(request.url()).origin !== new URL(page.url()).origin) requests.push(request.url()); });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar PDF de Plan ilustrado' }).click();
    const download = await downloadPromise; expect(download.suggestedFilename()).toMatch(/^entrena-con-jesus-plan-ilustrado-.*\.pdf$/);
    await download.saveAs(testInfo.outputPath('saved-routine.pdf'));
    const bytes = await readFile(await download.path());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-'); expect(bytes.length).toBeGreaterThan(10_000);
    const raw = bytes.toString('latin1');
    expect((raw.match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(raw).toContain('/ToUnicode');
    expect(raw).toContain('/Font');
    expect(requests).toEqual([]);
    await expect(page.getByRole('status').filter({ hasText: /PDF descargado/ })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(path);
  });
}
