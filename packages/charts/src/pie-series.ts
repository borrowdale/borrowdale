// A pie chart: slices of one or more nested rings, and the slice a pie of pie breaks out into parts.
import { checkSweep, MAX_HOLE, MAX_NAME, MAX_PAD_ANGLE } from './check-axis.js';
import { checkNameColors, readNamedValues } from './named-values.js';
import { fail, fields, MAX_VALUE, number, show, text, type Fields } from './read.js';
import type { CheckedChartBase, SeriesOf } from './validate.js';

/** A pie series with its ring resolved: where it starts and ends, as shares of the radius. */
export type CheckedPie = SeriesOf<'pie'> & { innerRadius: number; outerRadius: number };

export interface CheckedPieChart extends CheckedChartBase {
  system: 'pie';
  /** Nested rings, the first outermost by default. */
  series: CheckedPie[];
}

const MAX_RINGS = 10;
const MAX_CORNER_RADIUS = 1_000;
const MAX_OFFSET = 0.5;
const MIN_OUTER = 0.05;

export function checkPieChart(r: Fields, base: CheckedChartBase, series: SeriesOf<'pie'>[]): CheckedPieChart {
  if (r.has('axes')) {
    fail('axes', 'must be left out: a pie chart has no axes');
  }
  if (series.length > MAX_RINGS) {
    fail('series', `of a pie chart must be 1 to ${MAX_RINGS} pie series, got ${series.length}`);
  }
  const breaking = series.find((pie) => pie.breakout);
  if (breaking && series.length > 1) fail(`${breaking.path}.breakout`, 'needs a pie of one ring: nested rings cannot break a slice out');
  const first = series[0]!;
  const count = series.length;
  const rings = series.map((pie, k) => {
    for (const key of ['startAngle', 'endAngle'] as const) {
      if (pie[key] !== first[key]) {
        // Name the angle the spec gave, and say which is the default.
        const theirs = first.sweepGiven[key] ? `${first.path}.${key} is ${first[key]}` : `${first.path} has the default, ${first[key]}`;
        if (!pie.sweepGiven[key]) fail(pie.path, `has the default ${key}, ${pie[key]}, but ${theirs}: nested rings share their sweep`);
        fail(`${pie.path}.${key}`, `is ${pie[key]}, but ${theirs}: nested rings share their sweep`);
      }
    }
    // Nested rings split the radius equally, the first outermost.
    const outerRadius = pie.outerRadius ?? 1 - k / count;
    const innerRadius = pie.innerRadius ?? (count === 1 ? 0 : 1 - (k + 1) / count);
    if (!(outerRadius > innerRadius)) {
      // Name the key the spec gave: a defaulted outerRadius is not the one to change.
      if (pie.outerRadius === undefined) {
        const limit = `must be less than the ring's default outerRadius (${outerRadius})`;
        fail(`${pie.path}.innerRadius`, `${limit}, got ${innerRadius}`);
      }
      const inner = pie.innerRadius === undefined ? `the ring's default innerRadius` : 'innerRadius';
      fail(`${pie.path}.outerRadius`, `must be greater than ${inner} (${innerRadius}), got ${outerRadius}`);
    }
    return { ...pie, innerRadius, outerRadius };
  });
  checkNameColors(rings);
  return { ...base, system: 'pie', series: rings };
}

/**
 * The slice a pie breaks out, with its place among the slices, and its parts: they add up to its
 * value, give or take rounding, and are named apart from the slices, as each is a legend entry of its
 * own. The slice must be drawn, with a value and a radius above 0, for the lines to join it.
 */
function readBreakout<S extends { name: string; value: number; radius: number | undefined }>(
  path: string, raw: unknown, slices: readonly S[], reserve: (count: number) => void,
) {
  const r = fields(path, raw);
  r.allow(['slice', 'data']);
  const name = r.required('slice', text(MAX_NAME));
  const index = slices.findIndex((item) => item.name === name);
  const slice = slices[index] ?? fail(`${path}.slice`, `is ${show(name)}, which names no slice of the pie`);
  if (slice.value === 0 || slice.radius === 0) {
    const zero = slice.value === 0 ? 'value' : 'radius';
    fail(`${path}.slice`, `is ${show(name)}, a slice whose ${zero} is 0, so it is not drawn and there is nothing to break out`);
  }
  const data = readNamedValues(r, path, reserve, [], () => ({}));
  data.forEach((part, i) => {
    if (slices.some((item) => item.name === part.name)) {
      fail(`${path}.data[${i}].name`, `is ${show(part.name)}, the name of a slice of the pie: parts are named apart from the slices`);
    }
  });
  const sum = data.reduce((total, part) => total + part.value, 0);
  // Within rounding of the slice, however small: it is above 0.
  if (Math.abs(sum - slice.value) > 1e-9 * slice.value) {
    fail(`${path}.data`, `adds up to ${sum}, but the slice it breaks out, ${show(name)}, is ${slice.value}`);
  }
  return { slice, index, data };
}

export function checkPieSeries(r: Fields, path: string, reserve: (count: number) => void) {
  const data = readNamedValues(r, path, reserve, ['offset', 'radius'], (slice) => ({
    offset: slice.optional('offset', number(0, MAX_OFFSET)) ?? 0,
    radius: slice.optional('radius', number(0, MAX_VALUE)),
  }));
  const sized = data.filter((slice) => slice.radius !== undefined).length;
  if (sized > 0 && sized < data.length) {
    const i = data.findIndex((slice) => slice.radius === undefined);
    fail(`${path}.data[${i}].radius`, 'is missing: every slice has a radius, or none does');
  }
  // A slice is drawn only with a share of the pie and a reach beyond the hole.
  if (sized > 0 && !data.some((slice) => slice.value > 0 && (slice.radius ?? 0) > 0)) {
    fail(`${path}.data`, 'has no slice with both a value and a radius above 0, so there is nothing to draw');
  }
  const breakout = r.optional('breakout', (breakoutPath, raw) => readBreakout(breakoutPath, raw, data, reserve));
  // Before the angles are read, so that an angle given with breakout is named as one to leave out.
  if (breakout) {
    for (const key of ['startAngle', 'endAngle'] as const) {
      if (r.has(key)) fail(`${path}.${key}`, 'must be left out with breakout: the pie turns so that the slice it breaks out faces its parts');
    }
  }
  const { startAngle, endAngle } = checkSweep(r, path);
  return {
    data,
    breakout,
    innerRadius: r.optional('innerRadius', number(0, MAX_HOLE)),
    outerRadius: r.optional('outerRadius', number(MIN_OUTER, 1)),
    startAngle,
    endAngle,
    // Which angles the spec gave: the check that nested rings share a sweep names only those.
    sweepGiven: { startAngle: r.has('startAngle'), endAngle: r.has('endAngle') },
    padAngle: r.optional('padAngle', number(0, MAX_PAD_ANGLE)) ?? 0,
    cornerRadius: r.optional('cornerRadius', number(0, MAX_CORNER_RADIUS)) ?? 0,
  };
}
