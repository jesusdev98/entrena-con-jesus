import { describe, expect, it } from 'vitest';
import { catalogChoice, filterExercises, parseExerciseCatalog } from './exercise-catalog.model';
import { exerciseCatalogFixture, exerciseFixture } from './exercise.fixtures';

describe('exercise runtime catalog boundary', () => {
  it('preserves reviewed order, labels, hashes and unequal per-frame provenance', () => {
    const source = exerciseCatalogFixture();
    const parsed = parseExerciseCatalog(source);
    expect(parsed).toHaveLength(250);
    expect(parsed[0]).toEqual(source.entries[0]);
    expect(parsed[0].media.frames.map(frame => frame.frame)).toEqual([3, 1]);
    expect(parsed[0].media.frames[0].attribution.source).toBeUndefined();
    expect(parsed[0].media.frames[1].attribution.source?.changes).toBe('Tracing of this frame only.');
  });
  it('rejects incomplete/versioned catalogs and duplicate identities', () => {
    const source = exerciseCatalogFixture();
    expect(() => parseExerciseCatalog({ ...source, version: 2 })).toThrow();
    expect(() => parseExerciseCatalog({ ...source, entries: source.entries.slice(1) })).toThrow();
    source.entries[1] = source.entries[0];
    expect(() => parseExerciseCatalog(source)).toThrow();
  });
  it('rejects wrong identities, mixed revisions and unrelated frame paths', () => {
    for (const mutate of [
      (entry: ReturnType<typeof exerciseFixture>) => { entry.id = 'exercise-unrelated'; },
      (entry: ReturnType<typeof exerciseFixture>) => { entry.source.revision = 'future'; },
      (entry: ReturnType<typeof exerciseFixture>) => { entry.media.frames[0].path = 'exercises/unrelated-3.svg'; },
    ]) {
      const source = exerciseCatalogFixture(); mutate(source.entries[0]);
      expect(() => parseExerciseCatalog(source)).toThrow();
    }
  });
  it('rejects unsafe media/credit URLs and missing attribution rather than rendering them', () => {
    for (const path of ['https://example.org/remote.svg', '../exercises/test-0-3.svg', 'exercises/test-0-3.svg?remote=1']) {
      const source = exerciseCatalogFixture(); source.entries[0].media.frames[0].path = path;
      expect(() => parseExerciseCatalog(source)).toThrow();
    }
    const source = exerciseCatalogFixture(); source.entries[0].media.frames[0].attribution.creatorUrl = 'javascript:alert(1)';
    expect(() => parseExerciseCatalog(source)).toThrow();
    const missing = exerciseCatalogFixture(); missing.entries[0].media.frames[1].attribution.localChanges = '';
    expect(() => parseExerciseCatalog(missing)).toThrow();
  });
  it('retains static, setup and partial labels and rejects contradictory modes or duplicate frames', () => {
    for (const [mode, semantics] of [['hold', 'static-references'], ['hold', 'setup-to-hold'], ['cycle', 'partial-sequence']] as const) {
      const source = exerciseCatalogFixture(); const media = source.entries[0].media;
      media.mode = mode; media.semantics = semantics; media.frames[0].label = 'Referencia A'; media.frames[1].label = 'Referencia B';
      expect(parseExerciseCatalog(source)[0].media).toEqual(media);
      media.mode = 'movement'; expect(() => parseExerciseCatalog(source)).toThrow();
    }
    const source = exerciseCatalogFixture(); source.entries[0].media.frames[1] = source.entries[0].media.frames[0];
    expect(() => parseExerciseCatalog(source)).toThrow();
  });
});

describe('exercise browsing filters', () => {
  const empty = { query: '', category: '', muscle: '', equipment: '' };
  it('searches names and aliases accent/case insensitively, requiring every term', () => {
    const choice = catalogChoice(exerciseFixture());
    expect(filterExercises([choice], { ...empty, query: '  EXTENSION   prueba ' })).toEqual([choice]);
    expect(filterExercises([choice], { ...empty, query: 'press inexistente' })).toEqual([]);
  });
  it('combines category, muscle and array equipment without inferring equipment from logging type', () => {
    const entry = exerciseFixture(); entry.loggingType = 'bodyweight-reps';
    const choice = catalogChoice(entry);
    expect(filterExercises([choice], { query: 'press', category: 'strength', muscle: 'Tríceps', equipment: 'Banco' })).toEqual([choice]);
    for (const filters of [{ category: 'cardio' }, { muscle: 'Cuádriceps' }, { equipment: 'Sin equipo' }]) {
      expect(filterExercises([choice], { ...empty, ...filters })).toEqual([]);
    }
    expect(filterExercises([choice], empty)).toEqual([choice]);
  });
});
