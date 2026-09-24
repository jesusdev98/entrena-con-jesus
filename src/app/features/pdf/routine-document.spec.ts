import { describe, expect, it } from 'vitest';
import { emptyProfile, type Person } from '../people/person.model';
import { newId } from '../../core/domain/identity';
import { exerciseFixture } from '../exercises/exercise.fixtures';
import { catalogChoice, exerciseSnapshot } from '../exercises/exercise-catalog.model';
import type { RoutineRevision } from '../routines/routine.model';
import { routineDocument, selectedArtwork } from './routine-document';
import { routinePdfFilename } from './pdf-export';

function setup(): { person: Person; revision: RoutineRevision } {
  const id = newId(); const now = '2026-09-23T12:00:00.000Z';
  const person: Person = { id, displayName: 'Jesús', reference: '', kind: 'personal', archived: false, profile: emptyProfile(), createdAt: now, updatedAt: now };
  const exercise = exerciseSnapshot(catalogChoice(exerciseFixture()));
  const revision: RoutineRevision = { id: newId(), planId: newId(), parentRevisionId: null, personId: id, name: 'Fuerza y técnica', createdAt: now, updatedAt: now,
    content: { notes: 'Plan, no resultados.', weeks: [{ id: newId(), name: 'Semana azul', days: [{ id: newId(), name: 'Día uno', exercises: [{ id: newId(), exercise, notes: 'Sin prisa', sets: [
      { id: newId(), type: 'weight-reps', reps: { minimum: 8, maximum: 12 }, weightKg: 20.5, targetRir: 2, restSeconds: 90, notes: '' },
    ] }] }] }] } };
  return { person, revision };
}
describe('saved routine PDF document', () => {
  it('binds person, planned values, margins, watermark, every used frame and distinct source credits', () => {
    const { person, revision } = setup(); const frames = selectedArtwork(revision);
    const document = routineDocument(person, revision, frames.map(frame => ({ path: frame.path, svg: '<svg width="512" height="512" />' })));
    const text = JSON.stringify(document.content);
    expect(document['pageMargins']).toEqual([43, 51, 43, 48]); expect(document['pageSize']).toBe('A4');
    expect(document['background']).toBeTypeOf('function'); expect(document['footer']).toBeTypeOf('function');
    expect(text).toContain('Jesús'); expect(text).toContain('Semana azul'); expect(text).toContain('Día uno');
    expect(text).toContain('8–12 rep'); expect(text).toContain('20.5 kg'); expect(text).toContain('RIR objetivo 2');
    expect(text).toContain('PLAN PREVISTO'); expect(text).toContain('Direct source author'); expect(text).toContain('Collection foundation only');
    expect(text).toContain('Tracing of this frame only.'); expect(text).toContain('SVG bytes unchanged.');
    expect(frames.map(frame => frame.frame)).toEqual([3, 1]);
    expect(text).toContain('"unbreakable":true'); expect(text).toContain('"fillColor":"#111827"');
    expect(document.content.some(node => node['pageBreak'] === 'before')).toBe(false);
    const later = structuredClone(revision); later.content.weeks[0].days[0].exercises[0].exercise.name = 'New catalog name';
    expect(JSON.stringify(routineDocument(person, revision, frames.map(frame => ({ path: frame.path, svg: '<svg />' }))).content)).toContain('Press de prueba');
    expect(routinePdfFilename({ ...revision, name: '../../á/<script>' })).toMatch(/^entrena-con-jesus-a-script-[a-f0-9-]+\.pdf$/);
  });
  it('rejects foreign owner and malicious or excluded media paths before fetching', () => {
    const { person, revision } = setup();
    expect(() => routineDocument({ ...person, id: newId() }, revision, [])).toThrow('otra persona');
    const media = revision.content.weeks[0].days[0].exercises[0].exercise.media;
    if (!media || !('frames' in media)) throw new Error('Invalid fixture');
    media.frames[0].path = 'https://example.org/stolen.svg';
    expect(() => selectedArtwork(revision)).toThrow('no permitida');
  });
  it('flows many weeks and long notes as separate paragraphs, with truthful custom placeholder', () => {
    const { person, revision } = setup();
    const item = revision.content.weeks[0].days[0].exercises[0]; item.exercise.media = null; item.exercise.instruction = '<script>no markup</script>';
    item.notes = 'Notas largas '.repeat(150);
    revision.content.weeks = Array.from({ length: 12 }, (_, index) => ({ ...structuredClone(revision.content.weeks[0]), name: `Semana ${index + 1}` }));
    const document = routineDocument(person, revision, []); const text = JSON.stringify(document.content);
    expect(selectedArtwork(revision)).toHaveLength(0); expect(text).toContain('Sin imágenes: ejercicio personalizado');
    expect(text).toContain('<script>no markup</script>'); expect(text).toContain('Semana 12');
    expect(text).toContain('(continuación)');
    expect(document.content.filter(node => node['unbreakable'] === true)).toHaveLength(12);
    expect(document.content.some(node => node['pageBreak'] === 'before')).toBe(false);
  });
});
