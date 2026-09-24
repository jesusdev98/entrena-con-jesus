import type { CatalogExercise } from './exercise-catalog.model';

/** Synthetic metadata for UI boundary tests; never published as catalog data. */
export function exerciseFixture(slug = 'test-bench-press'): CatalogExercise {
  const attribution = { creator: 'Test creator', creatorUrl: 'https://example.org/creator', license: 'CC BY-SA 4.0' as const,
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' };
  const frame = (number: number, label: string) => ({ path: `exercises/${slug}-${number}.svg`, frame: number, label, sha256: 'a'.repeat(64),
    attribution: { ...attribution, sourceUrl: `https://example.org/${slug}/frame-${number}.svg`,
      collectionCredit: { author: 'Collection author', url: 'https://example.org/collection', license: 'CC BY-SA 4.0',
        licenseUrl: attribution.licenseUrl, scope: 'Collection foundation only; not a direct adaptation claim.' }, localChanges: 'SVG bytes unchanged.' } });
  return { id: `exercise-${slug}`, slug, name: 'Press de prueba', aliases: ['Extensión de prueba'], instruction: 'Apoya los pies en el suelo.',
    category: 'strength', loggingType: 'weight-reps', muscles: ['Pecho', 'Tríceps'], equipment: ['Barra', 'Banco'],
    source: { revision: 'aac599224bb9780305239607ef98540b7e0ce389', originalName: 'Test bench press', originalEquipment: 'Barbell', attribution },
    media: { mode: 'movement', semantics: 'position-pair', description: 'Dos posiciones de referencia, no toda la técnica.',
      frames: [frame(3, 'Barra cerca del pecho'), { ...frame(1, 'Brazos extendidos'), attribution: { ...frame(1, '').attribution,
        source: { name: 'Direct source author', url: 'https://example.org/direct', license: 'CC BY-SA 4.0', licenseUrl: attribution.licenseUrl, changes: 'Tracing of this frame only.' } } }],
      review: { sourcePosition: 1, evidence: 'Synthetic fixture', sheet: 'fixture.png', note: 'Test only.' } } };
}
export function exerciseCatalogFixture() {
  return { version: 1, language: 'es', source: { revision: 'aac599224bb9780305239607ef98540b7e0ce389', manifestSha256: 'b'.repeat(64), license: 'CC-BY-SA-4.0' },
    licenseNotice: 'licenses/exercises-notice.txt', entries: Array.from({ length: 250 }, (_, index) => exerciseFixture(`test-${index}`)) };
}
