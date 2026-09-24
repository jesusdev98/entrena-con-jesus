import { expect, test, type Page } from '@playwright/test';

async function onboard(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await page.getByRole('radio', { name: /Entrenador/ }).check();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Jesús');
  await page.getByRole('button', { name: 'Crear mi espacio' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Jesús');
}
async function openCatalog(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Alimentación' }).click();
  await expect(page.getByRole('heading', { name: 'Alimentación', exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Buscar alimento' })).toBeVisible();
}
async function fillFood(page: Page, name: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Nombre del alimento', exact: true }).fill(name);
  for (const [label, value] of [['Energía', '123.4567'], ['Proteínas', '4.1'], ['Carbohidratos', '8.2'], ['Grasas', '0']]) {
    await page.getByRole('spinbutton', { name: new RegExp(`^${label} \\(`) }).fill(value);
  }
  await page.getByRole('textbox', { name: 'Referencia de los valores' }).fill('Etiqueta de mi receta');
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

test('food search, preparation, provenance, keyboard focus and 320px layout', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await onboard(page); await openCatalog(page);
  await expect(page.getByText('235 alimentos encontrados.', { exact: true })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Buscar alimento' });
  await search.fill('platano');
  await expect(page.getByTestId('food-card').first()).toContainText('Plátano');
  await search.fill('rice white');
  await page.getByRole('combobox', { name: 'Preparación', exact: true }).selectOption('cooked');
  await expect(page.getByTestId('food-card').first()).toContainText('Cocinado');
  const detail = page.getByRole('button', { name: /^Ver detalles de / }).first();
  await detail.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('Arroz blanco de grano largo, sin enriquecer, cocido sin sal');
  await expect(dialog).toContainText('USDA FoodData Central');
  await expect(dialog).toContainText('sr-legacy/2018-04');
  await page.getByRole('spinbutton', { name: 'Cantidad (g)', exact: true }).fill('150');
  await expect(dialog).toContainText('Solo una vista previa; no registra consumo.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press('Escape'); await expect(detail).toBeFocused();
  await search.fill('alimento inexistente zzz');
  await expect(page.getByRole('heading', { name: 'No hay alimentos que coincidan' })).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar búsqueda y filtros' }).click();
  await page.getByRole('combobox', { name: 'Grupo', exact: true }).selectOption('Legumbres');
  await expect(page.getByTestId('food-card').first()).toContainText('Legumbres');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('food-catalog-320.png'), fullPage: true });
});

test('creates, reopens, edits, archives and restores a custom food with exact stored values', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await onboard(page); await openCatalog(page);
  await page.getByRole('button', { name: 'Añadir alimento personalizado' }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre del alimento', exact: true })).toBeFocused();
  await fillFood(page, 'Receta propia');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Guardar alimento', exact: true }).click();
  await expect(page.getByText('Alimento guardado en esta persona.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Añadir alimento personalizado' })).toBeFocused();
  await page.reload();
  await page.getByRole('combobox', { name: 'Origen', exact: true }).selectOption('custom');
  await page.getByRole('button', { name: 'Ver detalles de Receta propia', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('sin verificación de USDA');
  await expect(page.getByRole('dialog')).toContainText('Etiqueta de mi receta');
  await expect(page.getByRole('dialog').getByRole('link', { name: /Consultar FDC/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Editar alimento', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: /^Energía \(/ })).toHaveValue('123.4567');
  await page.getByRole('textbox', { name: 'Nombre del alimento', exact: true }).fill('Receta actualizada');
  await page.getByRole('button', { name: 'Guardar alimento', exact: true }).click();
  await page.getByRole('button', { name: 'Ver detalles de Receta actualizada', exact: true }).click();
  await page.getByRole('button', { name: 'Archivar alimento', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No hay alimentos que coincidan' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Origen', exact: true }).selectOption('archived');
  await page.getByRole('button', { name: 'Ver detalles de Receta actualizada', exact: true }).click();
  await page.getByRole('button', { name: 'Restaurar alimento', exact: true }).click();
  await page.getByRole('combobox', { name: 'Origen', exact: true }).selectOption('custom');
  await expect(page.getByTestId('food-card')).toHaveCount(1);
  await expect(page.getByTestId('food-card')).toContainText('Receta actualizada');
});

test('custom drafts and foods remain isolated when switching same-name clients and modes', async ({ page }) => {
  await onboard(page); const first = await addClient(page, 'Mañana'); const second = await addClient(page, 'Tarde');
  expect(first).not.toBe(second);
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(first); await openCatalog(page);
  await page.getByRole('button', { name: 'Añadir alimento personalizado' }).click(); await fillFood(page, 'Solo primer Alex');
  await expect(page.getByRole('status').filter({ hasText: 'Borrador guardado' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(second); await openCatalog(page);
  await page.getByRole('combobox', { name: 'Origen', exact: true }).selectOption('custom');
  await expect(page.getByTestId('food-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Añadir alimento personalizado' }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre del alimento', exact: true })).toHaveValue('');
  await fillFood(page, 'Solo segundo Alex'); await page.getByRole('button', { name: 'Guardar alimento', exact: true }).click();
  await expect(page.getByTestId('food-card')).toContainText('Solo segundo Alex');
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(first); await openCatalog(page);
  await page.getByRole('button', { name: 'Añadir alimento personalizado' }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre del alimento', exact: true })).toHaveValue('Solo primer Alex');
  await page.reload();
  await page.getByRole('button', { name: 'Añadir alimento personalizado' }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre del alimento', exact: true })).toHaveValue('Solo primer Alex');
  await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cliente', exact: true }).click(); await openCatalog(page);
  await page.getByRole('combobox', { name: 'Origen', exact: true }).selectOption('custom'); await expect(page.getByTestId('food-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Añadir alimento personalizado' }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre del alimento', exact: true })).toHaveValue('');
  await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
  await page.getByRole('button', { name: 'Entrenador', exact: true }).click(); await openCatalog(page);
  await page.getByRole('button', { name: 'Añadir alimento personalizado' }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre del alimento', exact: true })).toHaveValue('Solo primer Alex');
  await page.getByRole('button', { name: 'Guardar alimento', exact: true }).click();
  await page.getByRole('combobox', { name: 'Origen', exact: true }).selectOption('custom');
  await expect(page.getByTestId('food-card')).toHaveCount(1); await expect(page.getByTestId('food-card')).toContainText('Solo primer Alex');
});

for (const path of ['/', '/entrena/']) {
  test(`opens a never-visited food catalog and saves custom foods offline at ${path}`, async ({ page, context }) => {
    await onboard(page, path);
    await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
    await expect(page.getByText('Recursos de esta entrega disponibles sin conexión.', { exact: true })).toBeVisible({ timeout: 30000 });
    expect(await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const manifest = await (await fetch(new URL('resource-manifest.json', document.baseURI))).json();
      const resources = await Promise.all([...manifest.resources, 'resource-manifest.json'].map((resource: string) => caches.match(new URL(resource, document.baseURI))));
      return registration.active?.state === 'activated' && navigator.serviceWorker.controller !== null && resources.length > 1 && resources.every(response => response?.ok);
    })).toBe(true);
    await context.setOffline(true); await page.reload(); await openCatalog(page);
    await expect(page.getByText('235 alimentos encontrados.', { exact: true })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Buscar alimento' }).fill('quinoa');
    await page.getByRole('button', { name: /^Ver detalles de / }).first().click();
    await expect(page.getByRole('dialog')).toContainText('USDA FoodData Central');
    await page.getByRole('button', { name: 'Cerrar detalles', exact: true }).click();
    await page.getByRole('button', { name: 'Añadir alimento personalizado' }).click(); await fillFood(page, 'Receta sin conexión');
    await page.getByRole('button', { name: 'Guardar alimento', exact: true }).click();
    await expect(page.getByText('Alimento guardado en esta persona.', { exact: true })).toBeVisible();
    await page.reload(); await page.getByRole('combobox', { name: 'Origen', exact: true }).selectOption('custom');
    await expect(page.getByTestId('food-card')).toContainText('Receta sin conexión');
    expect(new URL(page.url()).pathname).toBe(path);
  });
}
