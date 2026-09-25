import { expect, test, type Page } from '@playwright/test';

const opaque = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
type Day = { date: string; activity: { totalSteps: { actual?: number }; mode: string } };
async function records(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('entrena-con-jesus');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction(['settings', 'people', 'routineRevisions', 'mealPlanRevisions', 'trainingSessions', 'foodLogs', 'dailySnapshots'], 'readonly');
      const all = (name: string) => new Promise<unknown[]>((resolve, reject) => {
        const request = tx.objectStore(name).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      const [settings, people, routines, meals, sessions, logs, days] = await Promise.all(
        ['settings', 'people', 'routineRevisions', 'mealPlanRevisions', 'trainingSessions', 'foodLogs', 'dailySnapshots'].map(all));
      return { settings: settings[0] as { mode: string; personalPersonId: string; activePersonId: string;
        demoSeed?: { status: string; receipt?: { sessions: unknown[]; foodLogs: unknown[]; snapshots: unknown[] } } },
      people: people as { id: string; displayName: string; profile: { weightKg: number | null } }[],
      routines: routines as { name: string; content: { weeks: { days: unknown[] }[] } }[], meals: meals as { name: string; content: { weeks: { days: { meals: unknown[] }[] }[] } }[],
      sessions: sessions as { date: string; status: string; exercises: { exercise: { exerciseId: string; name: string }; sets: { actual: { weightKg?: number }; rpe: number }[] }[] }[],
      logs: logs as { date: string; food: { foodId: string; source: { fdcId: string } } }[], days: days as Day[] };
    } finally { db.close(); }
  });
}
async function onboardFresh(page: Page, mode: 'Entrenador' | 'Cliente'): Promise<void> {
  await page.goto('/');
  await page.getByRole('radio', { name: new RegExp(mode) }).check();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Alex real');
  await page.getByRole('button', { name: 'Crear mi espacio' }).click();
  await expect(page.getByTestId('active-person-name')).toHaveText(mode === 'Entrenador' ? 'Usuario de prueba' : 'Alex real');
}
async function navigate(page: Page, label: string): Promise<void> {
  if (label === 'Ajustes') { await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click(); return; }
  await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click();
}
async function noVisibleIds(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.body.innerText + [...document.querySelectorAll('option')].map(option => option.textContent).join(' '))).not.toMatch(opaque);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('fresh trainer seed shows published sources, editable plans and dated actuals; opt-in reset preserves consumption rule', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 }); await onboardFresh(page, 'Entrenador');
  const initial = await records(page);
  expect(initial.settings.demoSeed?.status).toBe('seeded');
  expect(initial.settings.activePersonId).not.toBe(initial.settings.personalPersonId);
  expect(initial.people.map(p => p.displayName).sort()).toEqual(['Alex real', 'Usuario de prueba']);
  expect(initial.routines).toHaveLength(1); expect(initial.routines[0].content.weeks[0].days).toHaveLength(4);
  expect(initial.meals).toHaveLength(1); expect(initial.meals[0].name).toBe('Plan de alimentación de prueba');
  expect(initial.meals[0].content.weeks[0].days).toHaveLength(7);
  expect(initial.meals[0].content.weeks[0].days.every(day => day.meals.length === 4)).toBe(true);
  expect(initial.sessions).toHaveLength(21); expect(initial.logs).toHaveLength(96); expect(initial.days).toHaveLength(12);
  expect(initial.settings.demoSeed?.receipt?.sessions).toHaveLength(21);
  expect(initial.settings.demoSeed?.receipt?.foodLogs).toHaveLength(96);
  expect(initial.settings.demoSeed?.receipt?.snapshots).toHaveLength(12);
  expect(initial.sessions.every(s => s.status === 'completed' && s.date < new Date().toLocaleDateString('sv-SE'))).toBe(true);
  expect(initial.sessions.flatMap(s => s.exercises).some(e => e.exercise.exerciseId === 'exercise-bench-press' && e.sets.some(set => set.rpe >= 7.5 && set.actual.weightKg === 50))).toBe(true);
  const catalog = await page.evaluate(async () => Promise.all(['exercises.es.json', 'foods.es.json'].map(async name =>
    (await (await fetch(new URL(`catalogs/${name}`, document.baseURI))).json()).entries))) as
    [{ id: string }[], { id: string; source: { fdcId: string } }[]];
  expect(catalog[0].some(entry => entry.id === 'exercise-bench-press')).toBe(true);
  expect(initial.logs.every(log => catalog[1].some(entry => entry.id === log.food.foodId && entry.source.fdcId === log.food.source.fdcId))).toBe(true);
  await page.screenshot({ path: info.outputPath('trainer-demo-home-320.png') }); await noVisibleIds(page);
  await navigate(page, 'Rutinas');
  await expect(page.getByTestId('routine-card')).toContainText('Demo · Rutina superior e inferior');
  await page.getByRole('button', { name: 'Editar Demo · Rutina superior e inferior' }).click();
  await page.getByRole('textbox', { name: 'Nombre de la rutina' }).fill('Demo · Rutina ajustada');
  await page.getByRole('button', { name: 'Guardar rutina válida' }).click();
  await expect(page.getByTestId('routine-card')).toContainText('Demo · Rutina ajustada');
  await page.getByRole('button', { name: 'Archivar Demo · Rutina ajustada' }).click();
  await page.getByRole('button', { name: 'Ver rutinas archivadas' }).click();
  await expect(page.getByTestId('routine-card')).toContainText('Demo · Rutina ajustada');
  await page.getByRole('button', { name: 'Eliminar definitivamente Demo · Rutina ajustada' }).click();
  await expect(page.getByRole('dialog')).toContainText('entrenamientos y consumos reales');
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar definitivamente', exact: true }).click();
  expect((await records(page)).sessions).toHaveLength(21);
  await navigate(page, 'Progreso');
  await page.getByLabel('Fecha de la semana', { exact: true }).fill([...initial.sessions].sort((a, b) => a.date.localeCompare(b.date))[0].date);
  await expect(page.getByRole('region', { name: 'Semana seleccionada' }).getByTestId('session-summary')).toHaveCount(3);
  await page.getByRole('region', { name: 'Semana seleccionada' }).getByTestId('session-summary').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('trainer-demo-progress-320.png') }); await noVisibleIds(page);
  await navigate(page, 'Inicio'); await page.getByRole('link', { name: 'Diario alimentario' }).click();
  await page.getByLabel('Fecha del diario').fill(initial.days[0].date);
  await expect(page.getByTestId('actual-food')).toHaveCount(8);
  await page.getByTestId('actual-food').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('trainer-demo-diary-320.png') }); await noVisibleIds(page);
  await page.goto(`/#/activity?date=${initial.days[0].date}`);
  await expect(page.getByLabel('Fecha de actividad')).toHaveValue(initial.days[0].date);
  await expect(page.getByRole('spinbutton', { name: 'Pasos totales reales' })).toHaveValue(String(initial.days[0].activity.totalSteps.actual));
  await navigate(page, 'Ajustes');
  await page.getByRole('button', { name: 'Eliminar datos demo', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar datos demo' });
  await expect(dialog).not.toContainText('se modificaron');
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  expect((await records(page)).sessions).toHaveLength(21);
  await page.getByRole('button', { name: 'Eliminar datos demo', exact: true }).click();
  await dialog.getByRole('button', { name: 'Eliminar datos demo definitivamente' }).click();
  await expect(page.getByText('Datos demo eliminados. No volverán a aparecer.')).toBeVisible();
  await page.reload();
  const cleared = await records(page);
  expect(cleared.settings.demoSeed?.status).toBe('cleared');
  expect(cleared.people.map(p => p.displayName)).toEqual(['Alex real']);
  expect([cleared.routines.length, cleared.meals.length, cleared.sessions.length, cleared.logs.length, cleared.days.length]).toEqual([0, 0, 0, 0, 0]);
  await page.getByRole('button', { name: 'Cliente', exact: true }).click();
  await page.getByRole('button', { name: 'Entrenador', exact: true }).click();
  expect((await records(page)).settings.demoSeed?.status).toBe('cleared');
  await navigate(page, 'Rutinas'); await expect(page.getByRole('button', { name: 'Crear primera rutina' })).toBeVisible();
});

test('fresh client keeps the entered profile and clears only demo records at 320px', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 }); await onboardFresh(page, 'Cliente');
  const initial = await records(page);
  expect(initial.people).toHaveLength(1); expect(initial.people[0].profile.weightKg).toBeNull();
  expect(initial.settings.activePersonId).toBe(initial.settings.personalPersonId);
  expect(initial.days.every(day => day.activity.mode === 'manual-tdee' && day.activity.totalSteps.actual! >= 6000)).toBe(true);
  await navigate(page, 'Rutinas'); await expect(page.getByTestId('routine-card')).toContainText('Demo');
  await navigate(page, 'Inicio'); await page.getByRole('link', { name: 'Planes de comidas' }).click();
  await expect(page.getByTestId('meal-plan-card')).toContainText('Plan de alimentación de prueba');
  await page.screenshot({ path: info.outputPath('client-demo-plans-320.png') }); await noVisibleIds(page);
  await navigate(page, 'Progreso'); await page.getByLabel('Fecha de la semana', { exact: true }).fill([...initial.sessions].sort((a, b) => a.date.localeCompare(b.date))[0].date);
  await expect(page.getByRole('region', { name: 'Semana seleccionada' }).getByTestId('session-summary')).toHaveCount(3);
  await page.getByRole('region', { name: 'Semana seleccionada' }).getByTestId('session-summary').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('client-demo-progress-320.png') }); await noVisibleIds(page);
  await navigate(page, 'Inicio'); await page.getByRole('link', { name: 'Diario alimentario' }).click();
  await page.getByLabel('Fecha del diario').fill(initial.days[0].date);
  await expect(page.getByTestId('actual-food')).toHaveCount(8);
  await page.getByTestId('actual-food').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('client-demo-diary-320.png') }); await noVisibleIds(page);
  await navigate(page, 'Ajustes'); await page.getByRole('button', { name: 'Eliminar datos demo', exact: true }).click();
  await page.getByRole('dialog', { name: 'Eliminar datos demo' }).getByRole('button', { name: 'Eliminar datos demo definitivamente' }).click();
  await expect(page.getByText('Datos demo eliminados. No volverán a aparecer.')).toBeVisible();
  await page.reload();
  const cleared = await records(page);
  expect(cleared.settings.demoSeed?.status).toBe('cleared'); expect(cleared.people[0].displayName).toBe('Alex real');
  expect([cleared.routines.length, cleared.meals.length, cleared.sessions.length, cleared.logs.length, cleared.days.length]).toEqual([0, 0, 0, 0, 0]);
  await navigate(page, 'Rutinas'); await expect(page.getByRole('button', { name: 'Crear primera rutina' })).toBeVisible();
});
