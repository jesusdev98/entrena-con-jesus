import { requireCalculation } from '../nutrition/calculations/calculation-error';

export type MetTable = 'adult' | 'older-adult';
export interface SourcedMet {
  id: string;
  table: MetTable;
  code: string;
  edition: '2024';
  met: number;
  referenceMlO2PerKgMin: 3.5 | 2.7;
  category: 'work' | 'walking' | 'running' | 'cycling' | 'resistance' | 'stretching';
  label: string;
  source: { url: string; sha256: string; retrievedOn: string; description: string; estimated: boolean; citation: string };
}
export interface MetCatalog { version: 1; edition: '2024'; language: 'es'; entries: SourcedMet[] }

function object(value: unknown): Record<string, unknown> {
  requireCalculation(value !== null && typeof value === 'object' && !Array.isArray(value), 'invalid-catalog', 'El catálogo MET no es válido.');
  return value as Record<string, unknown>;
}
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

/** Structural guard for bundled data. The build validator proves exact source extraction. */
export function parseMetCatalog(value: unknown): MetCatalog {
  const input = object(value);
  requireCalculation(input['version'] === 1 && input['edition'] === '2024' && input['language'] === 'es' &&
    Array.isArray(input['entries']) && input['entries'].length > 0, 'invalid-catalog', 'Versión del catálogo MET no compatible.');
  const ids = new Set<string>();
  for (const item of input['entries']) {
    const entry = object(item), source = object(entry['source']);
    const table = entry['table'], code = entry['code'];
    requireCalculation((table === 'adult' || table === 'older-adult') && typeof code === 'string' &&
      (table === 'adult' ? /^\d{5}$/ : /^\d{5}60$/).test(code) && entry['id'] === `${table}:${code}` &&
      entry['edition'] === '2024' && entry['referenceMlO2PerKgMin'] === (table === 'adult' ? 3.5 : 2.7),
    'invalid-catalog', 'Código, edición o referencia de oxígeno MET no válidos.');
    const id = entry['id'] as string;
    requireCalculation(!ids.has(id) && typeof entry['met'] === 'number' && Number.isFinite(entry['met']) && entry['met'] > 0 &&
      text(entry['label']) && ['work', 'walking', 'running', 'cycling', 'resistance', 'stretching'].includes(String(entry['category'])),
    'invalid-catalog', 'Actividad MET duplicada o incompleta.');
    requireCalculation(text(source['url']) && /^https:\/\/pacompendium\.com\/[a-z-]+\/$/.test(source['url']) &&
      text(source['sha256']) && /^[a-f0-9]{64}$/.test(source['sha256']) && text(source['retrievedOn']) &&
      /^\d{4}-\d{2}-\d{2}$/.test(source['retrievedOn']) && text(source['description']) && text(source['citation']) &&
      typeof source['estimated'] === 'boolean', 'invalid-catalog', 'Falta la procedencia de la actividad MET.');
    requireCalculation((table === 'older-adult') === (source['url'] === 'https://pacompendium.com/older-adult-compendium/'),
      'invalid-catalog', 'La fuente no corresponde a la tabla MET.');
    ids.add(id);
  }
  return structuredClone({ version: 1, edition: '2024', language: 'es', entries: input['entries'] }) as MetCatalog;
}

export function resolveMet(catalog: MetCatalog, id: string, age: number): SourcedMet {
  const activity = catalog.entries.find(entry => entry.id === id);
  requireCalculation(activity && age >= 19 && activity.table === (age < 60 ? 'adult' : 'older-adult'),
    'manual-required', 'La actividad o la tabla no cubre este perfil. Elige una actividad compatible o un gasto manual.');
  return structuredClone(activity);
}
