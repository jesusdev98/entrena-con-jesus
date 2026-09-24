import type { Person } from '../people/person.model';
import type { ExerciseFrame, ReviewedExerciseMedia } from '../exercises/exercise.model';
import { semanticLabels } from '../exercises/exercise-catalog.model';
import type { RoutineRevision, SetPrescription } from '../routines/routine.model';
import { brandedDocument } from './document-style';

export type PdfNode = Record<string, unknown>;
export interface PdfDocument { [key: string]: unknown; content: PdfNode[] }
export interface RoutineArtwork { path: string; svg: string }

/** Never turn a stored/imported URL, traversal path or excluded frame into a fetch. */
export function selectedArtwork(revision: RoutineRevision): ExerciseFrame[] {
  const frames = new Map<string, ExerciseFrame>();
  for (const week of revision.content.weeks) for (const day of week.days) for (const item of day.exercises) {
    const media = item.exercise.media;
    if (!media || !('frames' in media)) continue;
    for (const frame of media.frames) {
      const slug = /^exercise-([a-z0-9-]+)$/.exec(item.exercise.exerciseId)?.[1];
      if (!slug || frame.path !== `exercises/${slug}-${frame.frame}.svg` || !/^[123]$/.test(String(frame.frame)) || !/^[a-f0-9]{64}$/.test(frame.sha256)) {
        throw new Error('La rutina contiene una ruta de imagen no permitida.');
      }
      frames.set(frame.path, frame);
    }
  }
  return [...frames.values()];
}

const blue = '#2563EB';
const graphite = '#111827';
const pale = '#EFF6FF';
const small = { fontSize: 9, color: '#334155' };
function heading(text: string, size = 13): PdfNode { return { text, bold: true, fontSize: size, color: graphite, margin: [0, 9, 0, 5] }; }
function paragraph(text: string): PdfNode { return { text, ...small, margin: [0, 2, 0, 5] }; }
function continuation(text: string, context: string): PdfNode[] {
  const words = text.split(/\s+/);
  const chunks: string[] = []; let current = '';
  for (const word of words) {
    if (current.length + word.length > 420 && current) { chunks.push(current); current = ''; }
    current += `${current ? ' ' : ''}${word}`;
  }
  if (current) chunks.push(current);
  return chunks.map((chunk, index) => paragraph(index ? `${context} (continuación) · ${chunk}` : chunk));
}
function setLabel(set: SetPrescription, index: number): string {
  const rest = set.restSeconds === null ? '' : ` · Descanso ${set.restSeconds} s`;
  let target: string;
  switch (set.type) {
    case 'weight-reps': target = `${set.reps.minimum}–${set.reps.maximum} rep · ${set.weightKg === null ? 'Carga libre' : `${set.weightKg} kg`} · RIR objetivo ${set.targetRir ?? 'sin definir'}`; break;
    case 'bodyweight-reps': target = `${set.reps.minimum}–${set.reps.maximum} rep · Peso corporal · RIR objetivo ${set.targetRir ?? 'sin definir'}`; break;
    case 'assisted-reps': target = `${set.reps.minimum}–${set.reps.maximum} rep · ${set.assistanceKg === null ? 'Asistencia libre' : `${set.assistanceKg} kg de asistencia`} · RIR objetivo ${set.targetRir ?? 'sin definir'}`; break;
    case 'duration': target = `${set.seconds} s`; break;
    case 'distance-duration': target = `${set.meters} m${set.seconds === null ? '' : ` · ${set.seconds} s`}`; break;
  }
  return `Serie ${index + 1} · ${target}${rest}`;
}

/** The same document contract can later serve meal and progress builders. */
export function routineDocument(person: Person, revision: RoutineRevision, artwork: RoutineArtwork[], rasterFallback = false): PdfDocument {
  if (revision.personId !== person.id) throw new Error('La rutina pertenece a otra persona.');
  const byPath = new Map(artwork.map(asset => [asset.path, asset.svg]));
  const used = selectedArtwork(revision);
  for (const frame of used) if (!byPath.has(frame.path)) throw new Error('Falta una ilustración de la rutina.');
  const content: PdfNode[] = [
    { text: 'ENTRENA CON JESÚS  /  PLANIFICACIÓN', fontSize: 9, bold: true, color: blue, characterSpacing: 1.2, margin: [0, 0, 0, 5] },
    heading(revision.name, 21),
    paragraph(`Persona: ${person.displayName} · ${person.reference || 'Espacio local'}`),
    paragraph(`Revisión guardada: ${revision.updatedAt.slice(0, 10)} · ID ${revision.id}`),
    { text: 'PLAN PREVISTO · Los objetivos no son resultados realizados.', bold: true, fontSize: 9, color: blue, fillColor: pale, margin: [0, 8, 0, 9] },
  ];
  if (revision.content.notes) content.push(heading('Notas de la rutina'), ...continuation(revision.content.notes, 'Notas de la rutina'));
  for (const [wi, week] of revision.content.weeks.entries()) {
    for (const [di, day] of week.days.entries()) {
      const context = `Semana ${wi + 1}: ${week.name}  /  Día ${di + 1}: ${day.name}`;
      for (const [ei, item] of day.exercises.entries()) {
        const exercise = item.exercise;
        // Keep the pose pair together; long notes and individual series can flow to further pages.
        const block: PdfNode[] = [
          { text: `SEMANA ${wi + 1}  ·  ${week.name}`, fontSize: 12, bold: true, color: blue, margin: [0, 5, 0, 4] },
          { text: `DÍA ${di + 1}  ·  ${day.name}`, fontSize: 10, bold: true, color: graphite, fillColor: pale, margin: [0, 0, 0, 5] },
          { text: `${ei + 1}. ${exercise.name}`, bold: true, fontSize: 12, color: graphite, margin: [0, 0, 0, 3] },
        ];
        const media = exercise.media;
        if (media && 'frames' in media) {
          block.push(paragraph(`${semanticLabels[media.semantics]} · ${media.description}`));
          block.push(posePair(media, byPath));
        } else {
          block.push({ text: media ? 'Ilustraciones históricas no disponibles para este formato.' : 'Sin imágenes: ejercicio personalizado. No hay ilustraciones asociadas.', ...small, italics: true, fillColor: pale, margin: [0, 5, 0, 7] });
        }
        if (exercise.equipment?.length) block.push(paragraph(`Equipo: ${exercise.equipment.join(', ')}`));
        if (item.sets.length) block.push(paragraph(setLabel(item.sets[0], 0)));
        // pdfmake's unbreakable stack moves the entire pose pair, never clips a row.
        content.push({ stack: block, unbreakable: true, margin: [0, 6, 0, 2], context });
        if (exercise.instruction) content.push(...continuation(`Indicaciones · ${context}: ${exercise.instruction}`, context));
        if (exercise.notes) content.push(...continuation(`Notas del ejercicio · ${context}: ${exercise.notes}`, context));
        if (item.notes) content.push(...continuation(`Notas del plan · ${context}: ${item.notes}`, context));
        item.sets.forEach((set, index) => {
          if (index) content.push(...continuation(`${context} · ${setLabel(set, index)}`, context));
          if (set.notes) content.push(...continuation(`Notas de la serie ${index + 1} · ${context}: ${set.notes}`, context));
        });
        content.push({ canvas: [{ type: 'line', x1: 0, y1: 4, x2: 505, y2: 4, lineColor: '#CBD5E1', lineWidth: 0.6 }], margin: [0, 5, 0, 3] });
      }
    }
  }
  if (used.length) {
    for (const [index, frame] of used.entries()) {
      const a = frame.attribution;
      const group: PdfNode[] = index ? [] : [
        { text: 'CRÉDITOS DE LAS ILUSTRACIONES UTILIZADAS', bold: true, fontSize: 13, color: blue, margin: [0, 15, 0, 6] },
        paragraph('Cada fotograma conserva su fuente, licencia y cambios declarados. Crédito de colección ≠ adaptación directa.'),
        ...(rasterFallback ? [paragraph('Adaptación para este PDF: SVG originales rasterizados localmente sobre fondo grafito a 1024 × 1024 píxeles; geometría y orden conservados. Ilustraciones adaptadas bajo CC BY-SA 4.0.')] : []),
      ];
      group.push({ text: `${frame.path} · Fotograma ${frame.frame}`, bold: true, fontSize: 9, margin: [0, 7, 0, 2] });
      group.push(paragraph(`Autor: ${a.creator} (${a.creatorUrl}). Archivo original: ${a.sourceUrl}. Licencia: ${a.license} (${a.licenseUrl}).`));
      if (a.source) group.push(paragraph(`Adaptación directa de ${a.source.name} (${a.source.url}); ${a.source.license} (${a.source.licenseUrl}). Cambios declarados por la fuente: ${a.source.changes}`));
      group.push(paragraph(`Base de la colección: ${a.collectionCredit.author} (${a.collectionCredit.url}); ${a.collectionCredit.license} (${a.collectionCredit.licenseUrl}). Alcance: ${a.collectionCredit.scope}. Cambios locales: ${a.localChanges}`));
      content.push({ stack: group, unbreakable: true });
    }
  }
  return brandedDocument(person.displayName, revision.name, 'PLAN PREVISTO', content);
}

function posePair(media: ReviewedExerciseMedia, byPath: Map<string, string>): PdfNode {
  return { columns: media.frames.map((frame, index) => ({ width: 239, stack: [
    { table: { widths: [225], body: [[{ svg: byPath.get(frame.path), width: 210, height: 210, alignment: 'center', fillColor: graphite, margin: [7, 7, 7, 7] }]] }, layout: 'noBorders' },
    { text: `${index + 1}. ${frame.label}`, fontSize: 9, bold: true, color: graphite, margin: [0, 5, 0, 0] },
  ] })), columnGap: 14, margin: [0, 4, 0, 7] };
}
