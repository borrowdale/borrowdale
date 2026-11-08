export type Point = readonly [x: number, y: number];

export type Shape =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'rectangle'; x: number; y: number; width: number; height: number }
  | { kind: 'ellipse'; cx: number; cy: number; width: number; height: number }
  | { kind: 'circle'; cx: number; cy: number; diameter: number }
  | {
      kind: 'arc';
      cx: number;
      cy: number;
      width: number;
      height: number;
      start: number;
      stop: number;
      closed?: boolean;
    }
  | { kind: 'polygon'; points: readonly Point[] }
  | { kind: 'linearPath'; points: readonly Point[] }
  | { kind: 'curve'; points: readonly Point[] }
  | { kind: 'path'; d: string };

export type ShapeKind = Shape['kind'];

export const FILL_STYLES = [
  'hachure',
  'solid',
  'zigzag',
  'cross-hatch',
  'dashed',
  'zigzag-line',
  'dots',
] as const;

export type FillStyle = (typeof FILL_STYLES)[number];

export interface SketchStyle {
  /** A colour (a hex code, a name, `rgb()` or `hsl()`) or `url(#id)`, at most 100 characters. */
  stroke?: string | undefined;
  /** From 0 to 1,000,000. Defaults to 1. */
  strokeWidth?: number | undefined;
  /** Dash and gap lengths along the outline, as in SVG `stroke-dasharray`. Solid when omitted. */
  strokeLineDash?: readonly number[] | undefined;
  /** A colour (a hex code, a name, `rgb()` or `hsl()`) or `url(#id)`, at most 100 characters. */
  fill?: string | undefined;
  fillStyle?: FillStyle | undefined;
  /** Width of fill strokes, from 0 to 1,000,000. Defaults to half the stroke width. */
  fillWeight?: number | undefined;
  hachureAngle?: number | undefined;
  /** Distance between fill lines, from 0 to 1,000,000. Defaults to four stroke widths. */
  hachureGap?: number | undefined;
  /** Dash length for the `dashed` fill style, from 0 to 1,000,000. Defaults to the hachure gap. */
  dashLength?: number | undefined;
  /** Gap between dashes for the `dashed` fill style, from 0 to 1,000,000. Defaults to the hachure gap. */
  dashGap?: number | undefined;
  /** Zigzag width for the `zigzag-line` fill style, from 0 to 1,000,000. Defaults to the hachure gap. */
  zigzagWidth?: number | undefined;
  /** How tightly a `curve` follows its points, from 0 (loose) to 1 (straight segments). */
  curveTightness?: number | undefined;
  /** How closely curves, ellipses, circles and arcs follow their ideal outline, from 0 to 1. */
  curveFitting?: number | undefined;
  /** Number of points sampled along curves, ellipses, circles and arcs. */
  curveStepCount?: number | undefined;
  roughness?: number | undefined;
  bowing?: number | undefined;
}

/** Any value that identifies a drawing. The same seed always produces the same strokes. */
export type Seed = string | number;

export interface SketchOptions extends SketchStyle {
  /** Defaults to the shape itself, so an unchanged shape redraws identically. */
  seed?: Seed | undefined;
}

export interface SketchPath {
  d: string;
  stroke: string;
  strokeWidth: number;
  /** On outlines drawn with the `strokeLineDash` option: dash and gap lengths. */
  strokeLineDash?: number[];
  fill: string;
  /** 'evenodd' on the solid fill of polygons, curves and paths: self-intersections leave holes. */
  fillRule?: 'evenodd';
}

export interface Sketch {
  paths: SketchPath[];
}
