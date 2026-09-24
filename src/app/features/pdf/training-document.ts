import type { LocalDate } from '../../core/domain/identity';
import type { Person } from '../people/person.model';
import type { SetPrescription } from '../routines/routine.model';
import type { ActualSet, Performance, TrainingSession } from '../training/training.model';
import { brandedDocument, blue, chunks, heading, label, number, pale, text } from './document-style';
import type { PdfDocument, PdfNode } from './routine-document';

function planned(set: SetPrescription | null): string {
  if (!set) return 'Sin objetivo planificado';
  switch (set.type) {
    case 'weight-reps': return `${set.reps.minimum}–${set.reps.maximum} rep · ${set.weightKg === null ? 'carga libre' : `${number(set.weightKg)} kg`} · RIR objetivo ${set.targetRir ?? 'sin definir'}`;
    case 'bodyweight-reps': return `${set.reps.minimum}–${set.reps.maximum} rep · peso corporal · RIR objetivo ${set.targetRir ?? 'sin definir'}`;
    case 'assisted-reps': return `${set.reps.minimum}–${set.reps.maximum} rep · ${set.assistanceKg === null ? 'asistencia libre' : `${number(set.assistanceKg)} kg asistencia`} · RIR objetivo ${set.targetRir ?? 'sin definir'}`;
    case 'duration': return `${number(set.seconds)} s`;
    case 'distance-duration': return `${number(set.meters)} m${set.seconds === null ? '' : ` · ${number(set.seconds)} s`}`;
  }
}
function actual(value: Performance): string {
  switch (value.type) {
    case 'weight-reps': return `${number(value.weightKg)} kg · ${number(value.reps)} rep · RIR ${value.rir ?? 'no registrado'}`;
    case 'bodyweight-reps': return `${number(value.reps)} rep · RIR ${value.rir ?? 'no registrado'}`;
    case 'assisted-reps': return `${number(value.assistanceKg)} kg asistencia · ${number(value.reps)} rep · RIR ${value.rir ?? 'no registrado'}`;
    case 'duration': return `${number(value.seconds)} s`;
    case 'distance-duration': return `${number(value.meters)} m · ${number(value.seconds)} s`;
  }
}
function performed(set: ActualSet): string { return set.status === 'completed' ? `${actual(set.actual)} · RPE ${number(set.rpe)}` : 'No realizada · sin valores reales'; }

export function trainingDocument(person: Person, monday: LocalDate, end: LocalDate, date: LocalDate | null, sessions: TrainingSession[]): PdfDocument {
  if (sessions.some(session => session.personId !== person.id || session.status !== 'completed' || session.date < monday || session.date > end || (date && session.date !== date)))
    throw new Error('Hay sesiones de otra persona o fuera del período.');
  if (!sessions.length) throw new Error('No hay sesiones finalizadas guardadas para este período.');
  const content: PdfNode[] = [text('ENTRENA CON JESÚS / PROGRESO DE ENTRENAMIENTO'), heading(`Sesiones reales · ${monday} a ${end}`),
    text(`Persona: ${person.displayName} · ${person.reference || 'Espacio local'}`),
    text(`Filtro: ${date ? `fecha ${date}` : 'semana completa'} · ${sessions.length} sesiones guardadas`),
    { text: 'REGISTRO REAL · Objetivos congelados frente a resultados guardados. Las series no realizadas no tienen rendimiento inferido.', bold: true, color: blue, fillColor: pale, margin: [0, 8, 0, 8] }];
  for (const session of sessions) {
    const sessionHeading = `${session.date} · ${label(session.labels.routine)} · ${label(session.labels.week)} / ${label(session.labels.day)}`;
    const duration = `Sesión versión ${session.version} · ${session.durationMinutes === null ? 'Duración total no registrada' : `Duración total manual: ${number(session.durationMinutes)} min`}`;
    if (!session.exercises.length) content.push({ stack: [heading(sessionHeading), text(duration), text('Sesión sin ejercicios guardados.')], unbreakable: true });
    for (const [ei, item] of session.exercises.entries()) {
       const rows: PdfNode[][] = ei === 0 ? [[{ text: `${sessionHeading}\n${duration}`, colSpan: 2, bold: true, color: blue, margin: [3, 6, 3, 6] }, {}]] : [];
       rows.push([{ text: `EJERCICIO · ${label(item.exercise.name)}`, bold: true }, { text: 'Objetivo congelado / resultado real', bold: true }]);
       if (!item.sets.length) rows.push([{ text: 'Sin series guardadas', colSpan: 2 }, {}]);
      item.sets.forEach((set, index) => rows.push([{ text: `Serie ${index + 1}`, margin: [3, 4, 3, 4] },
        { text: `Previsto: ${planned(set.prescribed)}\nReal: ${performed(set)}`, margin: [3, 4, 3, 4] }]));
       content.push({ table: { headerRows: ei === 0 ? 2 : 1, keepWithHeaderRows: 1, dontBreakRows: true, widths: ['36%', '*'], body: rows }, layout: 'lightHorizontalLines', margin: [0, 5, 0, 5] });
       if (item.notes) content.push(...chunks(item.notes, `Notas de ${label(item.exercise.name)} · ${session.date}`));
    }
    if (session.notes) content.push(...chunks(session.notes, `Notas de la sesión ${session.date} · ${label(session.labels.routine)}`));
  }
  return brandedDocument(person.displayName, `${monday} a ${end}`, 'ENTRENAMIENTO REAL', content);
}
