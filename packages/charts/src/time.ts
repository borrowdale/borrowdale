// Time on a chart: ISO 8601 strings or milliseconds since 1970-01-01T00:00Z, read without the
// engine's date parser, and calendar arithmetic in UTC from whole numbers only, so a time axis is the
// same in every JavaScript engine and every time zone. The calendar is the proleptic Gregorian one;
// weeks start on Monday, as in ISO 8601.
import type { CheckedLinearAxis } from './check-axis.js';
import { fail, MAX_TICKS, show, type Check } from './read.js';
import { keptApart, listedTicks, type Scale } from './scale.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
// 1970-01-01 was a Thursday, so weeks start 3 days before the epoch.
const MONDAY = -3 * DAY;

/** The earliest time a chart accepts, 0000-01-01T00:00:00.000Z. */
export const MIN_TIME = -62_167_219_200_000;
/** The latest time a chart accepts, 9999-12-31T23:59:59.999Z. */
export const MAX_TIME = 253_402_300_799_999;

export const ENGLISH_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A year, a year and month, a date, or a date and time with minutes, seconds and up to 3 decimals of
// a second, ending in Z or an offset from UTC.
const ISO = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/;

/**
 * A time at `path`: an ISO 8601 string, read as UTC unless it gives an offset, or a whole number of
 * milliseconds since 1970-01-01T00:00Z. A date and time must say its offset, as `Z` or `+01:00`: one
 * without would be local time, which differs between viewers.
 */
export const time: Check<number> = (path, value) => {
  if (typeof value === 'number') {
    if (!(Number.isInteger(value) && value >= MIN_TIME && value <= MAX_TIME)) {
      fail(path, `must be a whole number of milliseconds from ${MIN_TIME} to ${MAX_TIME}, or an ISO 8601 string, got ${show(value)}`);
    }
    return value;
  }
  const parts = typeof value === 'string' ? ISO.exec(value) : null;
  if (!parts) {
    fail(path, `must be an ISO 8601 date such as "2026-11-01" or "2026-11-01T09:30Z", or milliseconds, got ${show(value)}`);
  }
  const [, year, month = '01', day = '01', hour, minute = '00', second = '00', fraction = '', zone] = parts;
  if (hour !== undefined && zone === undefined) {
    fail(path, `must end in Z or an offset such as +01:00, since a time without one is local time, got ${show(value)}`);
  }
  const [y, m, d] = [Number(year), Number(month), Number(day)];
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m))) {
    fail(path, `is not a date in the calendar, got ${show(value)}`);
  }
  const [h, mi, s] = [Number(hour ?? '0'), Number(minute), Number(second)];
  if (!(h <= 23 && mi <= 59 && s <= 59)) {
    fail(path, `is not a time of day, got ${show(value)}`);
  }
  let offset = 0;
  if (zone !== undefined && zone !== 'Z') {
    const [oh, om] = [Number(zone.slice(1, 3)), Number(zone.slice(4, 6))];
    if (!(oh <= 23 && om <= 59)) {
      fail(path, `has an offset that is not a time of day, got ${show(value)}`);
    }
    offset = (zone[0] === '-' ? -1 : 1) * (oh * HOUR + om * MINUTE);
  }
  const milliseconds = Number(fraction.padEnd(3, '0'));
  const at = daysFromCivil(y, m, d) * DAY + h * HOUR + mi * MINUTE + s * SECOND + milliseconds - offset;
  if (!(at >= MIN_TIME && at <= MAX_TIME)) {
    fail(path, `is outside 0000-01-01 to 9999-12-31 in UTC, got ${show(value)}`);
  }
  return at;
};

/** The calendar fields of a time, in UTC. */
export interface TimeFields {
  year: number;
  /** 1 to 12. */
  month: number;
  /** 1 to 31. */
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

export function fieldsOf(at: number): TimeFields {
  const days = Math.floor(at / DAY);
  const [year, month, day] = civilFromDays(days);
  let rest = at - days * DAY;
  const hour = Math.floor(rest / HOUR);
  rest -= hour * HOUR;
  const minute = Math.floor(rest / MINUTE);
  rest -= minute * MINUTE;
  const second = Math.floor(rest / SECOND);
  return { year, month, day, hour, minute, second, millisecond: rest - second * SECOND };
}

/** The time at the start of a day, from its year, month (1 to 12) and day. */
export function timeOf(year: number, month: number, day: number): number {
  return daysFromCivil(year, month, day) * DAY;
}

function isLeap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  return month === 2 ? (isLeap(year) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// Days since 1970-01-01 of a date, and back, by Howard Hinnant's algorithms ("chrono-Compatible
// Low-Level Date Algorithms", public domain), in eras of 400 years from 0000-03-01.
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

function civilFromDays(days: number): [year: number, month: number, day: number] {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const dayOfEra = z - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36_524) - Math.floor(dayOfEra / 146_096)) / 365,
  );
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shifted = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shifted + 2) / 5) + 1;
  const month = shifted < 10 ? shifted + 3 : shifted - 9;
  return [yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day];
}

export const TIME_UNITS = ['millisecond', 'second', 'minute', 'hour', 'day', 'week', 'month', 'year'] as const;

export type TimeUnit = (typeof TIME_UNITS)[number];

/** Ticks every `every` of a unit, on its boundaries in UTC. */
export interface TimeInterval {
  unit: TimeUnit;
  every: number;
  /** About how long one step is, for choosing an interval. */
  length: number;
  /** The last boundary at or before `at`. */
  floor: (at: number) => number;
  /** The boundary one step after the boundary `at`. */
  next: (at: number) => number;
}

const FIXED: Partial<Record<TimeUnit, [length: number, origin: number]>> = {
  millisecond: [1, 0],
  second: [SECOND, 0],
  minute: [MINUTE, 0],
  hour: [HOUR, 0],
  day: [DAY, 0],
  week: [WEEK, MONDAY],
};

/**
 * Every `every` of `unit`: counted from the epoch for units of fixed length (from midnight for hours
 * that divide a day, from a Monday for weeks), from January for months, and from year 0 for years.
 */
export function interval(unit: TimeUnit, every: number): TimeInterval {
  const fixed = FIXED[unit];
  if (fixed) {
    const [length, origin] = fixed;
    const step = length * every;
    return {
      unit,
      every,
      length: step,
      floor: (at) => at - mod(at - origin, step),
      next: (at) => at + step,
    };
  }
  if (unit === 'month') {
    const index = (at: number): number => {
      const { year, month } = fieldsOf(at);
      return year * 12 + month - 1;
    };
    const start = (months: number): number => timeOf(Math.floor(months / 12), mod(months, 12) + 1, 1);
    return {
      unit,
      every,
      length: every * 30 * DAY,
      floor: (at) => start(index(at) - mod(index(at), every)),
      next: (at) => start(index(at) + every),
    };
  }
  return {
    unit,
    every,
    length: every * 365 * DAY,
    floor: (at) => {
      const { year } = fieldsOf(at);
      return timeOf(year - mod(year, every), 1, 1);
    },
    next: (at) => timeOf(fieldsOf(at).year + every, 1, 1),
  };
}

function mod(value: number, by: number): number {
  return ((value % by) + by) % by;
}

/** The intervals an axis picks from, finest first, each dividing the next coarser one of its unit. */
export const INTERVALS: readonly TimeInterval[] = [
  ...[1, 2, 5, 10, 20, 50, 100, 200, 500].map((every) => interval('millisecond', every)),
  ...[1, 5, 15, 30].map((every) => interval('second', every)),
  ...[1, 5, 15, 30].map((every) => interval('minute', every)),
  ...[1, 3, 6, 12].map((every) => interval('hour', every)),
  interval('day', 1),
  interval('week', 1),
  ...[1, 3].map((every) => interval('month', every)),
  ...[1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].map((every) => interval('year', every)),
];

// About one tick per this many units of axis, as on a linear axis.
const TICK_SPACING = 50;

/**
 * A time scale over the data's extent: free ends rounded out to the boundaries of the interval that
 * gives about one tick per 50 units of `length` without passing that, or of the axis' own `step`.
 * Ticks are the interval's boundaries, labelled at the coarsest level each falls on; where labels
 * would overlap, only the ticks on a coarser interval's boundaries are labelled.
 */
export function timeScale(axis: CheckedLinearAxis, [lo, hi]: [number, number], length: number): Scale {
  if (axis.ticks) {
    return listedTicks(axis, axis.ticks, [lo, hi]);
  }
  const [low, high] = [axis.min ?? lo, axis.max ?? hi];
  const count = Math.max(2, Math.floor(length / TICK_SPACING));
  // One moment alone, or a fixed end it equals, shows the day it falls in.
  const span = high > low ? high - low : DAY;
  const step = axis.interval ?? INTERVALS.find((candidate) => candidate.length * count >= span) ?? INTERVALS.at(-1)!;
  let domain: [number, number] = [axis.min ?? step.floor(low), axis.max ?? ceiling(step, high)];
  if (!(domain[1] > domain[0])) {
    domain = axis.max === undefined ? [domain[0], step.next(step.floor(domain[0]))] : [step.floor(domain[1] - 1), domain[1]];
  }
  const ticks: number[] = [];
  for (let at = ceiling(step, domain[0]); at <= domain[1]; at = step.next(at)) {
    if (ticks.length === MAX_TICKS) {
      fail(`${axis.path}.step`, `gives more than ${MAX_TICKS} ticks from ${formatTime(domain[0])} to ${formatTime(domain[1])}`);
    }
    ticks.push(at);
  }
  const spanShown = domain[1] - domain[0];
  // The intervals at or above this one, to label only the ticks on their boundaries.
  const coarser = INTERVALS.filter((candidate) => candidate.length >= step.length);
  return {
    domain,
    ticks,
    labels: ticks.map((tick) => formatTick(tick, axis.months)),
    fraction: (value) => (value - domain[0]) / spanShown,
    labelled: (room, at) => {
      for (const candidate of coarser) {
        const shown = ticks.flatMap((tick, i) => (candidate.floor(tick) === tick ? [i] : []));
        if (shown.length > 0 && keptApart(shown.map((i) => ticks[i]!), room, at).length === shown.length) {
          return shown;
        }
      }
      return keptApart(ticks, room, at);
    },
  };
}

// The first boundary at or after `at`.
function ceiling(step: TimeInterval, at: number): number {
  const floor = step.floor(at);
  return floor === at ? at : step.next(floor);
}

/**
 * A tick label: the time at the coarsest level it falls on, "2026" on a year, "Nov" on a month,
 * "3 Nov" on a day, "09:30" on a minute, "09:30:15" on a second, "09:30:15.250" otherwise.
 */
export function formatTick(at: number, months: readonly string[]): string {
  const { year, month, day, hour, minute, second, millisecond } = fieldsOf(at);
  if (millisecond !== 0) {
    return `${clock(hour, minute)}:${two(second)}.${String(millisecond).padStart(3, '0')}`;
  }
  if (second !== 0) {
    return `${clock(hour, minute)}:${two(second)}`;
  }
  if (hour !== 0 || minute !== 0) {
    return clock(hour, minute);
  }
  if (day !== 1) {
    return `${day} ${months[month - 1]}`;
  }
  return month !== 1 ? months[month - 1]! : yearText(year);
}

/** A time in a tooltip: the date, then the time of day to the minute, second or millisecond it has. */
export function formatTime(at: number): string {
  const { year, month, day, hour, minute, second, millisecond } = fieldsOf(at);
  const date = `${yearText(year)}-${two(month)}-${two(day)}`;
  if (millisecond !== 0) {
    return `${date} ${clock(hour, minute)}:${two(second)}.${String(millisecond).padStart(3, '0')}`;
  }
  if (second !== 0) {
    return `${date} ${clock(hour, minute)}:${two(second)}`;
  }
  return hour !== 0 || minute !== 0 ? `${date} ${clock(hour, minute)}` : date;
}

function clock(hour: number, minute: number): string {
  return `${two(hour)}:${two(minute)}`;
}

function two(value: number): string {
  return String(value).padStart(2, '0');
}

function yearText(year: number): string {
  return String(year).padStart(4, '0');
}
