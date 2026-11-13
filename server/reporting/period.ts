import { z } from 'zod';
import { reportingZone, type ReportingPeriod } from '../../shared/retail-reporting';
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(value + 'T00:00:00Z'); return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value; });
export function nextDay(value: string) { return new Date(Date.parse(value + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10); }
export function pacificMidnight(value: string) {
  const target = Date.parse(value + 'T00:00:00Z'); let result = target;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: reportingZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 4; i++) { const parts = formatter.formatToParts(new Date(result)); const n = (type: string) => Number(parts.find(p => p.type === type)!.value); result += target - Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')); }
  return new Date(result).toISOString();
}
export function reportingPeriod(from: string, to: string): ReportingPeriod {
  day.parse(from); day.parse(to); const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (days < 0 || days > 92) throw new Error('Choose a reporting range of 1–93 calendar days.');
  return { from, to, startUtc: pacificMidnight(from), endExclusiveUtc: pacificMidnight(nextDay(to)), timeZone: reportingZone };
}
