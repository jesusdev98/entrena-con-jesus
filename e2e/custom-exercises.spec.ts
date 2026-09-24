import { expect, test, type Page } from '@playwright/test';

async function onboard(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await page.getByRole('radio', { name: /Entrenador/ }).check();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Jesús');
  await page.getByRole('button', { name: 'Crear mi espacio' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Jesús');
}
async function openCatalog(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Rutinas', exact: true }).click();
  await page.getByRole('link', { name: 'Explorar ejercicios', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ejercicios', exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Buscar ejercicio' })).toBeVisible();
}
async function fillExercise(page: Page, name: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Nombre del ejercicio', exact: true }).fill(name);
  await page.getByRole('combobox', { name: 'Categoría', exact: true }).selectOption('strength');
  await page.getByRole('combobox', { name: 'Tipo de registro', exact: true }).selectOption('assisted_bodyweight');
  await page.getByRole('textbox', { name: 'Equipamiento (opcional)', exact: true }).fill('Banda, Banco');
  await page.getByRole('textbox', { name: 'Instrucciones (opcional)', exact: true }).fill('Controla el movimiento.');
  await page.getByRole('textbox', { name: 'Notas (opcional)', exact: true }).fill('Asistencia, no peso levantado.');
}
async function addClient(page: Page, reference: string): Promise<string> {
  await page.getByRole('link', { name: 'Gestionar personas' }).click();
  await page.getByRole('link', { name: 'Añadir cliente' }).click();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Alex');
  await page.getByRole('textbox', { name: 'Referencia' }).fill(reference);
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByRole('combobox', { name: 'Persona activa' }).locator('option:checked')).toContainText(reference);
  return page.getByRole('combobox', { name: 'Persona activa' }).inputValue();
}

test('custom exercise create, edit, reload, archive/restore and 320px accessible fields', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await onboard(page); await openCatalog(page);
  await page.getByRole('searchbox', { name: 'Buscar ejercicio' }).fill('banca plana');
  await page.getByRole('button', { name: 'Ver detalles de Press de banca con barra', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /Editar|Archivar|Restaurar/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Añadir ejercicio personalizado' }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre del ejercicio', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Guardar ejercicio', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Revisa');
  await fillExercise(page, 'Remo propio');
  expect(await page.evaluate(() => [...document.querySelectorAll('app-custom-exercise-editor label')].every(label => (label as HTMLLabelElement).control !== null))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('custom-exercise-editor-320.png'), fullPage: true });
  await page.getByRole('button', { name: 'Guardar ejercicio', exact: true }).click();
  await expect(page.getByText('Ejercicio guardado en esta persona.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Añadir ejercicio personalizado' })).toBeFocused();
  await page.reload();
  await expect(page.getByText('251 ejercicios encontrados.', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Origen', exact: true }).selectOption('catalog');
  await expect(page.getByText('250 ejercicios encontrados.', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Origen', exact: true }).selectOption('custom');
  await page.getByRole('searchbox', { name: 'Buscar ejercicio' }).fill('remo PROPIO');
  await page.getByRole('combobox', { name: 'Equipamiento', exact: true }).selectOption('Banda');
  await expect(page.getByTestId('exercise-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ver detalles de Remo propio', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('Remo propio');
  await expect(dialog).toContainText('No hay ilustraciones asociadas.');
  await expect(dialog).toContainText('Asistencia, no peso levantado.');
  await expect(dialog.locator('img, a')).toHaveCount(0);
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Editar ejercicio', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Tipo de registro', exact: true })).toHaveValue('assisted_bodyweight');
  await expect(page.getByRole('textbox', { name: 'Equipamiento (opcional)', exact: true })).toHaveValue('Banda, Banco');
  await page.getByRole('textbox', { name: 'Nombre del ejercicio', exact: true }).fill('Remo actualizado');
  await page.getByRole('button', { name: 'Guardar ejercicio', exact: true }).click();
  await page.getByRole('button', { name: 'Ver detalles de Remo actualizado', exact: true }).click();
  await page.getByRole('button', { name: 'Archivar ejercicio', exact: true }).click();
  await expect(page.getByTestId('exercise-card')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Origen', exact: true }).selectOption('all');
  await expect(page.getByText('250 ejercicios encontrados.', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Origen', exact: true }).selectOption('archived');
  await page.getByRole('button', { name: 'Ver detalles de Remo actualizado', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Editar ejercicio', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Restaurar ejercicio', exact: true }).click();
  await page.getByRole('combobox', { name: 'Origen', exact: true }).selectOption('custom');
  await expect(page.getByTestId('exercise-card')).toHaveCount(1);
  await expect(page.getByTestId('exercise-card')).toContainText('Remo actualizado');
  await page.reload();
  await expect(page.getByText('251 ejercicios encontrados.', { exact: true })).toBeVisible();
});

test('custom exercise drafts and saved entries stay with same-name people across modes', async ({ page }) => {
  await onboard(page); const first = await addClient(page, 'Mañana'); const second = await addClient(page, 'Tarde');
  expect(first).not.toBe(second);
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(first); await openCatalog(page);
  await page.getByRole('button', { name: 'Añadir ejercicio personalizado' }).click(); await fillExercise(page, 'Solo primer Alex');
  // Switch immediately after the last input: the transition itself must flush the draft.
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(second); await openCatalog(page);
  await page.getByRole('combobox', { name: 'Origen', exact: true }).selectOption('custom');
  await expect(page.getByTestId('exercise-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Añadir ejercicio personalizado' }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre del ejercicio', exact: true })).toHaveValue('');
  await fillExercise(page, 'Solo segundo Alex'); await page.getByRole('button', { name: 'Guardar ejercicio', exact: true }).click();
  await expect(page.getByTestId('exercise-card')).toContainText('Solo segundo Alex');
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(first); await openCatalog(page);
  await page.getByRole('button', { name: 'Añadir ejercicio personalizado' }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre del ejercicio', exact: true })).toHaveValue('Solo primer Alex');
  await page.reload(); await page.getByRole('button', { name: 'Añadir ejercicio personalizado' }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre del ejercicio', exact: true })).toHaveValue('Solo primer Alex');
  await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cliente', exact: true }).click(); await openCatalog(page);
  await page.getByRole('combobox', { name: 'Origen', exact: true }).selectOption('custom'); await expect(page.getByTestId('exercise-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Añadir ejercicio personalizado' }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre del ejercicio', exact: true })).toHaveValue('');
  await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
  await page.getByRole('button', { name: 'Entrenador', exact: true }).click(); await openCatalog(page);
  await page.getByRole('button', { name: 'Añadir ejercicio personalizado' }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre del ejercicio', exact: true })).toHaveValue('Solo primer Alex');
  await page.getByRole('button', { name: 'Guardar ejercicio', exact: true }).click();
  await page.getByRole('combobox', { name: 'Origen', exact: true }).selectOption('custom');
  await expect(page.getByTestId('exercise-card')).toHaveCount(1); await expect(page.getByTestId('exercise-card')).toContainText('Solo primer Alex');
});

for (const path of ['/', '/entrena/']) {
  test(`creates and reloads a custom exercise offline at ${path}`, async ({ page, context }) => {
    await onboard(page, path);
    await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
    await expect(page.getByText('Recursos de esta entrega disponibles sin conexión.', { exact: true })).toBeVisible({ timeout: 30000 });
    expect(await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const manifest = await (await fetch(new URL('resource-manifest.json', document.baseURI))).json() as { resources: string[] };
      const resources = await Promise.all([...manifest.resources, 'resource-manifest.json'].map(resource => caches.match(new URL(resource, document.baseURI))));
      return registration.active?.state === 'activated' && navigator.serviceWorker.controller !== null && resources.length > 1 && resources.every(response => response?.ok);
    })).toBe(true);
    await context.setOffline(true); await page.reload(); await openCatalog(page);
    await page.getByRole('button', { name: 'Añadir ejercicio personalizado' }).click(); await fillExercise(page, 'Ejercicio sin conexión');
    await page.getByRole('combobox', { name: 'Categoría', exact: true }).selectOption('cardio');
    await page.getByRole('combobox', { name: 'Tipo de registro', exact: true }).selectOption('distance_duration');
    await page.getByRole('button', { name: 'Guardar ejercicio', exact: true }).click();
    await expect(page.getByText('Ejercicio guardado en esta persona.', { exact: true })).toBeVisible();
    await page.reload(); await page.getByRole('combobox', { name: 'Origen', exact: true }).selectOption('custom');
    await expect(page.getByTestId('exercise-card')).toContainText('Ejercicio sin conexión');
    await expect(page.getByTestId('exercise-card')).toContainText('Distancia y duración');
    await page.getByRole('button', { name: 'Ver detalles de Ejercicio sin conexión', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('No hay ilustraciones asociadas.');
    expect(new URL(page.url()).pathname).toBe(path);
  });
}
