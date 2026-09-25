import { expect, test } from '@playwright/test';

for (const mode of ['Entrenador', 'Cliente'] as const) {
  test(`fresh ${mode} sees real progress charts, accessible tables and no phantom series after demo cleanup`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/');
    await page.getByRole('radio', { name: new RegExp(mode) }).check();
    await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Alex real');
    await page.getByRole('button', { name: 'Crear mi espacio' }).click();
    await expect(page.getByTestId('active-person-name')).toHaveText(mode === 'Entrenador' ? 'Usuario de prueba' : 'Alex real');
    await page.getByRole('navigation').getByRole('link', { name: 'Progreso' }).click();
    const charts = page.getByRole('region', { name: 'Gráficos de progreso real' });
    await expect(charts.getByRole('heading', { name: 'Entrenamientos finalizados por semana' })).toBeVisible();
    await expect(charts.getByRole('heading', { name: 'Volumen externo levantado por semana' })).toBeVisible();
    await expect(charts.getByRole('heading', { name: 'Carga máxima real por semana del ejercicio elegido' })).toBeVisible();
    await expect(charts.getByRole('heading', { name: 'Energía consumida y objetivo diario guardado' })).toBeVisible();
    for (const title of ['Proteínas consumidas', 'Carbohidratos consumidos', 'Grasas consumidas']) {
      await expect(charts.getByRole('heading', { name: `${title} y objetivo diario guardado` })).toBeVisible();
    }
    await expect(charts.getByRole('heading', { name: 'Pasos reales por día' })).toBeVisible();
    await expect(charts.getByRole('heading', { name: 'Gasto diario guardado' })).toBeVisible();
    await charts.getByText('Ver datos de Entrenamientos finalizados por semana').click();
    await expect(charts.getByRole('table', { name: 'Entrenamientos finalizados por semana (sesiones)' }).getByRole('row')).toHaveCount(7);
    await expect(charts.getByRole('table', { name: 'Entrenamientos finalizados por semana (sesiones)' })).toContainText('3');
    await charts.getByLabel('Ejercicio para evolución de carga real').selectOption('exercise-bench-press');
    await charts.getByText('Ver datos de Carga máxima real por semana del ejercicio elegido').click();
    await expect(charts.getByRole('table', { name: 'Carga máxima real por semana del ejercicio elegido (kg externos)' })).toContainText('50');
    await charts.getByText('Ver datos de Gasto diario guardado').click();
    await expect(charts.getByRole('table', { name: /Gasto diario guardado/ })).toContainText(mode === 'Cliente' ? 'Manual' : 'Estimado');
    await charts.getByText('Ver datos de Energía consumida y objetivo diario guardado').click();
    await expect(charts.getByRole('table', { name: /Energía consumida/ })).toContainText('Sin registro');
    await expect(charts.getByRole('table', { name: /Energía consumida/ })).toContainText('Sin objetivo guardado');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
    await charts.getByRole('heading', { name: 'Energía consumida y objetivo diario guardado' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`${mode}-progress-charts-320.png`) });
    await page.getByRole('link', { name: 'Ajustes', exact: true }).first().click();
    await page.getByRole('button', { name: 'Eliminar datos demo', exact: true }).click();
    await page.getByRole('dialog', { name: 'Eliminar datos demo' }).getByRole('button', { name: 'Eliminar datos demo definitivamente' }).click();
    await expect(page.getByText('Datos demo eliminados. No volverán a aparecer.')).toBeVisible();
    await page.reload();
    if (mode === 'Entrenador') await page.getByRole('button', { name: 'Cliente', exact: true }).click();
    await page.getByRole('navigation').getByRole('link', { name: 'Progreso' }).click();
    await expect(page.getByRole('region', { name: 'Gráficos de progreso real' }).getByRole('heading', { name: 'Energía consumida y objetivo diario guardado' })).toHaveCount(0);
    await expect(page.getByText('No hay consumo ni objetivos diarios guardados para estos días.')).toBeVisible();
    await expect(page.getByText('No hay entrenamientos finalizados en las últimas seis semanas completas.')).toBeVisible();
    await expect(page.getByText('No hay pasos reales guardados para estos días.')).toBeVisible();
  });
}
