// A chart's colour axis: which series are coloured by value, what each puts on the axis, and the
// axis read from the spec or defaulted from those series.
import { anyValue, checkContinuousAxis } from './check-axis.js';
import { colorScaleOf, MAX_CLASSES, type CheckedColorAxis, type ColorDefaults } from './color-scale.js';
import { aSeries, fail, hexColor, integer, list, oneOf, show, type Fields } from './read.js';
import { DAY } from './time.js';
import { COLOR_SCALE_KINDS, COLOR_SCHEMES, type SeriesType } from './types.js';
import type { CheckedChart, CheckedSeries } from './validate.js';

/** What a series coloured by value puts on the colour axis. */
export interface Encoding {
  values: number[];
  /** The scale it asks for when the spec leaves it out. */
  defaults: ColorDefaults;
  /** Whether a cell of it has no value, and so is drawn as one. */
  missing: boolean;
}

type Encoder<K extends SeriesType> = ((entry: Extract<CheckedSeries, { type: K }>) => Encoding) | undefined;

const given = (values: readonly (number | null)[]) => values.filter((value) => value !== null);
const cellValues = (cells: readonly { value: number | null }[]) => cells.map((cell) => cell.value);

/**
 * For each series type, how it is coloured by value, or `undefined` when its colour is its palette
 * paint. Every type is listed, so a new one fails to compile until it says which it is.
 */
const ENCODINGS: { [K in SeriesType]: Encoder<K> } = {
  heatmap: (entry) => ({
    values: given(cellValues(entry.data)),
    defaults: entry.correlation ? { scale: 'diverging', domain: [-1, 1] } : { scale: 'sequential' },
    missing: cellValues(entry.data).includes(null),
  }),
  polarHeatmap: (entry) => ({
    values: given(cellValues(entry.data)),
    defaults: { scale: 'sequential' },
    missing: cellValues(entry.data).includes(null),
  }),
  calendar: (entry) => {
    const values = entry.data.map(([, value]) => value);
    // Every day of the range gets a cell, with a value or without.
    return { values: given(values), defaults: { scale: 'sequential' }, missing: values.length < (entry.to - entry.from) / DAY + 1 || values.includes(null) };
  },
  horizon: (entry) => {
    // Folded about 0, so its colour axis is made symmetric about it. A gap is a gap, not a cell with
    // no value.
    return {
      values: entry.data.flatMap((point) => (point === null ? [] : [point[1]])),
      defaults: { scale: 'quantize', scheme: 'red-blue', classes: 2 * entry.layers, symmetric: true },
      missing: false,
    };
  },
  bar: undefined,
  line: undefined,
  area: undefined,
  rangeArea: undefined,
  interval: undefined,
  xRange: undefined,
  distribution: undefined,
  relationship: undefined,
  market: undefined,
  histogram: undefined,
  xyLine: undefined,
  xyArea: undefined,
  scatter: undefined,
  bubble: undefined,
  timeline: undefined,
  pie: undefined,
  radar: undefined,
  rose: undefined,
  radialBar: undefined,
  polarLine: undefined,
  polarArea: undefined,
  polarScatter: undefined,
  gauge: undefined,
  units: undefined,
  funnel: undefined,
  liquid: undefined,
  venn: undefined,
  hierarchy: undefined,
};

const BY_VALUE = (Object.keys(ENCODINGS) as SeriesType[]).filter((type) => ENCODINGS[type] !== undefined);

/** How a series is coloured by value, or `undefined` for one painted from the palette. */
export function encodingOf(entry: CheckedSeries): Encoding | undefined {
  // One cast, as for the marks: the entry for `entry.type` takes exactly that series, which
  // TypeScript cannot follow through a lookup by a union key.
  const encode = ENCODINGS[entry.type] as ((entry: CheckedSeries) => Encoding) | undefined;
  return encode?.(entry);
}

const COLOR_AXIS_KEYS = ['type', 'title', 'min', 'max', 'step', 'ticks', 'format', 'scale', 'scheme', 'stops', 'classes', 'breaks', 'midpoint'];

const checkColorAxis = checkContinuousAxis({ linear: COLOR_AXIS_KEYS }, false, (r, path) => {
  const scheme = r.optional('scheme', oneOf(COLOR_SCHEMES));
  const stops = r.optional('stops', list(2, 32, hexColor));
  if (scheme !== undefined && stops !== undefined) fail(path, 'cannot combine scheme and stops');
  const breaks = r.optional('breaks', list(1, MAX_CLASSES - 1, anyValue));
  breaks?.forEach((value, i) => {
    if (i > 0 && !(value > breaks[i - 1]!)) {
      fail(`${path}.breaks[${i}]`, `must be greater than the break before it (${breaks[i - 1]}), got ${value}`);
    }
  });
  return {
    scale: r.optional('scale', oneOf(COLOR_SCALE_KINDS)),
    scheme,
    stops,
    classes: r.optional('classes', integer(2, MAX_CLASSES)),
    breaks,
    midpoint: r.optional('midpoint', anyValue),
  };
});

/**
 * The chart with its colour axis, when a series is coloured by value: read from `colorAxis`, or the
 * default one. A fill in the style of such a series, or of the chart, would hide the colours, so it
 * is an error, as is a colour axis with nothing to colour, or series whose values need different
 * scales on one axis.
 */
export function withColorAxis(r: Fields, chart: CheckedChart): CheckedChart {
  const series: readonly CheckedSeries[] = chart.series;
  const encoded = series.flatMap((entry) => {
    const encoding = encodingOf(entry);
    return encoding ? [{ entry, ...encoding }] : [];
  });
  const first = encoded[0];
  if (!first) {
    if (r.has('colorAxis')) fail('colorAxis', `needs a series coloured by value: ${BY_VALUE.join(', ')}`);
    return chart;
  }
  if (chart.style.fill !== undefined) {
    fail('style.fill', `is not allowed: ${first.entry.path} is coloured by value, through the colour axis`);
  }
  for (const { entry } of encoded) {
    for (const [key, own] of [['style.fill', entry.style.fill], ['color', entry.color]] as const) {
      if (own !== undefined) fail(`${entry.path}.${key}`, 'is not allowed: the colour axis colours each cell by its value');
    }
  }
  const axis: CheckedColorAxis = r.optional('colorAxis', checkColorAxis) ?? checkColorAxis('colorAxis', { type: 'linear' });
  checkHorizonColors(axis, encoded.map(({ entry }) => entry));
  const other = encoded.find(({ defaults }) => !sameDefaults(defaults, first.defaults));
  if (other) {
    fail(other.entry.path, `cannot share the colour axis of ${first.entry.path}: their values need different scales`);
  }
  return { ...chart, color: colorScaleOf(axis, encoded.flatMap(({ values }) => values), first.defaults) };
}

// Whether two series ask for the same colour axis, field by field.
function sameDefaults(a: ColorDefaults, b: ColorDefaults): boolean {
  return a.scale === b.scale && a.scheme === b.scheme && a.classes === b.classes && a.symmetric === b.symmetric
    && a.domain?.[0] === b.domain?.[0] && a.domain?.[1] === b.domain?.[1];
}

// Horizon rows share one quantize scale, symmetric about 0, with a class for each layer each way, and
// a row holds one horizon.
function checkHorizonColors(axis: CheckedColorAxis, encoded: readonly CheckedSeries[]): void {
  const horizons = encoded.flatMap((entry) => (entry.type === 'horizon' ? [entry] : []));
  const first = horizons[0];
  if (!first) return;
  const other = encoded.find((entry) => entry.type !== 'horizon');
  if (other) fail(other.path, `is ${aSeries(other.type)}, which cannot share the colour axis of ${first.path}, a horizon`);
  const rows = new Map<string, string>();
  // The first row's layers, said to be the default where its spec leaves them out.
  const theirs = first.layersGiven ? `${first.path}.layers is ${first.layers}` : `${first.path} has ${first.layers} layers, the default`;
  for (const entry of horizons) {
    const before = rows.get(entry.row);
    if (before !== undefined) fail(`${entry.path}.row`, `is ${show(entry.row)}, the row of ${before} too: a row holds one horizon`);
    rows.set(entry.row, entry.path);
    if (entry.layers !== first.layers) {
      if (!entry.layersGiven) fail(entry.path, `has ${entry.layers} layers, the default, but ${theirs}: horizon rows share their colours`);
      fail(`${entry.path}.layers`, `is ${entry.layers}, but ${theirs}: horizon rows share their colours`);
    }
  }
  if (axis.scale !== undefined && axis.scale !== 'quantize') fail(`${axis.path}.scale`, `must be quantize on a horizon chart, got ${axis.scale}`);
  if (axis.classes !== undefined && axis.classes !== 2 * first.layers) {
    const layersText = first.layersGiven ? `${first.path}.layers` : `${first.path}'s ${first.layers} layers, the default`;
    fail(`${axis.path}.classes`, `must be ${2 * first.layers}, twice ${layersText}, got ${axis.classes}`);
  }
  // Each end is named where the spec gives it: the one left out is not the one to change.
  if (axis.min === undefined && axis.max !== undefined) fail(`${axis.path}.max`, 'needs min, at -max, on a horizon chart, whose colours are symmetric about 0');
  if (axis.max === undefined && axis.min !== undefined) fail(`${axis.path}.min`, 'needs max, at -min, on a horizon chart, whose colours are symmetric about 0');
  if (axis.min !== undefined && axis.max !== undefined && axis.min !== -axis.max) {
    fail(`${axis.path}.min`, 'must be -max on a horizon chart, whose colours are symmetric about 0');
  }
}
