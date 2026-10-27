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
  stroke?: string | undefined;
  strokeWidth?: number | undefined;
  fill?: string | undefined;
  fillStyle?: FillStyle | undefined;
  fillWeight?: number | undefined;
  hachureAngle?: number | undefined;
  hachureGap?: number | undefined;
  /** Dash length for the `dashed` fill style. */
  dashOffset?: number | undefined;
  /** Gap between dashes for the `dashed` fill style. */
  dashGap?: number | undefined;
  /** Zigzag width for the `zigzag-line` fill style. */
  zigzagOffset?: number | undefined;
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
  fill: string;
  /** 'evenodd' on the solid fill of polygons, curves and paths: self-intersections leave holes. */
  fillRule?: 'evenodd';
}

export interface Sketch {
  paths: SketchPath[];
}
