const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const internalField = /(?:^|\.)(?:id|[a-zA-Z]+Id)(?:$|\[)/;

/** Review presentation only: never transform a validated file, comparison or database key. */
export function reviewPath(path: string): string {
  const labels: Record<string, string> = { Plan: 'Plan', date: 'Fecha', name: 'Nombre', notes: 'Notas', content: 'Contenido',
    mealLabel: 'Comida', food: 'Alimento', grams: 'Gramos', status: 'Estado', actual: 'Realizado', prescribed: 'Objetivo',
    version: 'Versión', durationMinutes: 'Duración en minutos', kcalPer100g: 'Energía por 100 g',
    proteinPer100g: 'Proteínas por 100 g', carbohydratePer100g: 'Carbohidratos por 100 g', fatPer100g: 'Grasas por 100 g' };
  const collections: Record<string, string> = { weeks: 'Semana', days: 'Día', exercises: 'Ejercicio', sets: 'Serie', meals: 'Comida', foods: 'Alimento' };
  return path.split('.').map(part => {
    const group = /^(weeks|days|exercises|sets|meals|foods)\[(\d+)\]$/.exec(part);
    if (group) return `${collections[group[1]]} ${group[2]}`;
    if (/^(?:id|[a-zA-Z]+Id)$/.test(part)) return 'Referencia interna';
    return labels[part] ?? part.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  }).join(' · ');
}
export function reviewValue(path: string, value: string): string {
  if (internalField.test(path)) return value === '—' || value === 'null' ? 'Sin referencia' : 'Referencia interna (oculta)';
  return value.replace(uuid, 'referencia interna')
    .replace(/"(?:id|[a-zA-Z]+Id)"\s*:\s*(?:"[^"]*"|\d+|null)/g, '"referencia interna": "oculta"');
}
export function reviewLabel(label: string): string { return label.replace(uuid, 'referencia interna'); }
export function filePersonLabel(name: string): string {
  const readable = reviewLabel(name).trim();
  return readable && readable !== 'referencia interna' ? `Nombre declarado: ${readable} · origen sin verificar` : 'Origen sin verificar';
}
