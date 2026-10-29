import type { Seed, Sketch, SketchStyle } from '@borrowdale/core';
import type { Font, TextLayout } from '@borrowdale/text';

/**
 * A chart, as plain data that can come from JSON. Its series' type picks its coordinate system, and
 * every series must draw in the same one, with that system's axes: `x` and `y` for cartesian
 * series, `angle` (and optionally `radius`) for radar series, none for a pie.
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
  axes?: CartesianAxes | PolarAxes | undefined;
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

export interface PolarAxes {
  /** The spokes of a radar chart, clockwise from the top: at least 3. */
  angle: Omit<BandAxis, 'title'>;
  /** Starts at 0 unless `min` is set. */
  radius?: Omit<LinearAxis, 'title' | 'percent'> | undefined;
}

export type Axis = BandAxis | LinearAxis;

export interface BandAxis {
  type: 'band';
  /** 1 to 1,000 names, each unique and at most 100 characters. */
  categories: readonly string[];
  title?: string | undefined;
  /** Draws neither the axis nor its labels, as in a sparkline. */
  hidden?: boolean | undefined;
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
  /** Unique in the pie. */
  name: string;
  /** Not negative; at least one slice is above 0. */
  value: number;
  /** As a series' `color`; a `fill` in the pie's or the chart's `style` replaces it. */
  color?: string | undefined;
}

export interface PieSeries extends SeriesBase {
  type: 'pie';
  /** 1 to 1,000 slices. */
  data: readonly PieSlice[];
  /**
   * The hole, as a share of the radius: 0 for a pie, 0.5 for a donut. From 0 to 0.95.
   * Defaults to 0.
   */
  innerRadius?: number | undefined;
  /**
   * Degrees clockwise from the top. Defaults to 0 and 360; -90 and 90 make a half donut. `endAngle`
   * must be greater than `startAngle` and at most 360 past it.
   */
  startAngle?: number | undefined;
  endAngle?: number | undefined;
}

export interface RadarSeries extends SeriesBase {
  type: 'radar';
  /** One value per spoke, none negative. */
  data: readonly number[];
}

export type Series =
  | BarSeries
  | LineSeries
  | AreaSeries
  | RangeAreaSeries
  | ScatterSeries
  | BubbleSeries
  | PieSeries
  | RadarSeries;

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
