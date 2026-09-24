import { describe, expect, it } from 'vitest';
import { localDate, newId } from './identity';

describe('stable identity and local date boundaries', () => {
  it('creates distinct UUIDs regardless of display names', () => {
    const ids = Array.from({ length: 100 }, () => newId());
    expect(new Set(ids).size).toBe(100);
    expect(ids.every(id => /^[0-9a-f-]{36}$/.test(id))).toBe(true);
  });
  it('accepts leap days and calendar dates without timezone shifts', () => {
    expect(localDate('2024-02-29')).toBe('2024-02-29');
    expect(localDate('2026-12-31')).toBe('2026-12-31');
  });
  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '14/09/2026', '2026-09-14T00:00:00Z'])(
    'rejects impossible or non-calendar date %s', value => expect(() => localDate(value)).toThrow(),
  );
});
