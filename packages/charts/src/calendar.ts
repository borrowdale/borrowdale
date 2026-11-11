// A calendar heatmap: a cell per day in a grid of weeks, years stacked, each month outlined.
import type { Point } from '@borrowdale/core';
import type { Drawing } from './drawing.js';
import { assertRoom, GAP, type Rect } from './frame.js';
import { colorAxisOf } from './color-scale.js';
import { valueCell, valueTitle } from './marks.js';
import { INK } from './palette.js';
import { DAY, fieldsOf, formatTime, timeOf, weekdayOf } from './time.js';
import type { CheckedCalendarChart } from './validate.js';

// The share of a cell's side left empty around it, so neighbouring days stay apart.
const CELL_INSET = 0.06;

/** A day's place in its year's grid: its week, counted from the year's first, and its row in the week. */
interface Day {
  at: number;
  week: number;
  row: number;
}

/** A year's part of the range: its days, and how many weeks they take. */
interface Year {
  year: number;
  days: Day[];
  weeks: number;
}

/**
 * Lays out the calendar into `rect`. Horizontally, weeks run left to right and the days of the week
 * down, each year below the one before, its year and months named above it and the weekdays beside
 * it. Vertically, the grid is transposed: weeks run down and the years stand side by side, the
 * months named beside each and the weekdays above.
 */
export function layoutCalendar(drawing: Drawing, chart: CheckedCalendarChart, rect: Rect): void {
  const entry = chart.series[0]!;
  const color = colorAxisOf(chart.color, entry.path);
  const values = new Map(entry.data.map(([at, value]) => [at, value]));
  // The weekday each week starts on, 0 for Monday as `weekdayOf` counts.
  const first = entry.weekStart === 'monday' ? 0 : 6;
  const rowOf = (at: number): number => (weekdayOf(at) - first + 7) % 7;
  const years = yearsOf(entry.from, entry.to, rowOf);
  const weekdays = Array.from({ length: 7 }, (_, row) => entry.weekdays[(row + first) % 7]!);
  const vertical = entry.orientation === 'vertical';
  const line = drawing.lineHeight();
  const mostWeeks = Math.max(...years.map((year) => year.weeks));
  const yearNames = years.map((year) => formatTime(timeOf(year.year, 1, 1)).slice(0, 4));
  const widest = (names: readonly string[]): number => Math.max(0, ...names.map((name) => drawing.width(name)));

  // Along a year's weeks and across its seven days, in the units of the chart.
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  let cell: number;
  let place: (year: number, week: number, row: number) => Point;
  let header: number;
  let side: number;
  if (vertical) {
    side = widest(entry.months) + GAP;
    header = 2 * line + GAP;
    const blockGap = GAP * 2;
    cell = Math.min((width - years.length * side - (years.length - 1) * blockGap) / (7 * years.length), (height - header) / mostWeeks);
    const blockWidth = side + 7 * cell;
    place = (y, week, row) => [rect.left + y * (blockWidth + blockGap) + side + row * cell, rect.top + header + week * cell];
  } else {
    side = widest([...weekdays, ...yearNames]) + GAP;
    header = line + GAP / 2;
    cell = Math.min((width - side) / mostWeeks, (height - years.length * header - (years.length - 1) * GAP) / (7 * years.length));
    place = (y, week, row) => [rect.left + side + week * cell, rect.top + y * (header + 7 * cell + GAP) + header + row * cell];
  }
  assertRoom({ left: 0, top: 0, right: cell, bottom: cell }, chart.width, chart.height);
  const corner = (y: number, week: number, row: number): Point => place(y, week, row);

  years.forEach((year, y) => {
    for (const day of year.days) {
      const [left, top] = corner(y, day.week, day.row);
      const inset = cell * CELL_INSET;
      const box = { kind: 'rectangle' as const, x: left + inset, y: top + inset, width: cell - 2 * inset, height: cell - 2 * inset };
      const value = values.get(day.at) ?? null;
      const node = valueCell(drawing, box, value, color, [entry.name, 'day', day.at], entry.style);
      drawing.mark(valueTitle(entry.name, formatTime(day.at), value, color), [node]);
    }
    for (const month of monthsOf(year.days)) {
      const points = monthOutline(month).map(([week, row]) => corner(y, week, row));
      drawing.push(drawing.outline({ kind: 'polygon', points }, { stroke: INK, strokeWidth: 1 }, ['month', year.year, month.month]));
    }
    drawLabels(drawing, entry, year, y, yearNames[y]!, weekdays, { vertical, cell, line, side, corner });
  });
}

/** Each year of the range from `from` to `to`, with its days placed in its weeks. */
function yearsOf(from: number, to: number, rowOf: (at: number) => number): Year[] {
  const years: Year[] = [];
  for (let year = fieldsOf(from).year; year <= fieldsOf(to).year; year++) {
    const start = Math.max(from, timeOf(year, 1, 1));
    const end = Math.min(to, timeOf(year, 12, 31));
    // Weeks are counted from the one holding the first day drawn, so a part of a year starts at the left.
    const lead = rowOf(start);
    const days: Day[] = [];
    for (let at = start; at <= end; at += DAY) {
      const index = (at - start) / DAY + lead;
      days.push({ at, week: Math.floor(index / 7), row: index % 7 });
    }
    years.push({ year, days, weeks: days.at(-1)!.week + 1 });
  }
  return years;
}

interface Month {
  month: number;
  firstDay: Day;
  lastDay: Day;
}

function monthsOf(days: readonly Day[]): Month[] {
  const months = new Map<number, Month>();
  for (const day of days) {
    const { month } = fieldsOf(day.at);
    const known = months.get(month);
    months.set(month, known ? { ...known, lastDay: day } : { month, firstDay: day, lastDay: day });
  }
  return [...months.values()];
}

/**
 * The edge of a month's days, in weeks and rows: from the top of its first week's column after its
 * first day, round the full weeks, to the bottom of its last week's column up to its last day. A
 * month whose days all fall in one week, at an end of the range, is the box of those days.
 */
function monthOutline({ firstDay, lastDay }: Month): [number, number][] {
  const [c0, r0, c1, r1] = [firstDay.week, firstDay.row, lastDay.week, lastDay.row];
  if (c0 === c1) return [[c0, r0], [c0 + 1, r0], [c0 + 1, r1 + 1], [c0, r1 + 1]];
  return [[c0 + 1, r0], [c0, r0], [c0, 7], [c1, 7], [c1, r1 + 1], [c1 + 1, r1 + 1], [c1 + 1, 0], [c0 + 1, 0]];
}

/** The week a month is named at: its first full week, or the one after its first day. */
function namingWeek({ firstDay }: Month): number {
  return firstDay.week + (firstDay.row === 0 ? 0 : 1);
}

interface LabelPlace {
  vertical: boolean;
  cell: number;
  line: number;
  side: number;
  corner: (year: number, week: number, row: number) => Point;
}

/**
 * A year's name, its months' names at their first full weeks, and the weekdays: every one where it
 * fits beside its cell, else every second or more, as room allows. A month is named only within its
 * own weeks, from the first full one to its last, and a name too long for them is cut short. These
 * labels are not counted toward the cap on placed text: a range holds at most 274 years, so at most
 * about 20 labels a year.
 */
function drawLabels(
  drawing: Drawing,
  entry: CheckedCalendarChart['series'][number],
  year: Year,
  y: number,
  yearName: string,
  weekdays: readonly string[],
  { vertical, cell, line, side, corner }: LabelPlace,
): void {
  const [left, top] = corner(y, 0, 0);
  // Across the top, a weekday takes its name's width; down the side, a line.
  const across = vertical ? Math.max(...weekdays.map((name) => drawing.width(name))) + GAP / 2 : line;
  const every = Math.ceil(across / cell);
  const text = (name: string, x: number, at: number, anchor: 'start' | 'middle' | 'end') =>
    drawing.push(drawing.text(name, { x, y: at, anchor, baseline: 'middle' }));
  const months = monthsOf(year.days);
  if (vertical) {
    text(yearName, left - side, top - 1.5 * line - GAP, 'start');
    weekdays.forEach((name, row) => {
      if (row % every !== 0) return;
      text(name, left + (row + 0.5) * cell, top - line / 2 - GAP / 2, 'middle');
    });
    for (const month of months) {
      // Down the side, a name takes a line, which its weeks must hold.
      if ((month.lastDay.week + 1 - namingWeek(month)) * cell < line) continue;
      text(entry.months[month.month - 1]!, left - GAP, corner(y, namingWeek(month), 0)[1] + cell / 2, 'end');
    }
    return;
  }
  text(yearName, left - side, top - line / 2 - GAP / 2, 'start');
  weekdays.forEach((name, row) => {
    if (row % every === 0) text(name, left - GAP, top + (row + 0.5) * cell, 'end');
  });
  for (const month of months) {
    const start = corner(y, namingWeek(month), 0)[0];
    // Up to the end of its last week: the next month is named no earlier than the week after it.
    const room = corner(y, month.lastDay.week + 1, 0)[0] - start - GAP / 2;
    // A month too short in the range to have room for even "…" is left unnamed: its outline shows it.
    if (room < drawing.width('…')) continue;
    text(drawing.fit(entry.months[month.month - 1]!, room, `${entry.path}.format.months`), start, top - line / 2 - GAP / 2, 'start');
  }
}
