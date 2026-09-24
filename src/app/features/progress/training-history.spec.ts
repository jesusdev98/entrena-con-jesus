import { describe, expect, it } from 'vitest';
import { localDate, newId } from '../../core/domain/identity';
import { performed, sessionFixture } from '../training/training.fixtures';
import { skipSet } from '../training/training-domain';
import { completedCount, monday, shiftDate, today, weekSessions } from './training-history';

describe('local-calendar weekly actual history', () => {
  it.each([['2026-01-01', '2025-12-29'], ['2023-01-01', '2022-12-26'], ['2024-12-30', '2024-12-30'], ['2026-03-29', '2026-03-23']])('anchors %s at local Monday %s across years and DST', (date, expected) => {
    expect(monday(localDate(date))).toBe(expected);
  });
  it('uses local components rather than UTC to choose today and preserves leap days', () => {
    const now = new Date(2026, 0, 1, 0, 5); expect(today(now)).toBe('2026-01-01'); expect(shiftDate(localDate('2024-02-28'), 1)).toBe('2024-02-29');
    expect(shiftDate(localDate('2025-12-31'), 1)).toBe('2026-01-01');
  });
  it('filters by person UUID, saved state, exact exercise ID and inclusive Monday/exclusive next Monday', () => {
    const owner = newId(); const base = { ...performed(sessionFixture(owner)), status: 'completed' as const };
    const mondaySession = { ...base, id: newId(), date: localDate('2025-12-29') }; const sunday = { ...base, id: newId(), date: localDate('2026-01-04') };
    const next = { ...base, id: newId(), date: localDate('2026-01-05') }; const foreign = { ...base, personId: newId() };
    const input = [mondaySession, sunday, next, foreign, { ...base, status: 'draft' as const }]; const before = structuredClone(input);
    expect(weekSessions(input, owner, localDate('2026-01-01')).map(s => s.id)).toEqual([sunday.id, mondaySession.id]);
    expect(weekSessions(input, owner, localDate('2026-01-01'), 'cardio')).toHaveLength(2);
    expect(weekSessions(input, owner, localDate('2026-01-01'), 'same-name-but-other-id')).toEqual([]); expect(input).toEqual(before);
  });
  it('counts only actual completed sets and never skipped targets or draft values', () => {
    const session = performed(sessionFixture()); session.exercises[0].sets[0] = skipSet(session.exercises[0].sets[0]);
    expect(completedCount([session])).toBe(2); expect(completedCount([session], 'cardio')).toBe(1);
    expect(completedCount([sessionFixture()])).toBe(0);
  });
  it('intersects an exact date with week and exercise filters without changing saved records', () => {
    const owner = newId(); const base = { ...performed(sessionFixture(owner)), status: 'completed' as const };
    const first = { ...base, id: newId(), date: localDate('2026-01-01') };
    const second = { ...base, id: newId(), date: localDate('2026-01-02') };
    expect(weekSessions([first, second], owner, localDate('2026-01-01'), 'cardio', localDate('2026-01-02'))).toEqual([second]);
    expect(weekSessions([first, second], owner, localDate('2026-01-08'), '', localDate('2026-01-02'))).toEqual([]);
    expect(weekSessions([first, second], owner, localDate('2026-01-01'), '', '')).toEqual([second, first]);
  });
});
