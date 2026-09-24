import { expect, test, type Page } from '@playwright/test';

async function onboard(page: Page, mode: 'trainer' | 'client' = 'trainer', path = '/'): Promise<void> {
  await page.goto(path);
  await page.getByRole('radio', { name: mode === 'trainer' ? /Entrenador/ : /Cliente/ }).check();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Jesús');
  await page.getByRole('button', { name: 'Crear mi espacio' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Jesús');
}
async function addClient(page: Page, reference: string): Promise<string> {
  await page.getByRole('link', { name: 'Gestionar personas' }).click();
  await page.getByRole('link', { name: 'Añadir cliente' }).click();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Alex');
  await page.getByRole('textbox', { name: 'Referencia' }).fill(reference);
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Alex');
  await expect(page.getByRole('combobox', { name: 'Persona activa' }).locator('option:checked')).toContainText(reference);
  return page.getByRole('combobox', { name: 'Persona activa' }).inputValue();
}
async function openSettings(page: Page): Promise<void> { await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click(); }

test('same-name clients remain isolated across edits, reloads and mode switches', async ({ page }) => {
  await onboard(page);
  const firstId = await addClient(page, 'Mañana');
  const secondId = await addClient(page, 'Tarde');
  expect(firstId).not.toBe(secondId);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Persona activa' })).toHaveValue(secondId);
  await page.getByRole('link', { name: 'Completar perfil' }).click();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Alex actualizado');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Alex actualizado');
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(firstId);
  await expect(page.getByTestId('active-person-name')).toHaveText('Alex');
  await openSettings(page);
  await page.getByRole('button', { name: 'Cliente', exact: true }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Jesús');
  await expect(page.getByRole('combobox', { name: 'Persona activa' })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Entrenador', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Persona activa' })).toHaveValue(firstId);
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(secondId);
  await expect(page.getByTestId('active-person-name')).toHaveText('Alex actualizado');
});

test('recovers an unfinished client draft with the same identity after restart', async ({ page }) => {
  await onboard(page);
  await page.getByRole('link', { name: 'Gestionar personas' }).click();
  await page.getByRole('link', { name: 'Añadir cliente' }).click();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Borrador');
  await expect(page.getByRole('status')).toContainText('Borrador guardado');
  const identity = await page.getByText('ID del perfil:').textContent();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveValue('Borrador');
  await expect(page.getByText('ID del perfil:')).toHaveText(identity!);
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Borrador');
});

test('archives reversibly and restores dialog focus on cancellation', async ({ page }) => {
  await onboard(page);
  const id = await addClient(page, 'Archivo');
  await page.getByRole('link', { name: 'Gestionar personas' }).click();
  const archive = page.getByRole('button', { name: 'Archivar cliente', exact: true });
  await archive.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(archive).toBeFocused();
  await archive.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archivar cliente' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Jesús');
  await page.getByRole('button', { name: 'Restaurar cliente' }).click();
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(id);
  await expect(page.getByTestId('active-person-name')).toHaveText('Alex');
});

for (const path of ['/', '/entrena/']) {
  test(`production resources and local edits work offline at ${path}`, async ({ page, context }) => {
    await onboard(page, 'client', path);
    await openSettings(page);
    await expect(page.getByText('Recursos de esta entrega disponibles sin conexión.', { exact: true })).toBeVisible({ timeout: 30000 });
    expect(await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const manifest = await (await fetch(new URL('resource-manifest.json', document.baseURI))).json();
      const responses = await Promise.all([...manifest.resources, 'resource-manifest.json'].map((path: string) => caches.match(new URL(path, document.baseURI))));
      return registration.active?.state === 'activated' && navigator.serviceWorker.controller !== null
        && responses.length > 1 && responses.every(response => response?.ok);
    })).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('active-person-name')).toHaveText('Jesús');
    await page.getByRole('link', { name: 'Inicio', exact: true }).click();
    await page.getByRole('link', { name: 'Completar perfil' }).click();
    await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Jesús sin conexión');
    await page.getByRole('button', { name: 'Guardar perfil' }).click();
    await expect(page.getByTestId('active-person-name')).toHaveText('Jesús sin conexión');
    await page.reload();
    await expect(page.getByTestId('active-person-name')).toHaveText('Jesús sin conexión');
    await page.getByRole('navigation').getByRole('link', { name: 'Rutinas' }).click();
    await expect(page.getByRole('heading', { name: 'Rutinas', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rutinas de Jesús sin conexión', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear rutina / recuperar nueva', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Registrar entrenamiento / continuar borrador', exact: true })).toHaveAttribute('href', '#/training');
    expect(new URL(page.url()).pathname).toBe(path);
  });
}

test('320px layout has no horizontal overflow and navigation remains usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await onboard(page);
  await addClient(page, 'Un nombre de referencia suficientemente largo para probar el diseño');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  const selector = page.getByRole('combobox', { name: 'Persona activa' });
  await selector.focus();
  await expect(selector).toBeFocused();
  await expect(page.getByText('Un nombre de referencia suficientemente largo para probar el diseño', { exact: false }).first()).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Alimentación' }).click();
  await expect(page.getByRole('heading', { name: 'Alimentación', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile-320.png'), fullPage: true });
});
