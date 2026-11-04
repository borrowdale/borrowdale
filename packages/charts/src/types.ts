import type { Seed, Sketch, SketchStyle } from '@borrowdale/core';
import type { Font, TextLayout } from '@borrowdale/text';

/**
 * A chart, as plain data that can come from JSON. Its series' type picks its coordinate system, and
 * every series must draw in the same one, with that system's axes: `x` and `y` for cartesian
 * series, `angle` (and optionally `radius`) for polar series (radar, rose, radial bar, polar line,
 * area and scatter), optionally `angle` for a gauge, optionally `time` for a timeline, none for a
 * pie.
 */
export interface ChartSpec {
  width: number;
  height: number;
  title?: string | undefined;
  /**
   * Varies the strokes of every mark. A finite number, or a string of at most 100 characters. Each
   * mark's seed also comes from its series and category, so a mark keeps its strokes when other
   * data change. Defaults to 1.
   */
  seed?: Seed | undefined;
  /** For every label, in user units, from 1 to 200. The title is 4 units larger. Defaults to 12. */
  fontSize?: number | undefined;
  /** Defaults to `top` with two or more entries and to `none` with one. */
  legend?: LegendPosition | undefined;
  /**
   * Applies to every shape the chart draws, axes too, under each series' own `style`. Its `stroke`,
   * `fill` and `strokeLineDash` replace every series' `color` and `dash`. It takes no `seed`. Its
   * `stroke` and `fill` must be colours, as for a series' `color`, and `strokeWidth` and
   * `fillWeight` 0 to 100.
   */
  style?: SketchStyle | undefined;
  axes?: CartesianAxes | PolarAxes | GaugeAxes | TimelineAxes | undefined;
  /** Up to 100 Cartesian annotations. Numeric coordinates contribute to automatic domains. */
  annotations?: readonly Annotation[] | undefined;
  series: readonly Series[];
}

/**
 * A place on an axis: a number on a continuous axis, an ISO 8601 time or milliseconds on a time axis,
 * or a category name on a band axis.
 */
export type ChartCoordinate = number | string;
/** A value on a continuous axis: a number, or on a time axis an ISO 8601 string or milliseconds. */
export type ChartValue = number | string;
export type ChartPosition = readonly [x: ChartCoordinate, y: ChartCoordinate];
interface AnnotationStyle {
  color?: string | undefined;
  layer?: 'back' | 'front' | undefined;
}
export type Annotation = AnnotationStyle & (
  | { type: 'line'; axis: 'x' | 'y' | 'y2'; value: ChartCoordinate; label?: string | undefined }
  | { type: 'band'; axis: 'x' | 'y' | 'y2'; from: ChartCoordinate; to: ChartCoordinate }
  | { type: 'region'; from: ChartPosition; to: ChartPosition; axis?: 'y' | 'y2' | undefined }
  | { type: 'arrow'; from: ChartPosition; to: ChartPosition; axis?: 'y' | 'y2' | undefined }
  | { type: 'label'; at: ChartPosition; text: string; axis?: 'y' | 'y2' | undefined }
);

/** What the caller, not the spec, decides: trusted, so never taken from chart data. */
export interface ChartOptions {
  /** The font every label is measured and drawn in. Defaults to Excalifont. */
  font?: Font | undefined;
}

export const LEGEND_POSITIONS = ['top', 'bottom', 'right', 'none'] as const;

export type LegendPosition = (typeof LEGEND_POSITIONS)[number];

/** Bars stand on the band axis; with `y` as the band axis they are horizontal. */
export interface CartesianAxes {
  x: Axis;
  y: Axis;
  /**
   * A second value axis on the right, for series with `axis: 'y2'`: linear, log or square-root. Needs
   * `x` to be the band axis.
   */
  y2?: LinearAxis | LogAxis | SqrtAxis | undefined;
}

/**
 * The axes of a polar chart: `angle` around the circle and `radius` out from the centre. Each series
 * type says which of them holds its categories.
 */
export interface PolarAxes {
  angle: AngleBandAxis | AngleLinearAxis;
  /** Defaults to a linear axis. */
  radius?: RadiusLinearAxis | RadiusBandAxis | undefined;
}

/** The part of the circle an angle axis takes up. */
export interface Sweep {
  /**
   * Degrees clockwise from the top. Defaults to 0 and 360. `endAngle` must be greater than
   * `startAngle` and at most 360 past it.
   */
  startAngle?: number | undefined;
  endAngle?: number | undefined;
}

/**
 * Categories around the circle: the spokes of a radar chart, the wedges of a rose. On a whole turn
 * the first is at `startAngle`; on part of one each takes an equal share, centred in it.
 */
export interface AngleBandAxis extends Omit<BandAxis, 'title' | 'labelAngle' | 'weights'>, Sweep {}

/** Values around the circle, from the start of the sweep to its end. */
export interface AngleLinearAxis extends Omit<LinearAxis, 'title' | 'percent' | 'labelAngle'>, Sweep {}

/** The hole in the middle, as a share of the radius, from 0 to 0.95. Defaults to 0. */
interface Hole {
  innerRadius?: number | undefined;
}

/** Values out from the centre, from 0 unless `min` is set. */
export interface RadiusLinearAxis extends Omit<LinearAxis, 'title' | 'percent' | 'labelAngle'>, Hole {
  /**
   * Gridlines as polygons through the spokes, or as circles. Defaults to `polygon` when every series
   * is a radar, else `circle`. A polygon needs a band angle axis.
   */
  shape?: 'polygon' | 'circle' | undefined;
}

/** Categories out from the centre, as rings, the first outermost. */
export interface RadiusBandAxis extends Omit<BandAxis, 'title' | 'labelAngle' | 'weights'>, Hole {}

/** The dial of a gauge. Defaults to 0 to 100 over -120 to 120 degrees. */
export interface GaugeAxes {
  angle: GaugeAxis;
}

/**
 * A gauge's dial: values from the start of the sweep to its end, with ticks and labels inside the
 * rim. Without `min` and `max` it reaches from 0 to the values, rounded out to ticks; it shows 0
 * unless `min` or `max` leaves it out. A whole turn
 * (`startAngle` 0, `endAngle` 360) makes a clock or a compass.
 */
export interface GaugeAxis extends Omit<LinearAxis, 'title' | 'percent' | 'grid' | 'labelAngle'>, Sweep {
  /**
   * Coloured stretches of the dial, such as green, amber and red, in order and not overlapping: each
   * `from` below its `to`, and at or above the previous band's `to`. At most 100.
   */
  bands?: readonly GaugeBand[] | undefined;
}

export interface GaugeBand {
  from: number;
  to: number;
  /** As a series' `color`. */
  color: string;
}

/** A cartesian axis. Polar and gauge axes are band or linear only. */
export type Axis = BandAxis | LinearAxis | TimeAxis | LogAxis | SqrtAxis;

export interface BandAxis {
  type: 'band';
  /** 1 to 1,000 names, each unique and at most 100 characters. */
  categories: readonly string[];
  /** Relative Cartesian category widths, one per category, each from 0.000001 to 1000000. */
  weights?: readonly number[] | undefined;
  title?: string | undefined;
  /** Draws neither the axis nor its labels, as in a sparkline. */
  hidden?: boolean | undefined;
  /**
   * Rotates the tick labels, clockwise in degrees from -90 to 90: -45 slants x labels up to the
   * right, ending at their ticks. The axis makes room for the rotated labels. Defaults to 0.
   */
  labelAngle?: number | undefined;
}

export interface LinearAxis {
  type: 'linear';
  title?: string | undefined;
  /**
   * Fixes the end of the axis. By default it is rounded out from the data to a tick. Data beyond a
   * fixed end is an error, and `max` must be greater than `min`.
   */
  min?: number | undefined;
  max?: number | undefined;
  /**
   * Puts a tick at every multiple of this, counted from zero, and rounds free ends out to one, in
   * place of the automatic nice step. A number above 0 with at most 20 decimals that gives at most
   * 1,000 ticks. Not with `ticks`.
   */
  step?: number | undefined;
  /**
   * Puts ticks exactly at these values, increasing and within any fixed end: a number is labelled in
   * the axis format, `{ value, label }` with its own label of at most 100 characters. Free ends reach
   * the outermost tick or value. 1 to 1,000 ticks. Not with `step`.
   */
  ticks?: readonly (number | AxisTick)[] | undefined;
  /**
   * Stacks on this axis show each value as its share of the stack's total. Only bar and area series
   * may use it, on a chart with a band axis.
   */
  percent?: boolean | undefined;
  /** Gridlines across the plot at each tick. Defaults to true, except on `y2`. */
  grid?: boolean | undefined;
  hidden?: boolean | undefined;
  /**
   * Rotates the tick labels, clockwise in degrees from -90 to 90: -45 slants x labels up to the
   * right, ending at their ticks. The axis makes room for the rotated labels. Defaults to 0.
   */
  labelAngle?: number | undefined;
  format?: NumberFormat | undefined;
}

/**
 * Values spaced by their base-10 logarithm, so each power of ten takes the same length: for data
 * that spans several of them. Only values above 0 can be shown, from 1e-20 up; bars, areas and percent
 * stacks stand on 0, so a log axis cannot hold them. Free ends round out to powers of ten. Ticks are at
 * 1, 2 and 5 times the powers of ten, or every one to nine times, or the powers alone, as the length
 * allows; it takes no `step` or `percent`.
 */
export interface LogAxis extends Omit<LinearAxis, 'type' | 'step' | 'percent'> {
  type: 'log';
}

/**
 * Values spaced by their square root, signed so negative values mirror positive ones: the area of a
 * bubble or bar grows with its value. Ticks are a linear axis' ticks. It takes no `percent`.
 */
export interface SqrtAxis extends Omit<LinearAxis, 'type' | 'percent'> {
  type: 'sqrt';
}

export const TIME_UNITS = ['millisecond', 'second', 'minute', 'hour', 'day', 'week', 'month', 'year'] as const;

/** A calendar unit of a time axis' step. */
export type TimeUnit = (typeof TIME_UNITS)[number];

/**
 * Times, in UTC, as ISO 8601 strings ("2026-11-01", "2026-11-01T09:30Z", "2026-11-01T09:30+01:00")
 * or milliseconds since 1970-01-01T00:00Z, from year 0000 to 9999. A date and time must end in `Z`
 * or an offset, since one without would be local time. Ticks fall on calendar boundaries in UTC, weeks
 * starting on Monday, and are labelled without locale data at the coarsest level each falls on:
 * "2026", "Nov", "3 Nov", "09:30". Free ends round out to those boundaries.
 */
export interface TimeAxis {
  type: 'time';
  title?: string | undefined;
  min?: ChartValue | undefined;
  max?: ChartValue | undefined;
  /** A tick on every boundary of `every` (default 1) of `unit`, in place of the automatic choice. */
  step?: { unit: TimeUnit; every?: number | undefined } | undefined;
  /** Ticks exactly at these times, increasing: each a time, or `{ value, label }`. Not with `step`. */
  ticks?: readonly (ChartValue | { value: ChartValue; label?: string | undefined })[] | undefined;
  grid?: boolean | undefined;
  hidden?: boolean | undefined;
  labelAngle?: number | undefined;
  /** `months`: the 12 names its labels give the months, each at most 20 characters. English by default. */
  format?: { months?: readonly string[] | undefined } | undefined;
}

/** A tick at `value` labelled `label` rather than its value. */
export interface AxisTick {
  value: number;
  label?: string | undefined;
}

/** How tick labels and tooltips write numbers. Never locale-dependent, so every engine agrees. */
export interface NumberFormat {
  /**
   * A whole number from 0 to 20. By default, tick labels get the fewest decimals that tell the
   * ticks apart, and tooltips every decimal the value has.
   */
  decimals?: number | undefined;
  /** Defaults to `,`. At most 10 characters. */
  thousands?: string | undefined;
  /** Defaults to `.`. At most 10 characters. */
  decimal?: string | undefined;
  /** At most 10 characters. */
  prefix?: string | undefined;
  /** Defaults to `%` on a `percent` axis. At most 10 characters. */
  suffix?: string | undefined;
}

export const CURVES = ['linear', 'monotone', 'step', 'step-before', 'step-after'] as const;

/**
 * How a line or area joins its points. `monotone` is smooth and never overshoots the data; the steps
 * change value halfway between points (`step`), at the point (`step-before`) or at the next point
 * (`step-after`).
 */
export type Curve = (typeof CURVES)[number];

export const MARKER_SYMBOLS = ['circle', 'square', 'diamond', 'triangle', 'cross', 'star', 'wye', 'tick'] as const;

/** A point's shape, fitted inside its diameter. */
export type MarkerSymbol = (typeof MARKER_SYMBOLS)[number];

/** A geometric symbol or the name of a trusted image supplied to the renderer. */
export type Marker = MarkerSymbol | { image: string };

interface SeriesBase {
  /**
   * Unique in the chart, at most 100 characters. Names the series in the legend and in tooltips.
   */
  name: string;
  /**
   * Overrides the colour picked from the palette: a hex code, a name, `rgb()`, `rgba()`, `hsl()`
   * or `hsla()`, at most 100 characters. A `stroke` or `fill` in the chart's `style` or the
   * series' own replaces it in turn.
   */
  color?: string | undefined;
  /** Core style options for the series' shapes, over the chart's `style`, `color` and `dash`. */
  style?: SketchStyle | undefined;
}

/** A series on a cartesian chart's value axis. */
interface ValueSeries extends SeriesBase {
  /**
   * `y` is the main value axis: the y axis, or the x axis when `y` is the band axis. `y2` is the
   * axis on the right. Defaults to `y`.
   */
  axis?: 'y' | 'y2' | undefined;
}

export interface BarSeries extends ValueSeries {
  type: 'bar';
  /** Show fitted values at marks. Labels can overlap in dense charts. */
  dataLabels?: boolean | undefined;
  /** One value per category; `null` draws no bar. */
  data: readonly (number | null)[];
  /** Bars of series with the same stack name stack; other series stand side by side. */
  stack?: string | undefined;
  shape?: 'rectangle' | 'rounded' | 'pyramid' | undefined;
}

export interface LineSeries extends ValueSeries {
  type: 'line';
  symbol?: Marker | undefined;
  /** Show fitted values at marks. Labels can overlap in dense charts. */
  dataLabels?: boolean | undefined;
  /** One value per category; `null` leaves a gap. */
  data: readonly (number | null)[];
  curve?: Curve | undefined;
  /**
   * Dash and gap lengths, for a dashed line and its legend swatch: `style.strokeLineDash` for short.
   * A `strokeLineDash` in the chart's `style` or the series' own replaces it. As core's
   * `strokeLineDash`: 1 to 16 lengths, adding up to at least 1.
   */
  dash?: readonly number[] | undefined;
}

export interface AreaSeries extends ValueSeries {
  type: 'area';
  /** One value per category; `null` leaves a gap. Stacked values must not be negative. */
  data: readonly (number | null)[];
  stack?: string | undefined;
  /** Areas of one stack must share it. */
  curve?: Curve | undefined;
}

export interface RangeAreaSeries extends ValueSeries {
  type: 'rangeArea';
  /** One `[low, high]` pair per category, high not below low; `null` leaves a gap. */
  data: readonly (readonly [low: number, high: number] | null)[];
  curve?: Curve | undefined;
}

/** An interval per category: floating bars, stems, error bars or endpoint dots. */
export interface IntervalSeries extends ValueSeries {
  type: 'interval';
  /** Show fitted values at marks. Labels can overlap in dense charts. */
  dataLabels?: boolean | undefined;
  /** Endpoints retain their order, including descending intervals; null omits the mark. */
  data: readonly (readonly [from: ChartValue, to: ChartValue] | null)[];
  display?: 'bar' | 'line' | 'error' | 'points' | undefined;
  shape?: 'rectangle' | 'rounded' | 'pyramid' | undefined;
  /** Fraction of the category slot, from 0.05 to 1. Defaults to 0.8. */
  width?: number | undefined;
  /** Overlay the category centre instead of reserving a grouped slot. Defaults to false. */
  overlay?: boolean | undefined;
  fromSymbol?: Marker | undefined;
  toSymbol?: Marker | undefined;
}

/** A timeline's one axis. */
export interface TimelineAxes {
  time?: TimelineAxis | undefined;
}

/**
 * The axis of a timeline: time by default, or linear, laid along its `path`. Ticks are about one
 * per 50 units of the track, labelled on its left, as a time or linear axis labels them.
 */
export type TimelineAxis =
  | (Omit<TimeAxis, 'title' | 'grid' | 'labelAngle'> & { path?: TimelinePath | undefined })
  | (Omit<LinearAxis, 'title' | 'grid' | 'labelAngle' | 'percent'> & { path?: TimelinePath | undefined });

/**
 * The track a timeline is laid along, earliest first: a straight `line` across the chart (the
 * default); a `serpentine` of `rows` (1 to 20, default 3) left to right and back, joined by half
 * turns; a `spiral` of `turns` (1 to 20, default 3) out from `innerRadius` (0 to 0.9 of the radius,
 * default 0.2), clockwise from the top; or a `curve` through 2 to 100 `points`, each `[x, y]` from
 * 0 to 1 across and down the area inside the track's labels, joined by straight segments.
 */
export type TimelinePath =
  | { type: 'line' }
  | { type: 'serpentine'; rows?: number | undefined }
  | { type: 'spiral'; turns?: number | undefined; innerRadius?: number | undefined }
  | { type: 'curve'; points: readonly (readonly [x: number, y: number])[] };

/** A moment of a timeline, or a period from `at` to `to`. */
export interface TimelineEvent {
  at: ChartValue;
  /** After `at`: the event is then a period, drawn as a thick stretch of the track. */
  to?: ChartValue | undefined;
  /** At most 100 characters, in the event's tooltip and, with `dataLabels`, beside it. */
  label?: string | undefined;
}

/** Events and periods along a track: a serpentine, spiral or curve timeline, or a straight one. */
export interface TimelineSeries extends SeriesBase {
  type: 'timeline';
  data: readonly TimelineEvent[];
  /** Writes each event's label beside it, on the right of the track. */
  dataLabels?: boolean | undefined;
}

/** A row's stretch of the value axis, often of time: a task of a Gantt chart, or a milestone. */
export interface XRangeItem {
  /** The category of the band axis the item is in. */
  row: string;
  from: ChartValue;
  /** Where the item ends, after `from`. Without it the item is a milestone: a diamond at `from`. */
  to?: ChartValue | undefined;
  /** At most 100 characters, in the item's tooltip and, with `dataLabels`, on it. */
  label?: string | undefined;
  /** 0 to 1: how much of the item is done, drawn solid along its start. */
  progress?: number | undefined;
}

/**
 * Stretches of a band axis' rows along the value axis: a Gantt chart, an x-range chart or a timeline
 * of periods, with any number of items in a row. Each series takes a slot of its own in every row
 * unless `overlay`. Arrows between items are `arrow` annotations from `[from, row]` to `[to, row]`.
 */
export interface XRangeSeries extends SeriesBase {
  type: 'xRange';
  data: readonly XRangeItem[];
  /** Writes each item's label on it, or past its end where it does not fit. */
  dataLabels?: boolean | undefined;
  shape?: 'rectangle' | 'rounded' | undefined;
  /** Fraction of the row's slot, from 0.05 to 1. Defaults to 0.6. */
  width?: number | undefined;
  /** Overlay the row's centre instead of reserving a grouped slot. Defaults to false. */
  overlay?: boolean | undefined;
}

/** Points joined in their supplied order, including loops and descending x, each read by its axis. */
export interface XYLineSeries extends SeriesBase {
  type: 'xyLine';
  /** Show fitted values at marks. Labels can overlap in dense charts. */
  dataLabels?: boolean | undefined;
  data: readonly (readonly [x: ChartValue, y: ChartValue] | null)[];
  /** Draw a symbol at every supplied point; omitted by default. */
  symbol?: Marker | undefined;
  dash?: readonly number[] | undefined;
  /** Per-edge overrides, one per pair of adjacent slots; null keeps the series style. */
  segments?: readonly ({ color?: string | undefined; width?: number | undefined; dash?: readonly number[] | undefined } | null)[] | undefined;
  /** Width at each point in user units, 0 to 100. Draws a tapered path with round joins/caps. */
  widths?: readonly number[] | undefined;
  /** A continuous paint across the plot, from left to right or bottom to top. */
  gradient?: LinearGradient | undefined;
}

export interface LinearGradient {
  axis: 'x' | 'y';
  /** 2 to 32 stops in strictly increasing order, from 0 to 1; colours are 3, 4, 6 or 8-digit hex codes. */
  stops: readonly { offset: number; color: string }[];
}

/** Supplied confidence intervals, joined by straight edges, each read by its axis. */
export interface XYAreaSeries extends SeriesBase {
  type: 'xyArea';
  /** X must increase strictly within each run; null starts a new run. */
  data: readonly (readonly [x: ChartValue, low: ChartValue, high: ChartValue] | null)[];
  /** Allow crossing boundaries and colour by whether the second boundary is above the first. */
  difference?: { positive: string; negative: string } | undefined;
}

export interface ScatterSeries extends SeriesBase {
  type: 'scatter';
  /** Show fitted values at marks. Labels can overlap in dense charts. */
  dataLabels?: boolean | undefined;
  symbol?: Marker | undefined;
  /** Needs both axes continuous: linear, log, square-root or time. */
  data: readonly (readonly [x: ChartValue, y: ChartValue])[];
}

export interface BubbleSeries extends SeriesBase {
  type: 'bubble';
  /** Show fitted values at marks. Labels can overlap in dense charts. */
  dataLabels?: boolean | undefined;
  symbol?: Marker | undefined;
  /** The size sets each bubble's area and must not be negative. Needs both axes continuous: linear, log, square-root or time. */
  data: readonly (readonly [x: ChartValue, y: ChartValue, size: number])[];
}

export interface PieSlice {
  /** Unique in the pie. A name repeated in another ring of the chart shares its colour and legend entry. */
  name: string;
  /** Not negative; at least one slice is above 0. */
  value: number;
  /**
   * As a series' `color`; a `fill` in the pie's or the chart's `style` replaces it. A slice of the
   * same name in another ring must not give a different one.
   */
  color?: string | undefined;
  /**
   * Pulls the slice out from the centre by this share of the outermost ring's radius: from 0 to 0.5.
   * A slice that is the whole of its pie stays put. Defaults to 0.
   */
  offset?: number | undefined;
  /**
   * Draws the slice out to a radius in proportion to this value, the largest to the full radius: a
   * variable-radius pie. Not negative. Every slice of the pie has one, or none does, and at least one
   * slice with a value above 0 has a radius above 0.
   */
  radius?: number | undefined;
}

/**
 * A pie or donut. Up to 10 pie series in one chart make nested rings, the first outermost; they must
 * share `startAngle` and `endAngle`.
 */
export interface PieSeries extends SeriesBase {
  type: 'pie';
  /** Show fitted values at marks. Labels can overlap in dense charts. */
  dataLabels?: boolean | undefined;
  /** 1 to 1,000 slices. */
  data: readonly PieSlice[];
  /**
   * Where the ring starts and ends, as shares of the outermost ring's radius, which fills the chart:
   * `innerRadius` 0 for a pie and 0.5 for a donut, from 0 to 0.95; `outerRadius` from 0.05 to 1,
   * greater than `innerRadius`. One pie defaults to 0 and 1; nested rings split the radius equally,
   * outermost first.
   */
  innerRadius?: number | undefined;
  outerRadius?: number | undefined;
  /**
   * Degrees clockwise from the top. Defaults to 0 and 360; -90 and 90 make a half donut. `endAngle`
   * must be greater than `startAngle` and at most 360 past it.
   */
  startAngle?: number | undefined;
  endAngle?: number | undefined;
  /**
   * Degrees of space between slices, from 0 to 10. A slice narrower than the space is not drawn but
   * keeps its legend entry. Defaults to 0.
   */
  padAngle?: number | undefined;
  /** Rounds each slice's corners to this radius, in user units, from 0 to 1,000. Defaults to 0. */
  cornerRadius?: number | undefined;
}

export interface RadarSeries extends SeriesBase {
  type: 'radar';
  /**
   * One value per spoke, none negative; or one `[low, high]` pair per spoke, high not below low, for
   * a range radar that fills the band between them.
   */
  data: readonly number[] | readonly (readonly [low: number, high: number])[];
}

/**
 * A Nightingale rose: a bar chart wrapped around a band angle axis, one wedge per category, with
 * the value on the radius. Stacked roses make a wind rose.
 */
export interface RoseSeries extends SeriesBase {
  type: 'rose';
  /** One value per category, none negative; `null` draws no wedge. */
  data: readonly (number | null)[];
  /** As a bar's: wedges of series with the same stack name stack outwards. */
  stack?: string | undefined;
}

/** A bar chart wrapped around: one ring per category of a band radius axis, the value on the angle. */
export interface RadialBarSeries extends SeriesBase {
  type: 'radialBar';
  /** One value per category; `null` draws no bar. */
  data: readonly (number | null)[];
  /** As a bar's: bars of series with the same stack name stack clockwise. */
  stack?: string | undefined;
}

/**
 * A line through one point per category of a band angle axis, the value on the radius, joined
 * straight. On a whole turn with no gap it closes, as a radar does; with gaps, the run that ends the
 * data joins the run that starts it.
 */
export interface PolarLineSeries extends SeriesBase {
  type: 'polarLine';
  /** One value per category, none negative unless the radius axis sets `min`; `null` leaves a gap. */
  data: readonly (number | null)[];
  /** As a line's. */
  dash?: readonly number[] | undefined;
}

/** A polar line filled to the centre, or to the area below it in its stack. */
export interface PolarAreaSeries extends SeriesBase {
  type: 'polarArea';
  /** As a polar line's; stacked values must not be negative. */
  data: readonly (number | null)[];
  stack?: string | undefined;
}

/** Points by angle and radius. Needs both axes to be linear. */
export interface PolarScatterSeries extends SeriesBase {
  type: 'polarScatter';
  /** Show fitted values at marks. Labels can overlap in dense charts. */
  dataLabels?: boolean | undefined;
  symbol?: Marker | undefined;
  data: readonly (readonly [angle: number, radius: number])[];
}

/**
 * One value on a gauge's dial. Several gauge series share the dial: as needles of different lengths,
 * such as the hands of a clock, or as bars in rings from the rim inwards.
 */
export interface GaugeSeries extends SeriesBase {
  type: 'gauge';
  value: number;
  /** A needle from the centre, or a bar along the dial from its start. Defaults to `needle`. */
  display?: 'needle' | 'bar' | undefined;
  /** A needle's length, as a share of the radius: from 0.1 to 1. Defaults to 0.8. */
  length?: number | undefined;
}

export type Series =
  | BarSeries
  | LineSeries
  | AreaSeries
  | RangeAreaSeries
  | IntervalSeries
  | XRangeSeries
  | TimelineSeries
  | XYLineSeries
  | XYAreaSeries
  | ScatterSeries
  | BubbleSeries
  | PieSeries
  | RadarSeries
  | RoseSeries
  | RadialBarSeries
  | PolarLineSeries
  | PolarAreaSeries
  | PolarScatterSeries
  | GaugeSeries;

export type SeriesType = Series['type'];

/** What `layoutChart` returns: everything placed, so the renderers only draw. */
export interface ChartLayout {
  width: number;
  height: number;
  /**
   * `toSvgChart` and `appendChart` also give it to the drawing as its accessible name; a canvas has
   * none.
   */
  title?: string;
  /** The family of the font every label was measured with. */
  family: string;
  /** In painting order. */
  nodes: ChartNode[];
  /** Every label drawn, each once: pass them to `fontFaceCss` to embed only the font files needed. */
  labels: string[];
  /** What the font does not cover, from every label, each once (see `TextExtent.missing`). */
  missing: string[];
}

export type ChartNode =
  | { kind: 'gradient'; sketch: Sketch; from: readonly [number, number]; to: readonly [number, number]; stops: LinearGradient['stops'] }
  | { kind: 'image'; asset: string; x: number; y: number; width: number; height: number }
  | { kind: 'sketch'; sketch: Sketch }
  | { kind: 'text'; text: TextLayout; fill: string }
  | {
      kind: 'mark';
      /** The mark's tooltip, in SVG and the DOM. */
      title: string;
      nodes: ChartNode[];
    };
