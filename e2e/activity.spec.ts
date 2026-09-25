import { expect, test, type Page } from '@playwright/test';
import { markLegacyWorkspace } from './support/legacy-workspace';

async function onboard(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await markLegacyWorkspace(page);
  await page.getByRole('radio', { name: /Entrenador/ }).check();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Jesús');
  await page.getByRole('button', { name: 'Crear mi espacio' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Jesús', { timeout: 15_000 });
}

async function profile(page: Page, weight = '80'): Promise<void> {
  await page.getByRole('link', { name: 'Completar perfil' }).click();
  await page.getByText('Medidas personales · opcional').click();
  await page.getByRole('spinbutton', { name: 'Edad (años)' }).fill('30');
  await page.getByLabel('Sexo para la fórmula energética').selectOption('male');
  await page.getByRole('spinbutton', { name: 'Altura (cm)' }).fill('180');
  await page.getByRole('spinbutton', { name: 'Peso (kg)' }).fill(weight);
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText('Jesús');
}

async function activity(page: Page, date = '2026-01-01'): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('link', { name: 'Actividad diaria y objetivos' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Borrador recuperado' })).toBeVisible();
  await page.getByLabel('Fecha de actividad').fill(date);
  await expect(page.getByRole('heading', { name: `Jesús · ${date}` })).toBeVisible();
}

async function session(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Rutinas', exact: true }).click();
  await page.getByRole('button', { name: 'Crear rutina / recuperar nueva' }).click();
  await page.getByRole('textbox', { name: 'Nombre de la rutina' }).fill('Plan real');
  await page.getByRole('textbox', { name: 'Nombre del día' }).fill('Día de prueba');
  const exercise = await page.evaluate(async () => {
    const catalog = await (await fetch(new URL('catalogs/exercises.es.json', document.baseURI))).json() as { entries: { name: string; loggingType: string }[] };
    return catalog.entries.find(entry => entry.loggingType === 'weight-reps')!.name;
  });
  await page.getByRole('button', { name: 'Añadir ejercicio' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('searchbox', { name: 'Buscar ejercicio' }).fill(exercise);
  await dialog.getByRole('button', { name: `Ver detalles de ${exercise}` }).click();
  await dialog.getByRole('button', { name: 'Añadir al día' }).click();
  const planned = page.getByTestId('routine-exercise');
  await planned.getByRole('spinbutton', { name: 'Repeticiones mínimas' }).fill('8');
  await planned.getByRole('spinbutton', { name: 'Repeticiones máximas' }).fill('12');
  await page.getByRole('button', { name: 'Guardar rutina válida' }).click();
  await expect(page.getByText('Rutina válida guardada en esta persona.')).toBeVisible();
  await page.getByRole('link', { name: 'Entrenar Plan real' }).click();
  await page.getByLabel('Fecha de entrenamiento').fill('2026-01-01');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  const set = page.getByTestId('actual-set');
  await set.getByRole('spinbutton', { name: /Peso real/ }).fill('22.5');
  await set.getByRole('spinbutton', { name: /Repeticiones reales/ }).fill('10');
  await set.getByRole('spinbutton', { name: /RPE real/ }).fill('8');
  await set.getByRole('button', { name: /^Completar serie/ }).click();
  await page.getByRole('spinbutton', { name: 'Duración de la sesión (min)' }).fill('60');
  await page.getByRole('button', { name: 'Finalizar y guardar sesión' }).click();
  await expect(page.getByText('Sesión finalizada y guardada. Ya aparece en el historial.')).toBeVisible();
}

test('profile, work, steps and completed workout feed signed targets; saved history keeps its captured context at 320px', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await onboard(page); await profile(page); await session(page); await activity(page);
  await page.getByRole('spinbutton', { name: 'Pasos totales reales' }).fill('7600');
  const work = page.getByRole('region', { name: 'Trabajo real' });
  await work.getByRole('button', { name: 'Registrar · Trabajo real' }).click();
  await work.getByRole('spinbutton', { name: 'Pasos incluidos · Trabajo real' }).fill('3000');
  await work.getByRole('button', { name: 'Añadir bloque manual · Trabajo real' }).click();
  await work.getByRole('spinbutton', { name: 'Duración (min) · Trabajo real · 1' }).fill('240');
  await work.getByRole('combobox', { name: 'Actividad MET · Trabajo real · 1' }).selectOption('adult:11115');
  const training = page.getByRole('region', { name: 'Entrenamiento real' });
  await training.getByRole('button', { name: 'Registrar · Entrenamiento real' }).click();
  await training.getByRole('spinbutton', { name: 'Pasos incluidos · Entrenamiento real' }).fill('600');
  await training.getByRole('combobox', { name: 'Sesión finalizada · Entrenamiento real' }).selectOption({ index: 1 });
  await training.getByRole('button', { name: 'Vincular sesión · Entrenamiento real' }).click();
  await expect(training.getByRole('combobox', { name: 'Sesión finalizada · Entrenamiento real' }).locator('option')).toHaveCount(1);
  await training.getByRole('combobox', { name: 'Actividad MET · Entrenamiento real · 1' }).selectOption('adult:02054');
  await page.getByRole('combobox', { name: 'Objetivo del día' }).selectOption('loss');
  await page.getByRole('spinbutton', { name: 'Ajuste libre (kcal)' }).fill('300');
  await expect(page.getByTestId('expenditure')).toContainText('3,019.97');
  await expect(page.getByTestId('target-kcal')).toContainText('2,719.97');
  await page.getByRole('combobox', { name: 'Objetivo del día' }).selectOption('gain');
  await page.getByRole('spinbutton', { name: 'Ajuste libre (kcal)' }).fill('450');
  await page.getByRole('spinbutton', { name: 'Proteínas (%)' }).fill('30');
  await page.getByRole('spinbutton', { name: 'Carbohidratos (%)' }).fill('45');
  await expect(page.getByTestId('target-kcal')).toContainText('3,469.97');
  await expect(page.getByTestId('protein-grams')).toContainText('260.25');
  await page.getByRole('button', { name: 'Guardar actividad y objetivo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Actividad y objetivo guardados' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('activity-320.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('app-activity-editor label')].every(label => (label as HTMLLabelElement).control !== null))).toBe(true);
  await page.reload();
  await expect(page.getByTestId('target-kcal')).toContainText('3,469.97');
  await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('link', { name: 'Completar perfil' }).click();
  await page.getByText('Medidas personales · opcional').click();
  await page.getByRole('spinbutton', { name: 'Peso (kg)' }).fill('90');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await activity(page);
  await expect(page.getByText('Mediciones capturadas: 30 años · 80 kg')).toBeVisible();
  await expect(page.getByTestId('target-kcal')).toContainText('3,469.97');
});

for (const path of ['/', '/entrena/']) {
  test(`edits and reloads the daily target offline with a real complete worker cache at ${path}`, async ({ page, context }) => {
    await onboard(page, path); await profile(page); await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
    await expect(page.getByText('Recursos de esta entrega disponibles sin conexión.', { exact: true })).toBeVisible({ timeout: 30000 });
    expect(await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const manifest = await (await fetch(new URL('resource-manifest.json', document.baseURI))).json() as { resources: string[] };
      const responses = await Promise.all([...manifest.resources, 'resource-manifest.json'].map(resource => caches.match(new URL(resource, document.baseURI))));
      return registration.active?.state === 'activated' && !!navigator.serviceWorker.controller && responses.length > 1 && responses.every(response => response?.ok);
    })).toBe(true);
    await context.setOffline(true); await page.reload();
    await page.getByRole('navigation').getByRole('link', { name: 'Inicio', exact: true }).click();
    await activity(page);
    await page.getByRole('spinbutton', { name: 'Pasos totales reales' }).fill('0');
    await page.getByRole('region', { name: 'Trabajo real' }).getByRole('button', { name: 'Sin actividad (cero) · Trabajo real' }).click();
    await page.getByRole('region', { name: 'Entrenamiento real' }).getByRole('button', { name: 'Sin actividad (cero) · Entrenamiento real' }).click();
    await page.getByRole('combobox', { name: 'Objetivo del día' }).selectOption('gain');
    await page.getByRole('spinbutton', { name: 'Ajuste libre (kcal)' }).fill('450');
    await expect(page.getByTestId('target-kcal')).toContainText('2,509.59');
    await page.getByRole('button', { name: 'Guardar actividad y objetivo' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Actividad y objetivo guardados' })).toBeVisible();
    await page.reload(); await expect(page.getByTestId('target-kcal')).toContainText('2,509.59');
    expect(new URL(page.url()).pathname).toBe(path);
  });
}
