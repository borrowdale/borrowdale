// Reading a calendar series: a value per day over a range of days, each of which gets a cell.
import { anyValue } from './check-axis.js';
import { fail, fields, list, MAX_POINTS, nullable, oneOf, show, text, uniqueBy, type Check, type Fields } from './read.js';
import { DAY, ENGLISH_MONTHS, ENGLISH_WEEKDAYS, fieldsOf, formatTime, time, timeOf } from './time.js';
import type { CheckedCalendarChart, CheckedChartBase, SeriesOf } from './validate.js';

// For the names of the months and days of a calendar.
const MAX_CALENDAR_NAME = 20;

// A day: a time at the start of a day in UTC.
const calendarDay: Check<number> = (path, raw) => {
  const at = time(path, raw);
  if (at % DAY !== 0) fail(path, `has a time of day, but a calendar takes dates, got ${show(raw)}`);
  return at;
};

export function readCalendar(r: Fields, path: string, reserve: (count: number) => void) {
  const data = r.required('data', list(0, MAX_POINTS, (entryPath, raw): [number, number | null] => {
    const [date, value] = list(2, 2, (_path, item) => item)(entryPath, raw);
    return [calendarDay(`${entryPath}[0]`, date), nullable(anyValue)(`${entryPath}[1]`, value)];
  }, reserve));
  const given = { from: r.optional('from', calendarDay), to: r.optional('to', calendarDay) };
  if (data.length === 0 && (given.from === undefined || given.to === undefined)) {
    fail(`${path}.data`, `is empty, so ${path}.from and ${path}.to are needed`);
  }
  const earliest = data.reduce((low, [at]) => Math.min(low, at), Infinity);
  const latest = data.reduce((high, [at]) => Math.max(high, at), -Infinity);
  const from = given.from ?? timeOf(fieldsOf(earliest).year, 1, 1);
  const to = given.to ?? timeOf(fieldsOf(latest).year, 12, 31);
  if (!(to >= from)) fail(`${path}.to`, `must be on or after ${formatTime(from)}, got ${formatTime(to)}`);
  // Every day gets a cell, reserved before any is made: the days with a value as they are read, and
  // the rest here, as there is one value at most for each day of the range (checked below).
  const days = (to - from) / DAY + 1;
  if (days > MAX_POINTS) fail(`${path}.to`, `makes ${days} days from ${formatTime(from)}, more than ${MAX_POINTS}`);
  data.forEach(([at], i) => {
    if (at < from || at > to) {
      fail(`${path}.data[${i}][0]`, `is ${formatTime(at)}, outside ${formatTime(from)} to ${formatTime(to)}`);
    }
  });
  uniqueBy(data, ([at]) => String(at), (i, first) =>
    fail(`${path}.data[${i}]`, `is a second value for ${formatTime(data[i]![0])}, after ${path}.data[${first}]`));
  reserve(days - data.length);
  const format = r.optional('format', fields);
  format?.allow(['months', 'weekdays']);
  return {
    data,
    from,
    to,
    weekStart: r.optional('weekStart', oneOf(['monday', 'sunday'] as const)) ?? 'monday',
    orientation: r.optional('orientation', oneOf(['horizontal', 'vertical'] as const)) ?? 'horizontal',
    months: format?.optional('months', list(12, 12, text(MAX_CALENDAR_NAME))) ?? ENGLISH_MONTHS,
    weekdays: format?.optional('weekdays', list(7, 7, text(MAX_CALENDAR_NAME))) ?? ENGLISH_WEEKDAYS,
  };
}

export function checkCalendarChart(r: Fields, base: CheckedChartBase, series: SeriesOf<'calendar'>[]): CheckedCalendarChart {
  if (r.has('axes')) {
    fail('axes', 'must be left out: a calendar has no axes');
  }
  if (series.length > 1) {
    fail(series[1]!.path, 'is a second calendar series, but a chart has one calendar');
  }
  return { ...base, system: 'calendar', series };
}
