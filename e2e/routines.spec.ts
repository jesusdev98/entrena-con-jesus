import { expect, test, type Locator, type Page } from '@playwright/test';

async function onboard(page: Page, path = '/'): Promise<void> {
  await page.goto(path); await page.getByRole('radio', { name: /Entrenador/ }).check();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Jesús');
  await page.getByRole('button', { name: 'Crear mi espacio' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Jesús');
}
async function routines(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Rutinas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rutinas', exact: true })).toBeVisible();
}
async function create(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Crear rutina / recuperar nueva', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre de la rutina', exact: true })).toBeFocused();
  await page.getByRole('textbox', { name: 'Nombre de la rutina', exact: true }).fill(name);
}
async function addExercise(page: Page, day: Locator, category: string, loggingType?: string): Promise<Locator> {
  const name = await page.evaluate(async ({ category, loggingType }) => {
    const catalog = await (await fetch(new URL('catalogs/exercises.es.json', document.baseURI))).json() as { entries: { name: string; category: string; loggingType: string }[] };
    return catalog.entries.find(entry => entry.category === category && (!loggingType || entry.loggingType === loggingType))?.name;
  }, { category, loggingType });
  expect(name).toBeTruthy();
  await day.getByRole('button', { name: 'Añadir ejercicio', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toHaveAccessibleName('Añadir ejercicio al día');
  await dialog.getByRole('searchbox', { name: 'Buscar ejercicio' }).fill(name!);
  await dialog.getByRole('button', { name: `Ver detalles de ${name}`, exact: true }).click();
  await dialog.getByRole('button', { name: 'Añadir al día', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  return day.getByTestId('routine-exercise').last();
}
async function strength(page: Page, day: Locator): Promise<Locator> {
  const exercise = await addExercise(page, day, 'strength', 'weight-reps');
  await exercise.getByRole('spinbutton', { name: 'Repeticiones mínimas', exact: true }).fill('8');
  await exercise.getByRole('spinbutton', { name: 'Repeticiones máximas', exact: true }).fill('12');
  await exercise.getByRole('spinbutton', { name: 'Peso externo (kg)', exact: true }).fill('20.5');
  await exercise.getByRole('spinbutton', { name: 'RIR objetivo', exact: true }).fill('2');
  await exercise.getByRole('spinbutton', { name: 'Descanso (s)', exact: true }).fill('90');
  return exercise;
}
async function save(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Guardar rutina válida', exact: true }).click();
  await expect(page.getByText('Rutina válida guardada en esta persona.', { exact: true })).toBeVisible();
}
async function addClient(page: Page, reference: string): Promise<string> {
  await page.getByRole('link', { name: 'Gestionar personas' }).click(); await page.getByRole('link', { name: 'Añadir cliente' }).click();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Alex'); await page.getByRole('textbox', { name: 'Referencia' }).fill(reference);
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByRole('combobox', { name: 'Persona activa' }).locator('option:checked')).toContainText(reference);
  return page.getByRole('combobox', { name: 'Persona activa' }).inputValue();
}
async function uniqueLabels(page: Page): Promise<void> {
  expect(await page.locator('app-routine-editor').evaluate(root => {
    const ids = [...root.querySelectorAll('[id]')].map(element => element.id);
    return new Set(ids).size === ids.length && [...root.querySelectorAll('label')].every(label => label.control !== null);
  })).toBe(true);
}

test('mixed multiweek plan, nested duplication/reorder, immutable original, archive/restore and 320px labels', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 }); await onboard(page); await routines(page); await create(page, 'Plan mixto');
  await page.getByRole('button', { name: 'Guardar rutina válida', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('incompleta');
  const day = page.getByTestId('routine-day').first();
  await day.getByRole('textbox', { name: 'Nombre del día', exact: true }).fill('Fuerza y movilidad');
  const weights = await strength(page, day);
  await weights.getByRole('spinbutton', { name: 'Repeticiones máximas', exact: true }).fill('7');
  await page.getByRole('button', { name: 'Guardar rutina válida', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('mínimo ≤ máximo');
  await weights.getByRole('spinbutton', { name: 'Repeticiones máximas', exact: true }).fill('12');
  await weights.getByRole('button', { name: 'Duplicar serie 1', exact: true }).click();
  await expect(weights.getByTestId('planned-set')).toHaveCount(2);
  const cardio = await addExercise(page, day, 'cardio', 'distance-duration');
  await cardio.getByRole('spinbutton', { name: 'Distancia (m)', exact: true }).fill('1500');
  await cardio.getByRole('spinbutton', { name: 'Duración (s)', exact: true }).fill('600');
  await expect(cardio.getByRole('spinbutton', { name: 'RIR objetivo', exact: true })).toHaveCount(0);
  const stretch = await addExercise(page, day, 'stretching', 'duration');
  await stretch.getByRole('spinbutton', { name: 'Duración (s)', exact: true }).fill('30');
  await stretch.getByRole('button', { name: 'Subir ejercicio 3', exact: true }).click();
  await day.getByRole('button', { name: 'Duplicar día 1', exact: true }).click();
  await page.getByTestId('routine-day').nth(1).getByRole('textbox', { name: 'Nombre del día', exact: true }).fill('Variación');
  await page.getByRole('button', { name: 'Subir día 2', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicar semana 1', exact: true }).click();
  await expect(page.getByTestId('routine-week')).toHaveCount(2); await expect(page.getByTestId('routine-day')).toHaveCount(4);
  await uniqueLabels(page);
  const firstMin = page.getByRole('spinbutton', { name: 'Repeticiones mínimas', exact: true }).first();
  await firstMin.focus(); await page.keyboard.press('ArrowUp'); await expect(firstMin).toHaveValue('9');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('textbox', { name: 'Nombre de la rutina', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('routine-editor-320.png') });
  await page.getByTestId('planned-set').first().scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath('routine-prescription-320.png') });
  await save(page); await page.reload(); await expect(page.getByTestId('routine-card')).toContainText('2 semanas');
  await page.getByRole('button', { name: 'Duplicar Plan mixto', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nombre de la rutina', exact: true }).fill('Plan independiente');
  await page.getByRole('spinbutton', { name: 'Peso externo (kg)', exact: true }).first().fill('99'); await save(page);
  await expect(page.getByTestId('routine-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Editar Plan mixto', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Peso externo (kg)', exact: true }).first()).toHaveValue('20.5');
  await page.getByRole('button', { name: 'Volver a la lista conservando borrador', exact: true }).click();
  await page.getByRole('button', { name: 'Archivar Plan independiente', exact: true }).click(); await expect(page.getByTestId('routine-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ver rutinas archivadas', exact: true }).click();
  await page.getByRole('button', { name: 'Restaurar Plan independiente', exact: true }).click(); await expect(page.getByTestId('routine-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver rutinas activas', exact: true }).click(); await expect(page.getByTestId('routine-card')).toHaveCount(2);
});

test('routine drafts recover after reload and stay with same-name people across modes', async ({ page }) => {
  await onboard(page); const first = await addClient(page, 'Mañana'); const second = await addClient(page, 'Tarde'); expect(first).not.toBe(second);
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(first); await routines(page); await create(page, 'Solo primer Alex');
  await page.getByRole('textbox', { name: 'Notas de la rutina', exact: true }).fill('Borrador incompleto');
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(second); await routines(page);
  await expect(page.getByTestId('routine-card')).toHaveCount(0); await create(page, 'Solo segundo Alex');
  await strength(page, page.getByTestId('routine-day').first()); await save(page);
  await page.getByRole('combobox', { name: 'Persona activa' }).selectOption(first); await routines(page);
  await page.getByRole('button', { name: 'Recuperar borrador: Solo primer Alex', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Notas de la rutina', exact: true })).toHaveValue('Borrador incompleto');
  await page.reload(); await page.getByRole('button', { name: 'Recuperar borrador: Solo primer Alex', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Nombre de la rutina', exact: true })).toHaveValue('Solo primer Alex');
  await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click(); await page.getByRole('button', { name: 'Cliente', exact: true }).click(); await routines(page);
  await expect(page.getByTestId('routine-card')).toHaveCount(0); await expect(page.getByRole('button', { name: /Recuperar borrador:/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click(); await page.getByRole('button', { name: 'Entrenador', exact: true }).click(); await routines(page);
  await page.getByRole('button', { name: 'Recuperar borrador: Solo primer Alex', exact: true }).click();
  await strength(page, page.getByTestId('routine-day').first()); await save(page);
  await expect(page.getByTestId('routine-card')).toHaveCount(1); await expect(page.getByTestId('routine-card')).toContainText('Solo primer Alex');
});

test('person custom assistance snapshot survives later catalog edits and nested add/remove actions', async ({ page }) => {
  await onboard(page); await routines(page); await page.getByRole('link', { name: 'Explorar ejercicios', exact: true }).click();
  await page.getByRole('button', { name: 'Añadir ejercicio personalizado', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nombre del ejercicio', exact: true }).fill('Asistencia propia');
  await page.getByRole('combobox', { name: 'Categoría', exact: true }).selectOption('strength');
  await page.getByRole('combobox', { name: 'Tipo de registro', exact: true }).selectOption('assisted_bodyweight');
  await page.getByRole('textbox', { name: 'Instrucciones (opcional)', exact: true }).fill('Instrucción original');
  await page.getByRole('button', { name: 'Guardar ejercicio', exact: true }).click();
  await expect(page.getByText('Ejercicio guardado en esta persona.', { exact: true })).toBeVisible();
  await routines(page); await create(page, 'Con personalizado');
  const day = page.getByTestId('routine-day').first(); await day.getByRole('button', { name: 'Añadir ejercicio', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog.getByText('251 ejercicios encontrados.', { exact: true })).toBeVisible();
  await dialog.getByRole('searchbox', { name: 'Buscar ejercicio' }).fill('Asistencia propia');
  const details = dialog.getByRole('button', { name: 'Ver detalles de Asistencia propia', exact: true }); await details.focus(); await page.keyboard.press('Enter');
  await expect(dialog).toContainText('Instrucción original'); await dialog.getByRole('button', { name: 'Añadir al día', exact: true }).click();
  const exercise = day.getByTestId('routine-exercise').first();
  await exercise.getByRole('spinbutton', { name: 'Repeticiones mínimas', exact: true }).fill('6');
  await exercise.getByRole('spinbutton', { name: 'Repeticiones máximas', exact: true }).fill('8');
  await exercise.getByRole('spinbutton', { name: 'Asistencia (kg)', exact: true }).fill('12.5');
  await expect(exercise.getByRole('spinbutton', { name: 'Peso externo (kg)', exact: true })).toHaveCount(0);
  await exercise.getByRole('button', { name: 'Añadir serie', exact: true }).click(); await exercise.getByRole('button', { name: 'Eliminar serie 2', exact: true }).click();
  await day.getByRole('button', { name: 'Duplicar ejercicio 1', exact: true }).click(); await uniqueLabels(page);
  await day.getByRole('button', { name: 'Eliminar ejercicio 2', exact: true }).click();
  await page.getByRole('button', { name: 'Añadir día', exact: true }).click(); await page.getByRole('button', { name: 'Eliminar día 2', exact: true }).click();
  await page.getByRole('button', { name: 'Añadir semana', exact: true }).click(); await page.getByRole('button', { name: 'Eliminar semana 2', exact: true }).click();
  await save(page);
  await page.getByRole('link', { name: 'Explorar ejercicios', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Buscar ejercicio' }).fill('Asistencia propia');
  await page.getByRole('button', { name: 'Ver detalles de Asistencia propia', exact: true }).click(); await page.getByRole('button', { name: 'Editar ejercicio', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nombre del ejercicio', exact: true }).fill('Nombre posterior');
  await page.getByRole('textbox', { name: 'Instrucciones (opcional)', exact: true }).fill('Instrucción posterior');
  await page.getByRole('combobox', { name: 'Tipo de registro', exact: true }).selectOption('duration');
  await page.getByRole('button', { name: 'Guardar ejercicio', exact: true }).click(); await expect(page.getByText('Ejercicio guardado en esta persona.', { exact: true })).toBeVisible();
  await routines(page); await page.getByRole('button', { name: 'Editar Con personalizado', exact: true }).click();
  await expect(page.getByTestId('routine-exercise')).toContainText('Asistencia propia');
  await expect(page.getByRole('spinbutton', { name: 'Asistencia (kg)', exact: true })).toHaveValue('12.5');
  await page.getByText('Instrucciones e ilustraciones guardadas', { exact: true }).click();
  await expect(page.getByTestId('routine-exercise')).toContainText('Instrucción original'); await expect(page.getByTestId('routine-exercise')).not.toContainText('Instrucción posterior');
});

test('cross-tab commit requires explicit comparison and preserves the local draft choice', async ({ page, context }) => {
  await onboard(page); await routines(page); await create(page, 'Plan compartido entre pestañas');
  await strength(page, page.getByTestId('routine-day').first()); await save(page);
  await page.getByRole('button', { name: 'Editar Plan compartido entre pestañas', exact: true }).click();
  await page.getByRole('textbox', { name: 'Notas de la rutina', exact: true }).fill('Mis valores locales');
  await expect(page.getByText('Borrador guardado en este dispositivo. Aún no es una rutina guardada.', { exact: true })).toBeVisible();
  const other = await context.newPage(); await other.goto(page.url());
  await other.getByRole('button', { name: 'Editar Plan compartido entre pestañas', exact: true }).click();
  await other.getByRole('textbox', { name: 'Notas de la rutina', exact: true }).fill('Valores de otra pestaña'); await save(other);
  await page.getByRole('button', { name: 'Guardar rutina válida', exact: true }).click();
  const comparison = page.getByRole('region', { name: 'Comparación de versiones' }); await expect(comparison).toBeVisible();
  await expect(comparison).toContainText('Mis valores locales'); await expect(comparison).toContainText('Valores de otra pestaña');
  await expect(page.getByRole('button', { name: 'Guardar rutina válida', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Conservar mis cambios sobre esta versión', exact: true }).click(); await save(page); await page.reload();
  await page.getByRole('button', { name: 'Editar Plan compartido entre pestañas', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Notas de la rutina', exact: true })).toHaveValue('Mis valores locales'); await other.close();
});

for (const path of ['/', '/entrena/']) {
  test(`creates and edits a routine fully offline after worker readiness at ${path}`, async ({ page, context }) => {
    await onboard(page, path); await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
    await expect(page.getByText('Recursos de esta entrega disponibles sin conexión.', { exact: true })).toBeVisible({ timeout: 30000 });
    expect(await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const manifest = await (await fetch(new URL('resource-manifest.json', document.baseURI))).json() as { resources: string[] };
      const resources = await Promise.all([...manifest.resources, 'resource-manifest.json'].map(resource => caches.match(new URL(resource, document.baseURI))));
      return registration.active?.state === 'activated' && navigator.serviceWorker.controller !== null && resources.length > 1 && resources.every(response => response?.ok);
    })).toBe(true);
    await context.setOffline(true); await page.reload(); await routines(page); await create(page, 'Rutina sin conexión');
    await strength(page, page.getByTestId('routine-day').first()); await save(page); await page.reload();
    await page.getByRole('button', { name: 'Editar Rutina sin conexión', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Peso externo (kg)', exact: true }).fill('22.75');
    await page.getByRole('textbox', { name: 'Notas de la rutina', exact: true }).fill('Editada sin conexión'); await save(page); await page.reload();
    await page.getByRole('button', { name: 'Editar Rutina sin conexión', exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: 'Peso externo (kg)', exact: true })).toHaveValue('22.75');
    await expect(page.getByRole('textbox', { name: 'Notas de la rutina', exact: true })).toHaveValue('Editada sin conexión');
    await page.getByText('Instrucciones e ilustraciones guardadas', { exact: true }).click();
    const images = page.locator('app-routine-exercise-editor img'); await expect(images).toHaveCount(2);
    for (const image of await images.all()) expect(await image.evaluate(async node => { await (node as HTMLImageElement).decode(); return (node as HTMLImageElement).naturalWidth > 0; })).toBe(true);
    expect(new URL(page.url()).pathname).toBe(path);
  });
}
