import { expect, test, type Page } from '@playwright/test';
import { markLegacyWorkspace } from './support/legacy-workspace';

async function onboard(page: Page, path = '/'): Promise<void> {
  await page.goto(path); await markLegacyWorkspace(page); await page.getByRole('radio', { name: /Entrenador/ }).check();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Jesús');
  await page.getByRole('button', { name: 'Crear mi espacio' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Jesús');
}
async function diary(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('link', { name: 'Diario alimentario' }).click();
  await expect(page.getByRole('heading', { name: 'Diario alimentario' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Registros reales del día' })).toBeVisible();
}
async function selectFood(page: Page, query: string): Promise<void> {
  await page.getByRole('searchbox', { name: 'Buscar alimento USDA o personalizado' }).fill(query);
  const food = page.getByRole('combobox', { name: 'Elegir alimento y origen' });
  await expect(food.locator('option:not([value=""])').first()).toBeAttached();
  await food.selectOption({ index: 1 });
}
async function createPlan(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('link', { name: 'Planes de comidas' }).click();
  await page.getByRole('button', { name: 'Crear plan semanal / recuperar nuevo' }).click();
  await page.getByRole('textbox', { name: 'Nombre del plan' }).fill('Plan diario');
  const day = page.getByTestId('plan-day').first(); await day.locator('summary').first().click();
  const meal = day.getByTestId('plan-meal').first();
  await meal.getByRole('searchbox', { name: /Buscar alimento para/ }).fill('arroz blanco de grano largo sin enriquecer crudo');
  const option = meal.getByRole('combobox', { name: 'Elegir alimento (preparación y origen)' }).locator('option:not([value=""])').first();
  await expect(option).toBeAttached();
  await meal.getByRole('combobox', { name: 'Elegir alimento (preparación y origen)' }).selectOption(await option.getAttribute('value') ?? '');
  await meal.getByRole('button', { name: 'Añadir alimento (indica los gramos)' }).click();
  await meal.getByTestId('planned-food').getByRole('spinbutton', { name: /^Gramos de / }).fill('100');
  await page.getByRole('button', { name: 'Guardar plan válido', exact: true }).click();
  await expect(page.getByText('Plan de comidas guardado en esta persona.')).toBeVisible();
}

test('plan transfers once, actual grams, target rings, manual food, edit and undo at 320px', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 }); await onboard(page);
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
  await createPlan(page); await diary(page);
  await page.getByLabel('Fecha del diario').fill('2026-09-21');
  await expect(page.getByText('Objetivo guardado: versión 1')).toBeVisible();
  await expect(page.getByText('No hay alimentos consumidos registrados')).toBeVisible();
  const meal = page.getByRole('combobox', { name: 'Comida del plan' }); await meal.selectOption({ index: 1 });
  const actual = page.getByRole('spinbutton', { name: /Gramos reales de/ }); await actual.fill('175');
  await page.getByRole('button', { name: 'Marcar comida consumida' }).click();
  await expect(page.getByTestId('actual-food')).toHaveCount(1);
  await meal.selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Marcar comida consumida' }).click();
  await expect(page.getByTestId('actual-food')).toHaveCount(1);
  await expect(page.getByRole('img', { name: /Energía \(kcal\): .* de / })).toBeVisible();
  await page.reload(); await expect(page.getByLabel('Fecha del diario')).toHaveValue('2026-09-21');
  await expect(page.getByTestId('actual-food')).toHaveCount(1);
  await page.getByRole('button', { name: /Editar registro real de/ }).click();
  await page.getByRole('spinbutton', { name: /Gramos reales de/ }).fill('200');
  await expect(page.getByRole('status').filter({ hasText: 'Borrador del diario guardado.' })).toBeVisible();
  await page.reload(); await expect(page.getByRole('spinbutton', { name: /Gramos reales de/ })).toHaveValue('200');
  await page.getByRole('button', { name: 'Guardar cambio real' }).click();
  await expect(page.getByTestId('actual-food')).toContainText('200 g');
  await selectFood(page, 'pollo');
  await page.getByRole('spinbutton', { name: 'Gramos consumidos' }).fill('37.5');
  await page.getByRole('button', { name: 'Registrar alimento consumido' }).click();
  await expect(page.getByTestId('actual-food')).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Semana planificada como referencia opcional' }).selectOption({ index: 1 });
  await expect(page.getByRole('columnheader', { name: 'Plan de referencia' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('diary-320.png'), fullPage: true });
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth,
    missingLabels: [...document.querySelectorAll('app-person-diary label')].filter(label => (label as HTMLLabelElement).control === null).map(label => label.textContent) })))
    .toEqual({ width: 320, viewport: 320, missingLabels: [] });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Deshacer comida consumida' }).click();
  await expect(page.getByTestId('actual-food')).toHaveCount(1);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /Eliminar registro real de/ }).click();
  await expect(page.getByTestId('actual-food')).toHaveCount(0);
  await expect(page.getByText('Objetivo guardado: versión 1')).toBeVisible();
});

test('same-name clients retain separate dated intake and unfinished owner-bound food drafts', async ({ page }) => {
  await onboard(page);
  async function addClient(reference: string): Promise<string> {
    await page.getByRole('link', { name: 'Gestionar personas' }).click();
    await page.getByRole('link', { name: 'Añadir cliente' }).click();
    await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Alex');
    await page.getByRole('textbox', { name: 'Referencia' }).fill(reference);
    await page.getByRole('button', { name: 'Guardar perfil' }).click();
    await expect(page.getByRole('combobox', { name: 'Persona activa' }).locator('option:checked')).toContainText(reference);
    return page.getByRole('combobox', { name: 'Persona activa' }).inputValue();
  }
  const first = await addClient('Mañana'); const second = await addClient('Tarde'); expect(first).not.toBe(second);
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(first); await diary(page);
  await page.getByLabel('Fecha del diario').fill('2026-09-21');
  await selectFood(page, 'quinoa');
  await page.getByRole('spinbutton', { name: 'Gramos consumidos' }).fill('93');
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(second); await diary(page);
  await page.getByLabel('Fecha del diario').fill('2026-09-21');
  await expect(page.getByRole('spinbutton', { name: 'Gramos consumidos' })).toHaveValue('');
  await expect(page.getByTestId('actual-food')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(first); await diary(page);
  await page.getByLabel('Fecha del diario').fill('2026-09-21');
  await expect(page.getByRole('spinbutton', { name: 'Gramos consumidos' })).toHaveValue('93');
  await page.getByRole('button', { name: 'Registrar alimento consumido' }).click();
  await expect(page.getByTestId('actual-food')).toHaveCount(1);
  await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cliente', exact: true }).click(); await diary(page);
  await page.getByLabel('Fecha del diario').fill('2026-09-21');
  await expect(page.getByTestId('actual-food')).toHaveCount(0);
  await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
  await page.getByRole('button', { name: 'Entrenador', exact: true }).click();
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(first); await diary(page);
  await page.getByLabel('Fecha del diario').fill('2026-09-21');
  await expect(page.getByTestId('actual-food')).toHaveCount(1);
});

for (const path of ['/', '/entrena/']) {
  test(`manual logging and reload offline after complete worker readiness at ${path}`, async ({ page, context }) => {
    await onboard(page, path); await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
    await expect(page.getByText('Recursos de esta entrega disponibles sin conexión.', { exact: true })).toBeVisible({ timeout: 30000 });
    expect(await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const manifest = await (await fetch(new URL('resource-manifest.json', document.baseURI))).json() as { resources: string[] };
      const responses = await Promise.all([...manifest.resources, 'resource-manifest.json'].map(resource => caches.match(new URL(resource, document.baseURI))));
      return registration.active?.state === 'activated' && !!navigator.serviceWorker.controller && responses.length > 1 && responses.every(response => response?.ok);
    })).toBe(true);
    await context.setOffline(true); await page.reload(); await diary(page);
    await page.getByLabel('Fecha del diario').fill('2026-09-21');
    await selectFood(page, 'arroz blanco de grano largo sin enriquecer crudo');
    await page.getByRole('spinbutton', { name: 'Gramos consumidos' }).fill('37.5');
    await page.getByRole('button', { name: 'Registrar alimento consumido' }).click();
    await expect(page.getByTestId('actual-food')).toHaveCount(1);
    await page.reload(); await expect(page.getByTestId('actual-food')).toContainText('37.5 g');
    expect(new URL(page.url()).pathname).toBe(path);
  });
}
