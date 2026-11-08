import { describe, expect, it } from 'vitest';
import { parseRange, validateCustomDates, type DatePreset } from '../shared/reporting';
import { reportingCalendar } from '../server/sales-crm/reporting/dates';

const calendar = reportingCalendar('America/Los_Angeles');
const april = Date.parse('2026-04-14T17:00:00Z');

describe('Business calendar', () => {
  const presets: [Exclude<DatePreset, 'custom'>, string, string][] = [
    ['today', '2026-04-14', '2026-04-14'],
    ['yesterday', '2026-04-13', '2026-04-13'],
    ['wtd', '2026-04-13', '2026-04-14'],
    ['last-week', '2026-04-06', '2026-04-12'],
    ['mtd', '2026-04-01', '2026-04-14'],
    ['this-month', '2026-04-01', '2026-04-30'],
    ['last-month', '2026-03-01', '2026-03-31'],
    ['qtd', '2026-04-01', '2026-04-14'],
    ['this-quarter', '2026-04-01', '2026-06-30'],
    ['last-quarter', '2026-01-01', '2026-03-31'],
    ['ytd', '2026-01-01', '2026-04-14'],
    ['this-year', '2026-01-01', '2026-12-31'],
    ['last-year', '2025-01-01', '2025-12-31'],
  ];
  it.each(presets)('%s resolves to inclusive local calendar labels', (preset, start, end) => {
    expect(calendar.resolve({ preset }, april).selected).toMatchObject({ start, end });
  });

  it('uses the business date for UTC midnight, calendar rollovers, and aligned comparisons', () => {
    const jan = Date.parse('2026-01-01T05:00:00Z');
    expect(calendar.resolve({ preset: 'today' }, jan).selected.start).toBe('2025-12-31');
    expect(calendar.resolve({ preset: 'qtd' }, jan + 4 * 3600_000).selected.start).toBe('2026-01-01');
    expect(calendar.resolve({ preset: 'last-quarter' }, jan + 4 * 3600_000).selected)
      .toMatchObject({ start: '2025-10-01', end: '2025-12-31' });
    expect(calendar.resolve({ preset: 'mtd' }, Date.parse('2024-03-31T17:00:00Z')).previous)
      .toMatchObject({ start: '2024-02-01', end: '2024-02-29' });
    expect(calendar.resolve({ preset: 'last-year' }, Date.parse('2025-01-01T09:00:00Z')).selected)
      .toMatchObject({ start: '2024-01-01', end: '2024-12-31' });
  });

  it.each([
    ['2026-03-08', '2026-03-08T08:00:00Z', '2026-03-09T07:00:00Z'],
    ['2026-11-01', '2026-11-01T07:00:00Z', '2026-11-02T08:00:00Z'],
    ['2024-02-29', '2024-02-29T08:00:00Z', '2024-03-01T08:00:00Z'],
  ])('includes the whole day %s at its real local offset', (date, start, end) => {
    const range = calendar.resolve({ preset: 'custom', start: date, end: date }, april).selected;
    expect([range.from, range.until]).toEqual([Date.parse(start), Date.parse(end)]);
    expect(calendar.localDate(range.until - 1)).toBe(date);
    expect(calendar.localDate(range.until)).not.toBe(date);
  });

  it('includes both custom endpoints and compares the preceding equal number of calendar days', () => {
    const { selected, previous } = calendar.resolve({ preset: 'custom', start: '2026-03-07', end: '2026-03-09' }, april);
    expect(selected.until - selected.from).toBe(71 * 3600_000);
    expect(previous).toMatchObject({ start: '2026-03-04', end: '2026-03-06', until: selected.from });
  });

  it.each([['2025-02-29', '2025-03-01'], ['2026-01-03', '2026-01-02'], ['2024-01-01', '2025-01-01'],
    ['2026-4-01', '2026-04-02'], ['2026-04-01T00:00:00Z', '2026-04-02']])('rejects invalid range %s to %s', (start, end) => {
    expect(() => validateCustomDates(start, end)).toThrow(RangeError);
  });

  it('defaults to month to date and rejects fabricated preset names', () => {
    expect(parseRange(new URLSearchParams())).toEqual({ preset: 'mtd' });
    expect(() => parseRange(new URLSearchParams('preset=toString'))).toThrow(RangeError);
    expect(() => parseRange(new URLSearchParams('preset=mtd&start=2026-01-01'))).toThrow(RangeError);
    expect(() => reportingCalendar('Mars/Base')).toThrow(RangeError);
  });
});
