// A Venn or Euler diagram: 2 or 3 sets as circles whose areas, and the areas where they overlap, are
// in proportion to the sizes given. Every size is checked, and the circles placed, as the spec is read,
// so that each error names the entry it comes from.
import { MAX_NAME } from './check-axis.js';
import { color, fail, fields, list, MAX_VALUE, number, show, text, uniqueBy, type Fields } from './read.js';
import { formatNumber, formatValue, PLAIN_FORMAT } from './scale.js';
import type { SeriesBase } from './types.js';
import type { CheckedChartBase, SeriesOf } from './validate.js';
import { exclusiveSizes, placeCircles, regionErrors, type Circle } from './venn-geometry.js';

export interface VennArea {
  /** The names of 1 to 3 sets, each at most 100 characters: one set, or the overlap of all of those named. */
  sets: readonly string[];
  /**
   * The size of the set, or of the overlap of every set named, counting all of it: the overlap of A and
   * B includes what is also in C. 0 to 1e15, and above 0 for a set.
   */
  value: number;
  /** A set's colour. Only an entry naming one set takes one. */
  color?: string | undefined;
}

/**
 * 2 or 3 sets as circles, the area of each circle and of each overlap in proportion to its size. `data`
 * gives each set, then the overlap of each pair of sets and, for 3 sets, of all three, in any order, a
 * value of 0 where sets do not overlap. A set inside another is drawn inside it. Circles can match the
 * sizes of 2 sets exactly; 3 sets fail when circles cannot come within 5% of the whole diagram's area
 * of every region's size, or would draw a region at under a thousandth of its size.
 */
export interface VennSeries extends SeriesBase {
  type: 'venn';
  data: readonly VennArea[];
  /**
   * Writes in each region the size of what is inside exactly its sets. Labels can overlap in thin
   * regions, and a region too thin for the search that places them is left unlabelled.
   */
  dataLabels?: boolean | undefined;
}

/** The most sets circles can show every overlap of. */
const MAX_SETS = 3;
/** How far a region of 3 sets may be from its size, as a share of the whole diagram's area. */
const MAX_AREA_ERROR = 0.05;
/** A set this small beside the largest counts as nothing to draw. */
const NOTHING = 1e-9;
/** A region drawn at less than this share of its own size cannot be seen, and counts as left out. */
const LEFT_OUT = 1e-3;

export interface VennSet {
  name: string;
  value: number;
  color: string | undefined;
  /** Where the set is in `data`. */
  index: number;
}

export interface CheckedVennChart extends CheckedChartBase {
  system: 'venn';
  series: SeriesOf<'venn'>[];
}

interface Area {
  sets: string[];
  value: number;
  color: string | undefined;
}

export function readVenn(r: Fields, path: string, reserve: (count: number) => void) {
  // Up to 15 entries, enough for the 4 sets of a full Venn diagram, so that a fourth set is the error.
  const data = r.required('data', list(1, 2 ** (MAX_SETS + 1) - 1, readArea, reserve));
  const at = (i: number) => `${path}.data[${i}]`;
  const sets: VennSet[] = data.flatMap((area, index) =>
    area.sets.length === 1 ? [{ name: area.sets[0]!, value: area.value, color: area.color, index }] : [],
  );
  // Before the count, so that a set given twice is not taken for a fourth.
  uniqueBy(sets, (set) => set.name, (i, first) => fail(`${at(sets[i]!.index)}.sets`, `names the same sets as ${at(sets[first]!.index)}.sets`));
  if (sets.length > MAX_SETS) {
    const fourth = sets[MAX_SETS]!;
    fail(`${at(fourth.index)}.sets`, `names a fourth set, ${show(fourth.name)}: circles show the overlaps of at most ${MAX_SETS} sets`);
  }
  if (sets.length < 2) {
    fail(`${path}.data`, `names ${sets.length === 0 ? 'no set' : `1 set, ${show(sets[0]!.name)}`}, but a Venn diagram needs 2 or 3: give each set an entry of its own`);
  }
  const count = sets.length as 2 | 3;
  const bitOf = new Map(sets.map((set, i) => [set.name, 1 << i]));
  const masks = data.map((area, i) =>
    area.sets.reduce((mask, name, j) => mask | (bitOf.get(name) ?? fail(`${at(i)}.sets[${j}]`, `is ${show(name)}, but no entry names it as a set of its own`)), 0),
  );
  uniqueBy(masks, (mask) => String(mask), (i, first) => fail(`${at(i)}.sets`, `names the same sets as ${at(first)}.sets`));
  const entryOf = new Map(masks.map((mask, i) => [mask, i]));
  const inclusive = Array.from({ length: 2 ** count }, (_, mask) => (mask === 0 ? 0 : data[entryOf.get(mask) ?? missing(path, mask, sets)]!.value));
  const largest = Math.max(...sets.map((set) => set.value));
  sets.forEach((set) => {
    if (set.value === 0) fail(`${at(set.index)}.value`, 'is 0, but a set needs a size above 0 to be drawn');
    if (set.value <= NOTHING * largest) {
      fail(`${at(set.index)}.value`, `is ${sizeText(set.value)}, too small to be drawn beside the largest set, ${sizeText(largest)}`);
    }
  });
  checkNesting(inclusive, entryOf, sets, at);
  const exclusive = exclusiveSizes(inclusive, count);
  sets.forEach((set, i) => {
    if (exclusive[1 << i]! < 0) {
      fail(`${at(set.index)}.value`, `is ${sizeText(set.value)}, but its overlaps with the other sets cover ${sizeText(set.value - exclusive[1 << i]!)} of it: a set must hold all of its overlaps`);
    }
  });
  // Placed as shares of the largest set, so that the geometry works at one scale whatever the sizes.
  const shares = inclusive.map((size) => size / largest);
  const circles = placeCircles(shares, count);
  checkDrawn(circles, exclusiveSizes(shares, count), largest, sets, path);
  return { data, sets, exclusive, circles };
}

/**
 * A size as labels and errors write it: to 12 significant digits, so that the rounding in a size
 * computed by adding and taking away does not show, as 0.19999999999999998 for 0.3 − 0.1.
 */
export function sizeText(size: number): string {
  return formatValue(Number(size.toPrecision(12)));
}

function readArea(path: string, raw: unknown): Area {
  const item = fields(path, raw);
  item.allow(['sets', 'value', 'color']);
  const sets = item.required('sets', list(1, MAX_SETS, text(MAX_NAME)));
  uniqueBy(sets, (name) => name, (i) => fail(`${path}.sets[${i}]`, `repeats ${show(sets[i])}`));
  const value = item.required('value', number(0, MAX_VALUE));
  const areaColor = item.optional('color', color);
  if (areaColor !== undefined && sets.length > 1) {
    fail(`${path}.color`, 'must be left out: only a set has a colour, and this entry is an overlap');
  }
  return { sets, value, color: areaColor };
}

/** Every overlap must be given, 0 when the sets do not overlap: a forgotten one would draw them apart. */
function missing(path: string, mask: number, sets: readonly VennSet[]): never {
  return fail(`${path}.data`, `has no entry for the overlap of ${namesOf(mask, sets)}: give one, with a value of 0 if they do not overlap`);
}

/** An overlap is no larger than any set, or overlap of fewer sets, inside it. */
function checkNesting(inclusive: readonly number[], entryOf: ReadonlyMap<number, number>, sets: readonly VennSet[], at: (i: number) => string): void {
  inclusive.forEach((value, mask) => {
    for (let bit = 1; bit < inclusive.length; bit <<= 1) {
      const within = mask & ~bit;
      if ((mask & bit) === 0 || within === 0 || value <= inclusive[within]!) continue;
      const of = within & (within - 1) ? `the overlap of ${namesOf(within, sets)}` : namesOf(within, sets);
      fail(`${at(entryOf.get(mask)!)}.value`, `is ${formatValue(value)}, more than the ${formatValue(inclusive[within]!)} of ${of} (${at(entryOf.get(within)!)}): an overlap cannot be larger than what it is part of`);
    }
  });
}

/** Every region is drawn, and within MAX_AREA_ERROR of the whole of its size. `unit` turns shares into sizes. */
function checkDrawn(circles: readonly Circle[], wanted: readonly number[], unit: number, sets: readonly VennSet[], path: string): void {
  const errors = regionErrors(circles, wanted);
  const whole = wanted.reduce((sum, area) => sum + area, 0);
  wanted.forEach((area, mask) => {
    if (mask === 0) return;
    const drawn = area + errors[mask]!;
    const off = Math.abs(errors[mask]!) / whole;
    // Against the region's own size, not the whole: a small region drawn exactly is drawn.
    if (area > 0 && drawn < LEFT_OUT * area) {
      fail(`${path}.data`, `cannot be drawn with circles: the region inside ${regionOf(mask, sets)} would be left out`);
    }
    if (off > MAX_AREA_ERROR) {
      const shown = formatValue(Number((Math.max(0, drawn) * unit).toPrecision(3)));
      fail(`${path}.data`, `cannot be drawn with circles: the region inside ${regionOf(mask, sets)} would be ${shown} rather than ${sizeText(area * unit)}, ${formatNumber(off * 100, 1, PLAIN_FORMAT)}% of the whole diagram, more than ${MAX_AREA_ERROR * 100}%`);
    }
  });
}

/** The sets of `mask`, quoted: "A" and "B", or "A", "B" and "C". */
function namesOf(mask: number, sets: readonly VennSet[]): string {
  const names = sets.filter((_, i) => (mask >> i) & 1).map((set) => show(set.name));
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`;
}

/** The region of `mask` in words: only "A", only "A" and "B", or all of "A", "B" and "C". */
function regionOf(mask: number, sets: readonly VennSet[]): string {
  return mask === 2 ** sets.length - 1 ? `all of ${namesOf(mask, sets)}` : `only ${namesOf(mask, sets)}`;
}

export function checkVennChart(r: Fields, base: CheckedChartBase, series: SeriesOf<'venn'>[]): CheckedVennChart {
  if (r.has('axes')) fail('axes', 'must be left out: a Venn diagram has no axes');
  if (series.length > 1) fail('series', `of a Venn diagram must be one venn series, got ${series.length}`);
  return { ...base, system: 'venn', series };
}
