import { expect, test, type Page } from '@playwright/test';
import { markLegacyWorkspace } from './support/legacy-workspace';

const opaqueId = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
async function noVisibleIds(page: Page): Promise<void> {
  const rendered = await page.evaluate(() => document.body.innerText + ' ' + [...document.querySelectorAll('option')].map(option => option.textContent).join(' '));
  expect(rendered).not.toMatch(opaqueId);
}
async function onboard(page: Page): Promise<void> {
  await page.goto('/'); await markLegacyWorkspace(page); await page.getByRole('radio', { name: /Entrenador/ }).check();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Jesús');
  await page.getByRole('button', { name: 'Crear mi espacio' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Jesús');
}
async function home(page: Page): Promise<void> { await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click(); }

test('empty planning, actual history, diary and custom catalogs guide the next action at 320px', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 }); await onboard(page);
  await page.getByRole('navigation').getByRole('link', { name: 'Rutinas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Crear primera rutina' })).toBeVisible();
  await noVisibleIds(page);
  await page.getByRole('link', { name: 'Registrar entrenamiento / continuar borrador' }).click();
  await expect(page.getByText('No hay rutinas activas ni sesiones pendientes. Crea una rutina válida para iniciar tu primer entrenamiento.')).toBeVisible();
  await noVisibleIds(page);
  await home(page); await page.getByRole('link', { name: 'Planes de comidas' }).click();
  await expect(page.getByRole('button', { name: 'Crear primer plan' })).toBeVisible();
  await noVisibleIds(page);
  await page.getByRole('button', { name: 'Crear primer plan' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('empty-meals-320.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await home(page); await page.getByRole('link', { name: 'Diario alimentario' }).click();
  await expect(page.getByRole('link', { name: 'Guardar objetivo diario' })).toBeVisible();
  await expect(page.getByText(/No hay alimentos consumidos registrados para esta fecha/)).toBeVisible();
  await noVisibleIds(page);
  await page.getByRole('navigation').getByRole('link', { name: 'Progreso' }).click();
  await expect(page.getByText(/Todavía no hay entrenamientos finalizados/)).toBeVisible();
  await noVisibleIds(page);
  await home(page); await page.getByRole('link', { name: 'Ejercicios' }).click();
  await page.getByLabel('Origen').selectOption('custom');
  await expect(page.getByText(/Todavía no hay ejercicios personalizados/)).toBeVisible();
  await noVisibleIds(page);
  await page.getByRole('navigation').getByRole('link', { name: 'Alimentación' }).click();
  await page.getByLabel('Origen').selectOption('custom');
  await expect(page.getByText(/Todavía no hay alimentos personalizados/)).toBeVisible();
  await noVisibleIds(page);
});

test('same-name clients have stable human ordinals across reload and mode changes; values remain opaque', async ({ page }) => {
  await onboard(page);
  for (let index = 0; index < 2; index++) {
    await page.getByRole('link', { name: 'Gestionar personas' }).click();
    await page.getByRole('link', { name: 'Añadir cliente' }).click();
    await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Alex');
    await page.getByRole('button', { name: 'Guardar perfil' }).click();
  }
  const picker = page.getByRole('combobox', { name: 'Persona activa' });
  await expect(picker.locator('option').filter({ hasText: 'Alex · Cliente 1' })).toHaveCount(1);
  await expect(picker.locator('option').filter({ hasText: 'Alex · Cliente 2' })).toHaveCount(1);
  const first = await picker.locator('option').filter({ hasText: 'Alex · Cliente 1' }).getAttribute('value');
  const second = await picker.locator('option').filter({ hasText: 'Alex · Cliente 2' }).getAttribute('value');
  expect(first).toMatch(opaqueId); expect(second).toMatch(opaqueId); expect(first).not.toBe(second);
  await noVisibleIds(page); await page.reload(); await expect(picker.locator('option').filter({ hasText: 'Alex · Cliente 2' })).toHaveCount(1);
  await picker.selectOption(first!); await expect(picker.locator('option:checked')).toContainText('Cliente 1');
  await page.getByRole('link', { name: 'Gestionar personas' }).click();
  await expect(page.locator('app-people-page').getByText('Cliente 1', { exact: true })).toBeVisible();
  await expect(page.locator('app-people-page').getByText('Cliente 2', { exact: true })).toBeVisible();
  await noVisibleIds(page);
  await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cliente', exact: true }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Jesús'); await noVisibleIds(page);
  await page.getByRole('button', { name: 'Entrenador', exact: true }).click();
  await expect(picker.locator('option:checked')).toContainText('Cliente 1'); await noVisibleIds(page);
});
