import { expect, test, type Locator, type Page } from '@playwright/test';
import { markLegacyWorkspace } from './support/legacy-workspace';

async function onboard(page: Page, path = '/'): Promise<void> {
  await page.goto(path); await markLegacyWorkspace(page); await page.getByRole('radio', { name: /Entrenador/ }).check();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Jesús');
  await page.getByRole('button', { name: 'Crear mi espacio' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Jesús');
}
async function plans(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.locator('a[href*="meal-plans"]').first().click();
  await expect(page.getByRole('heading', { name: 'Planes de comidas', exact: true })).toBeVisible();
}
async function create(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Crear plan semanal / recuperar nuevo' }).click();
  await page.getByRole('textbox', { name: 'Nombre del plan', exact: true }).fill(name);
}
async function firstMeal(page: Page): Promise<Locator> {
  const day = page.getByTestId('plan-day').first();
  await day.locator('summary').first().click();
  return day.getByTestId('plan-meal').first();
}
async function addFood(meal: Locator, query: string, grams: string): Promise<void> {
  await meal.getByRole('searchbox', { name: /Buscar alimento para/ }).fill(query);
  const option = meal.getByRole('combobox', { name: 'Elegir alimento (preparación y origen)' }).locator('option:not([value=""])').first();
  await expect(option).toBeAttached();
  await meal.getByRole('combobox', { name: 'Elegir alimento (preparación y origen)' }).selectOption(await option.getAttribute('value') ?? '');
  await meal.getByRole('button', { name: 'Añadir alimento (indica los gramos)' }).click();
  await meal.getByTestId('planned-food').last().getByRole('spinbutton', { name: /^Gramos de / }).fill(grams);
}
async function save(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Guardar plan válido', exact: true }).click();
  await expect(page.getByText('Plan de comidas guardado en esta persona.', { exact: true })).toBeVisible();
}
async function addClient(page: Page, reference: string): Promise<string> {
  await page.getByRole('link', { name: 'Gestionar personas' }).click(); await page.getByRole('link', { name: 'Añadir cliente' }).click();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Alex');
  await page.getByRole('textbox', { name: 'Referencia' }).fill(reference);
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByRole('combobox', { name: 'Persona activa' }).locator('option:checked')).toContainText(reference);
  return page.getByRole('combobox', { name: 'Persona activa' }).inputValue();
}

test('mixed raw/cooked and custom portions, week copy, reload and 320px keyboard labels', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 }); await onboard(page);
  await page.getByRole('navigation').getByRole('link', { name: 'Alimentación' }).click();
  await page.getByRole('button', { name: 'Añadir alimento personalizado' }).click();
  await page.getByRole('textbox', { name: 'Nombre del alimento' }).fill('Receta personal');
  for (const [label, value] of [['Energía', '140'], ['Proteínas', '5'], ['Carbohidratos', '20'], ['Grasas', '4']]) {
    await page.getByRole('spinbutton', { name: new RegExp(`^${label} \\(`) }).fill(value);
  }
  await page.getByRole('button', { name: 'Guardar alimento', exact: true }).click(); await plans(page); await create(page, 'Semana variada');
  const meal = await firstMeal(page);
  await addFood(meal, 'arroz blanco de grano largo sin enriquecer cocido', '150');
  await addFood(meal, 'arroz blanco de grano largo sin enriquecer crudo', '80');
  await addFood(meal, 'Receta personal', '75');
  await expect(meal.getByTestId('planned-food')).toHaveCount(3);
  await meal.getByRole('button', { name: 'Subir alimento 3' }).click();
  await meal.getByRole('textbox', { name: 'Nombre de la comida' }).fill('Desayuno ampliado');
  await page.getByRole('button', { name: 'Duplicar semana 1', exact: true }).click();
  await expect(page.getByTestId('plan-week')).toHaveCount(2);
  const root = page.locator('app-meal-editor');
  expect(await root.evaluate(element => {
    const ids = [...element.querySelectorAll('[id]')].map(node => node.id);
    return ids.length === new Set(ids).size && [...element.querySelectorAll('label')].every(label => label.control !== null);
  })).toBe(true);
  const grams = meal.getByTestId('planned-food').first().getByRole('spinbutton', { name: /^Gramos de / });
  await grams.focus(); await page.keyboard.press('ArrowUp'); await expect(grams).toHaveValue('151');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await grams.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath('meal-editor-320.png') });
  await save(page); await page.reload(); await expect(page.getByTestId('meal-plan-card')).toContainText('2 semanas');
  await page.getByRole('button', { name: 'Duplicar Semana variada' }).click();
  await page.getByRole('textbox', { name: 'Nombre del plan' }).fill('Copia independiente'); await save(page);
  await page.getByRole('button', { name: 'Editar Semana variada' }).click();
  await page.getByTestId('plan-day').first().locator('summary').first().click();
  await expect(page.getByTestId('planned-food').first()).toContainText('USDA');
  await expect(page.getByTestId('planned-food').first().getByRole('spinbutton', { name: /^Gramos de / })).toHaveValue('151');
  await page.getByRole('button', { name: 'Cerrar y conservar borrador' }).click();
  await page.getByRole('button', { name: 'Archivar Copia independiente' }).click();
  await page.getByRole('button', { name: 'Ver planes archivados' }).click();
  await page.getByRole('button', { name: 'Restaurar Copia independiente' }).click();
  await expect(page.getByRole('button', { name: 'Ver planes activos' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Ver planes activos' }).click();
  await expect(page.getByTestId('meal-plan-card')).toHaveCount(2);
  expect(await page.evaluate(async () => {
    const dbs = await indexedDB.databases(); const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbs.find(item => item.name?.includes('entrena'))!.name!);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const count = await new Promise<number>((resolve, reject) => { const request = db.transaction('foodLogs').objectStore('foodLogs').count(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close(); return count;
  })).toBe(0);
});

test('same-name client plans and drafts stay isolated across modes and reload', async ({ page }) => {
  await onboard(page); const first = await addClient(page, 'Mañana'); const second = await addClient(page, 'Tarde'); expect(first).not.toBe(second);
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(first); await plans(page); await create(page, 'Primer Alex');
  await page.getByRole('textbox', { name: 'Notas del plan' }).fill('Borrador de mañana');
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(second); await plans(page);
  await expect(page.getByTestId('meal-plan-card')).toHaveCount(0); await create(page, 'Segundo Alex'); await save(page);
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(first); await plans(page);
  await page.getByRole('button', { name: 'Recuperar borrador: Primer Alex' }).click();
  await expect(page.getByRole('textbox', { name: 'Notas del plan' })).toHaveValue('Borrador de mañana');
  await page.reload(); await page.getByRole('button', { name: 'Recuperar borrador: Primer Alex' }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre del plan' })).toHaveValue('Primer Alex');
  await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click(); await page.getByRole('button', { name: 'Cliente', exact: true }).click(); await plans(page);
  await expect(page.getByTestId('meal-plan-card')).toHaveCount(0);
  await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click(); await page.getByRole('button', { name: 'Entrenador', exact: true }).click(); await plans(page);
  await page.getByRole('button', { name: 'Recuperar borrador: Primer Alex' }).click(); await save(page);
  await expect(page.getByTestId('meal-plan-card')).toContainText('Primer Alex');
});

test('stale edits require explicit comparison across tabs', async ({ page, context }) => {
  await onboard(page); await plans(page); await create(page, 'Plan compartido'); await save(page);
  await page.getByRole('button', { name: 'Editar Plan compartido' }).click();
  await page.getByRole('textbox', { name: 'Notas del plan' }).fill('Mis notas');
  await expect(page.getByText('Borrador guardado en este dispositivo.', { exact: true })).toBeVisible();
  const other = await context.newPage(); await other.goto(page.url()); await other.getByRole('button', { name: 'Editar Plan compartido' }).click();
  await other.getByRole('textbox', { name: 'Notas del plan' }).fill('Notas ajenas'); await save(other);
  await page.getByRole('button', { name: 'Guardar plan válido', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'El plan o borrador cambió' })).toBeVisible();
  await page.getByRole('button', { name: 'Conservar mis cambios sobre la versión actual' }).click(); await save(page);
  await page.reload(); await page.getByRole('button', { name: 'Editar Plan compartido' }).click();
  await expect(page.getByRole('textbox', { name: 'Notas del plan' })).toHaveValue('Mis notas'); await other.close();
});

for (const path of ['/', '/entrena/']) {
  test(`creates and edits weekly plans offline after worker readiness at ${path}`, async ({ page, context }) => {
    await onboard(page, path); await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
    await expect(page.getByText('Recursos de esta entrega disponibles sin conexión.', { exact: true })).toBeVisible({ timeout: 30000 });
    expect(await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const manifest = await (await fetch(new URL('resource-manifest.json', document.baseURI))).json() as { resources: string[] };
      const resources = await Promise.all([...manifest.resources, 'resource-manifest.json'].map(resource => caches.match(new URL(resource, document.baseURI))));
      return registration.active?.state === 'activated' && navigator.serviceWorker.controller !== null && resources.length > 1 && resources.every(response => response?.ok);
    })).toBe(true);
    await context.setOffline(true); await page.reload(); await plans(page); await create(page, 'Plan desconectado');
    const meal = await firstMeal(page); await addFood(meal, 'quinoa', '125'); await save(page); await page.reload();
    await page.getByRole('button', { name: 'Editar Plan desconectado' }).click();
    await page.getByTestId('plan-day').first().locator('summary').first().click();
    await page.getByTestId('planned-food').first().getByRole('spinbutton', { name: /^Gramos de / }).fill('175');
    await save(page); await page.reload(); await page.getByRole('button', { name: 'Editar Plan desconectado' }).click();
    await page.getByTestId('plan-day').first().locator('summary').first().click();
    await expect(page.getByTestId('planned-food').first().getByRole('spinbutton', { name: /^Gramos de / })).toHaveValue('175');
    expect(new URL(page.url()).pathname).toBe(path);
  });
}
