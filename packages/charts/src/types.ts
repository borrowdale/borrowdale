import type { Seed, Sketch, SketchStyle } from '@borrowdale/core';
import type { Font, TextLayout } from '@borrowdale/text';

/**
 * A chart, as plain data that can come from JSON. Its series' type picks its coordinate system, and
 * every series must draw in the same one, with that system's axes: `x` and `y` for cartesian
 * series, `angle` (and optionally `radius`) for polar series (radar, rose, radial bar, polar line,
 * area and scatter), optionally `angle` for a gauge, none for a pie.
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
  axes?: CartesianAxes | PolarAxes | GaugeAxes | undefined;
  series: readonly Series[];
}

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
  /** A second value axis on the right, for series with `axis: 'y2'`. Needs `x` to be the band axis. */
  y2?: LinearAxis | undefined;
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
export interface AngleBandAxis extends Omit<BandAxis, 'title' | 'labelAngle'>, Sweep {}

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
export interface RadiusBandAxis extends Omit<BandAxis, 'title' | 'labelAngle'>, Hole {}

/** The dial of a gauge. Defaults to 0 to 100 over -120 to 120 degrees. */
export interface GaugeAxes {
  angle: GaugeAxis;
}

/**
 * A gauge's dial: values from the start of the sweep to its end, with ticks and labels inside the
 * rim. Without `min` and `max` it reaches from 0 to the values, rounded out to ticks. A whole turn
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

export type Axis = BandAxis | LinearAxis;

export interface BandAxis {
  type: 'band';
  /** 1 to 1,000 names, each unique and at most 100 characters. */
  categories: readonly string[];
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
  /** One value per category; `null` draws no bar. */
  data: readonly (number | null)[];
  /** Bars of series with the same stack name stack; other series stand side by side. */
  stack?: string | undefined;
}

export interface LineSeries extends ValueSeries {
  type: 'line';
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

export interface ScatterSeries extends SeriesBase {
  type: 'scatter';
  /** Needs both axes to be linear. */
  data: readonly (readonly [x: number, y: number])[];
}

export interface BubbleSeries extends SeriesBase {
  type: 'bubble';
  /** The size sets each bubble's area and must not be negative. Needs both axes to be linear. */
  data: readonly (readonly [x: number, y: number, size: number])[];
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
  /** Pulls the slice out from the centre by this share of the radius: from 0 to 0.5. Defaults to 0. */
  offset?: number | undefined;
  /**
   * Draws the slice out to a radius in proportion to this value, the largest to the full radius: a
   * variable-radius pie. Not negative. Every slice of the pie has one, or none does.
   */
  radius?: number | undefined;
}

/**
 * A pie or donut. Up to 10 pie series in one chart make nested rings, the first outermost; they must
 * share `startAngle` and `endAngle`.
 */
export interface PieSeries extends SeriesBase {
  type: 'pie';
  /** 1 to 1,000 slices. */
  data: readonly PieSlice[];
  /**
   * Where the ring starts and ends, as shares of the chart's radius: `innerRadius` 0 for a pie and 0.5
   * for a donut, from 0 to 0.95; `outerRadius` from 0.05 to 1, greater than `innerRadius`. One pie
   * defaults to 0 and 1; nested rings split the radius equally, outermost first.
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
  | { kind: 'sketch'; sketch: Sketch }
  | { kind: 'text'; text: TextLayout; fill: string }
  | {
      kind: 'mark';
      /** The mark's tooltip, in SVG and the DOM. */
      title: string;
      nodes: ChartNode[];
    };
