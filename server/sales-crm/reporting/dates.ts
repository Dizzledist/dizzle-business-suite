import { calendarDay, calendarDayMs, validateCustomDates, type RangeSelection } from '../../../shared/reporting';

export const defaultReportingTimeZone = 'America/Los_Angeles';
const day = calendarDayMs;

function formatDate(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function reportingCalendar(timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    calendar: 'gregory', numberingSystem: 'latn', timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  function localDate(instant: number) {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]));
    return parts.year.padStart(4, '0') + '-' + parts.month + '-' + parts.day;
  }

  // Find the first instant on the local calendar day. This also handles a clock
  // change at midnight or a skipped day without assuming a fixed UTC offset.
  function startOfDay(date: number) {
    const label = formatDate(date);
    let low = date - 2 * day;
    let high = date + 2 * day;
    while (high - low > 1) {
      const middle = Math.floor((high + low) / 2);
      if (localDate(middle) < label) low = middle;
      else high = middle;
    }
    return high;
  }

  function interval(start: number, end: number) {
    return { start: formatDate(start), end: formatDate(end - day), from: startOfDay(start), until: startOfDay(end) };
  }

  function resolve(selection: RangeSelection, now: number) {
    const today = calendarDay(localDate(now));
    const tomorrow = today + day;
    const date = new Date(today);
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth();
    const q = Math.floor(m / 3) * 3;
    const monday = today - ((date.getUTCDay() + 6) % 7) * day;
    const periods = {
      week: [monday - 7 * day, monday, monday + 7 * day],
      month: [Date.UTC(y, m - 1, 1), Date.UTC(y, m, 1), Date.UTC(y, m + 1, 1)],
      quarter: [Date.UTC(y, q - 3, 1), Date.UTC(y, q, 1), Date.UTC(y, q + 3, 1)],
      year: [Date.UTC(y - 1, 0, 1), Date.UTC(y, 0, 1), Date.UTC(y + 1, 0, 1)],
    };
    function comparable(start: number, end: number) {
      return { selected: interval(start, end), previous: interval(start - (end - start), start), timeZone };
    }
    function period(key: keyof typeof periods, mode: 'full' | 'prior' | 'to-date') {
      const [prior, start, next] = periods[key];
      if (mode === 'prior') {
        const earlier = key === 'week' ? prior - 7 * day
          : key === 'month' ? Date.UTC(y, m - 2, 1)
          : key === 'quarter' ? Date.UTC(y, q - 6, 1) : Date.UTC(y - 2, 0, 1);
        return { selected: interval(prior, start), previous: interval(earlier, prior), timeZone };
      }
      const end = mode === 'full' ? next : tomorrow;
      const comparisonEnd = mode === 'full' ? start : Math.min(start, prior + end - start);
      return { selected: interval(start, end), previous: interval(prior, comparisonEnd), timeZone };
    }

    switch (selection.preset) {
      case 'today': return comparable(today, tomorrow);
      case 'yesterday': return comparable(today - day, today);
      case 'wtd': return period('week', 'to-date');
      case 'last-week': return period('week', 'prior');
      case 'mtd': return period('month', 'to-date');
      case 'this-month': return period('month', 'full');
      case 'last-month': return period('month', 'prior');
      case 'qtd': return period('quarter', 'to-date');
      case 'this-quarter': return period('quarter', 'full');
      case 'last-quarter': return period('quarter', 'prior');
      case 'ytd': return period('year', 'to-date');
      case 'this-year': return period('year', 'full');
      case 'last-year': return period('year', 'prior');
      case 'custom':
        validateCustomDates(selection.start, selection.end);
        return comparable(calendarDay(selection.start), calendarDay(selection.end) + day);
    }
  }
  return { localDate, resolve, timeZone, startOfDay: (date: string) => startOfDay(calendarDay(date)) };
}

export type ReportingCalendar = ReturnType<typeof reportingCalendar>;
