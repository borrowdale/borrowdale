import { describe, expect, it } from 'vitest';
import '../../core/test/support/forbid-unportable-calls.js';
import { ENGLISH_MONTHS, fieldsOf, formatTick, formatTime, interval, MAX_TIME, MIN_TIME, time, timeOf } from '../src/time.js';

const reading = (value: unknown) => () => time('axes.x.min', value);

describe('time', () => {
  it.each<[string, unknown, number]>([
    ['a date, at midnight UTC', '2026-11-01', Date.UTC(2026, 10, 1)],
    ['a year and month', '2026-11', Date.UTC(2026, 10, 1)],
    ['a year', '2026', Date.UTC(2026, 0, 1)],
    ['a date and time in UTC', '2026-11-01T09:30Z', Date.UTC(2026, 10, 1, 9, 30)],
    ['seconds', '2026-11-01T09:30:15Z', Date.UTC(2026, 10, 1, 9, 30, 15)],
    ['milliseconds', '2026-11-01T09:30:15.250Z', Date.UTC(2026, 10, 1, 9, 30, 15, 250)],
    ['one decimal of a second', '2026-11-01T09:30:15.5Z', Date.UTC(2026, 10, 1, 9, 30, 15, 500)],
    ['the milliseconds toISOString writes', '2026-11-01T00:00:00.000Z', Date.UTC(2026, 10, 1)],
    ['an offset ahead of UTC', '2026-11-01T09:30+01:00', Date.UTC(2026, 10, 1, 8, 30)],
    ['an offset behind UTC', '2026-11-01T09:30-05:30', Date.UTC(2026, 10, 1, 15, 0)],
    ['29 February in a leap year', '2024-02-29', Date.UTC(2024, 1, 29)],
    ['29 February in a century divisible by 400', '2000-02-29', Date.UTC(2000, 1, 29)],
    ['the first day accepted', '0000-01-01', MIN_TIME],
    ['the last moment accepted', '9999-12-31T23:59:59.999Z', MAX_TIME],
    ['milliseconds since the epoch', 1_793_491_200_000, 1_793_491_200_000],
    ['a time before the epoch', -1, -1],
  ])('reads %s', (_case, value, expected) => {
    expect(time('axes.x.min', value)).toBe(expected);
  });

  it.each<[string, unknown, string]>([
    ['30 February', '2027-02-30', 'Invalid chart: axes.x.min is not a date in the calendar, got "2027-02-30"'],
    ['29 February in a common year', '2027-02-29', 'Invalid chart: axes.x.min is not a date in the calendar, got "2027-02-29"'],
    ['29 February in a century not divisible by 400', '1900-02-29', 'Invalid chart: axes.x.min is not a date in the calendar, got "1900-02-29"'],
    ['31 April', '2026-04-31', 'Invalid chart: axes.x.min is not a date in the calendar, got "2026-04-31"'],
    ['31 November', '2026-11-31', 'Invalid chart: axes.x.min is not a date in the calendar, got "2026-11-31"'],
    ['month 13', '2026-13', 'Invalid chart: axes.x.min is not a date in the calendar, got "2026-13"'],
    ['day 0', '2026-01-00', 'Invalid chart: axes.x.min is not a date in the calendar, got "2026-01-00"'],
    ['hour 24', '2026-01-01T24:00Z', 'Invalid chart: axes.x.min is not a time of day, got "2026-01-01T24:00Z"'],
    ['a leap second', '2016-12-31T23:59:60Z', 'Invalid chart: axes.x.min is not a time of day, got "2016-12-31T23:59:60Z"'],
    ['an offset of 24 hours', '2026-01-01T00:00+24:00', 'Invalid chart: axes.x.min has an offset that is not a time of day, got "2026-01-01T00:00+24:00"'],
    ['an offset of 60 minutes', '2026-01-01T00:00+01:60', 'Invalid chart: axes.x.min has an offset that is not a time of day, got "2026-01-01T00:00+01:60"'],
    ['a date and time without an offset', '2026-11-01T09:30', 'Invalid chart: axes.x.min must end in Z or an offset such as +01:00, since a time without one is local time, got "2026-11-01T09:30"'],
    ['English prose', 'March 1 2027', 'Invalid chart: axes.x.min must be an ISO 8601 date such as "2026-11-01" or "2026-11-01T09:30Z", or milliseconds, got "March 1 2027"'],
    ['a space before the time', '2026-11-01 09:30Z', 'Invalid chart: axes.x.min must be an ISO 8601 date such as "2026-11-01" or "2026-11-01T09:30Z", or milliseconds, got "2026-11-01 09:30Z"'],
    ['a lower-case z', '2026-11-01T09:30z', 'Invalid chart: axes.x.min must be an ISO 8601 date such as "2026-11-01" or "2026-11-01T09:30Z", or milliseconds, got "2026-11-01T09:30z"'],
    ['a six-digit year', '+002026-11-01', 'Invalid chart: axes.x.min must be an ISO 8601 date such as "2026-11-01" or "2026-11-01T09:30Z", or milliseconds, got "+002026-11-01"'],
    ['a week date', '2026-W44', 'Invalid chart: axes.x.min must be an ISO 8601 date such as "2026-11-01" or "2026-11-01T09:30Z", or milliseconds, got "2026-W44"'],
    ['four decimals of a second', '2026-11-01T09:30:15.2500Z', 'Invalid chart: axes.x.min must be an ISO 8601 date such as "2026-11-01" or "2026-11-01T09:30Z", or milliseconds, got "2026-11-01T09:30:15.2500Z"'],
    ['a time pushed before year 0 by its offset', '0000-01-01T00:00+01:00', 'Invalid chart: axes.x.min is outside 0000-01-01 to 9999-12-31 in UTC, got "0000-01-01T00:00+01:00"'],
    ['a fraction of a millisecond', 1.5, `Invalid chart: axes.x.min must be a whole number of milliseconds from ${MIN_TIME} to ${MAX_TIME}, or an ISO 8601 string, got 1.5`],
    ['milliseconds past 9999', MAX_TIME + 1, `Invalid chart: axes.x.min must be a whole number of milliseconds from ${MIN_TIME} to ${MAX_TIME}, or an ISO 8601 string, got ${MAX_TIME + 1}`],
    ['a Date object', new Date(0), 'Invalid chart: axes.x.min must be an ISO 8601 date such as "2026-11-01" or "2026-11-01T09:30Z", or milliseconds, got an object'],
  ])('rejects %s', (_case, value, message) => {
    expect(reading(value)).toThrow(message);
  });
});

describe('the UTC calendar', () => {
  it.each<[string, number, object]>([
    ['the epoch', 0, { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 }],
    ['a moment before the epoch', -1, { year: 1969, month: 12, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999 }],
    ['29 February 2000', Date.UTC(2000, 1, 29, 12), { year: 2000, month: 2, day: 29, hour: 12 }],
    ['the first day', MIN_TIME, { year: 0, month: 1, day: 1 }],
    ['the last moment', MAX_TIME, { year: 9999, month: 12, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999 }],
  ])('splits %s into its fields', (_case, at, fields) => {
    expect(fieldsOf(at)).toMatchObject(fields);
  });

  it.each<[number, number, number, number]>([
    [1970, 1, 1, 0],
    [2024, 2, 29, 1_709_164_800_000],
    [1, 1, 1, -62_135_596_800_000],
    [0, 3, 1, -62_162_035_200_000],
    [9999, 12, 31, 253_402_214_400_000],
  ])('finds the start of %s-%s-%s', (year, month, day, expected) => {
    expect(timeOf(year, month, day)).toBe(expected);
  });
});

const ticksOf = (unit: Parameters<typeof interval>[0], every: number, from: number, count: number): string[] => {
  const step = interval(unit, every);
  const shown: string[] = [];
  for (let at = step.floor(from); shown.length < count; at = step.next(at)) {
    shown.push(formatTime(at));
  }
  return shown;
};

describe('time intervals', () => {
  it.each<[string, Parameters<typeof interval>[0], number, string, string[]]>([
    ['hours, from midnight', 'hour', 6, '2026-11-01T10:20Z', ['2026-11-01 06:00', '2026-11-01 12:00', '2026-11-01 18:00', '2026-11-02']],
    ['weeks, from a Monday', 'week', 1, '2026-11-01', ['2026-10-26', '2026-11-02', '2026-11-09']],
    ['months, across a year end', 'month', 1, '2026-11-15', ['2026-11-01', '2026-12-01', '2027-01-01']],
    ['quarters, from January', 'month', 3, '2026-05-20', ['2026-04-01', '2026-07-01', '2026-10-01', '2027-01-01']],
    ['decades', 'year', 10, '2026-05-20', ['2020-01-01', '2030-01-01']],
    ['seconds before the epoch', 'second', 15, '1969-12-31T23:59:50Z', ['1969-12-31 23:59:45', '1970-01-01']],
    ['milliseconds', 'millisecond', 250, '2026-11-01T09:30:15.300Z', ['2026-11-01 09:30:15.250', '2026-11-01 09:30:15.500']],
  ])('steps %s', (_case, unit, every, from, shown) => {
    expect(ticksOf(unit, every, time('from', from), shown.length)).toEqual(shown);
  });
});

describe('time labels', () => {
  it.each<[string, string, string]>([
    ['a year by its number', '2026-01-01', '2026'],
    ['a month by its name', '2026-11-01', 'Nov'],
    ['a day by its day and month', '2026-11-03', '3 Nov'],
    ['a time of day to the minute', '2026-11-03T09:30Z', '09:30'],
    ['midnight past a day by the day', '2026-11-04T00:00Z', '4 Nov'],
    ['seconds', '2026-11-03T09:30:15Z', '09:30:15'],
    ['milliseconds', '2026-11-03T09:30:15.025Z', '09:30:15.025'],
    ['an early year with four digits', '0042-01-01', '0042'],
    ['half past midnight by its time, not its day', '2026-11-03T00:30Z', '00:30'],
  ])('writes %s', (_case, at, label) => {
    expect(formatTick(time('at', at), ENGLISH_MONTHS)).toBe(label);
  });

  it('writes a tooltip time with its milliseconds padded to three digits', () => {
    expect(formatTime(time('at', '2026-11-03T09:30:15.025Z'))).toBe('2026-11-03 09:30:15.025');
  });

  it('writes a tooltip time at half past midnight with its time of day', () => {
    expect(formatTime(time('at', '2026-11-03T00:30Z'))).toBe('2026-11-03 00:30');
  });

  it('writes months in the names it is given', () => {
    expect(formatTick(time('at', '2026-11-01'), ['jan', 'feb', 'márc', 'ápr', 'máj', 'jún', 'júl', 'aug', 'szept', 'okt', 'nov', 'dec'])).toBe('nov');
  });
});
