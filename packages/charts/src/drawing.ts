import { Budget, sketch, type Shape, type SketchStyle } from '@borrowdale/core';
import { fitText, layoutText, measureText, textBounds, type LayoutOptions } from '@borrowdale/text';
import { INK } from './palette.js';
import { fail } from './read.js';
import type { ChartNode } from './types.js';
import type { CheckedChart } from './validate.js';
import type { Rect } from './frame.js';

// Bounds the stroke engine's work for the whole chart: twice what one `sketch` call may do. Measured,
// a work unit takes 0.4 to 2.3 µs depending on the fill, so this stays under about a second; 200
// hachure-filled bars use about 130,000 units and 1,000 scatter points about 76,000.
const MAX_OPERATIONS = 400_000;
// Data labels and image markers draw no strokes, so the budget never sees them: this caps them
// instead, at about 3 MB of SVG.
const MAX_PLACED = 10_000;

/** Distances from a point, in each direction. */
export interface Extent {
  left: number;
  right: number;
  up: number;
  down: number;
}

type TextOptions = Omit<LayoutOptions, 'font' | 'fontSize'> & { fontSize?: number | undefined };

// A data label is centred on the point it is drawn at.
export const CENTRED = { anchor: 'middle', baseline: 'middle' } as const;

/** What tells one mark's strokes from another's: its series, category, part and the like. */
export type SeedKey = readonly (string | number)[];

/** Draws shapes and text for one chart, with one budget, and keeps every label it laid out. */
export class Drawing {
  readonly nodes: ChartNode[] = [];
  readonly #chart: CheckedChart;
  readonly #budget = new Budget(MAX_OPERATIONS);
  #placed = 0;
  readonly #labels = new Set<string>();
  readonly #missing = new Set<string>();
  // Measurements by their text and options: layout measures an axis' labels more than once as it
  // fits the plot.
  readonly #widths = new Map<string, number>();
  readonly #extents = new Map<string, Extent>();

  constructor(chart: CheckedChart) {
    this.#chart = chart;
  }

  get labels(): string[] {
    return [...this.#labels];
  }

  get missing(): string[] {
    return [...this.#missing];
  }

  /** The height of one line of text, ascent plus descent. */
  lineHeight(fontSize = this.#chart.fontSize): number {
    const { ascent, descent } = measureText('', { font: this.#chart.font, fontSize });
    return ascent + descent;
  }

  /** How wide `text` is drawn. */
  width(text: string, fontSize = this.#chart.fontSize): number {
    return remembered(
      this.#widths,
      `${fontSize}|${text}`,
      () => measureText(text, { font: this.#chart.font, fontSize }).width,
    );
  }

  /**
   * `text` whole if it is at most `room` wide, else cut short with an ellipsis to fit. Throws for the
   * spec at `path` when not even the ellipsis fits.
   */
  fit(text: string, room: number, path: string, fontSize = this.#chart.fontSize): string {
    const fitted = fitText(text, Math.max(0, room), { font: this.#chart.font, fontSize });
    return fitted ?? fail(path, `does not fit even cut short: there are ${Math.max(0, Math.floor(room))} units for it`);
  }

  /**
   * A shape in its `defaults` style, then the chart's style, then its series' `own` style, seeded
   * from the chart seed and `key`, so a mark keeps its strokes when other marks change. Each part is
   * written with its length, so a separator inside a name never makes two keys alike.
   */
  shape(shape: Shape, defaults: SketchStyle, key: SeedKey, own: SketchStyle = {}): ChartNode {
    return this.#sketch(shape, { ...defaults, ...this.#chart.style, ...own }, key);
  }

  #sketch(shape: Shape, style: SketchStyle, key: SeedKey): ChartNode {
    const seed = [this.#chart.seed, ...key].map((part) => `${String(part).length}:${part}`).join('');
    return { kind: 'sketch', sketch: sketch(shape, { ...style, seed }, this.#budget) };
  }

  /**
   * A shape drawn as an outline only, as `shape` draws it but never filled, whatever fill the chart's
   * or the series' style gives: lines, the edges of areas, gridlines, axes, ticks and tracks.
   */
  outline(shape: Shape, defaults: SketchStyle, key: SeedKey, own: SketchStyle = {}): ChartNode {
    return this.#sketch(shape, { ...defaults, ...this.#chart.style, ...own, fill: 'none' }, key);
  }

  /**
   * How far `text` reaches from the point it is placed at, laid out with `options` and rotated: to
   * the left and right, and up and down. Measures without keeping the label.
   */
  extent(text: string, options: Omit<TextOptions, 'x' | 'y'>): Extent {
    const fontSize = options.fontSize ?? this.#chart.fontSize;
    return remembered(this.#extents, JSON.stringify([{ ...options, fontSize }, text]), () => {
      const { x, y, width, height } = textBounds(
        layoutText(text, { ...options, x: 0, y: 0, font: this.#chart.font, fontSize }),
      );
      return { left: -x, right: x + width, up: -y, down: y + height };
    });
  }

  text(text: string, options: TextOptions): ChartNode {
    const fontSize = options.fontSize ?? this.#chart.fontSize;
    const layout = layoutText(text, { ...options, font: this.#chart.font, fontSize });
    this.#labels.add(layout.text);
    for (const missing of layout.missing) {
      this.#missing.add(missing);
    }
    return { kind: 'text', text: layout, fill: INK };
  }

  /** A centred data label, fitted and kept inside the supplied plotting rectangle. */
  label(text: string, x: number, y: number, rect: Rect, path: string): ChartNode {
    this.#place();
    const spot = this.labelSpot(text, x, y, rect, path);
    return this.text(spot.text, { ...CENTRED, x: spot.x, y: spot.y });
  }

  /**
   * Where `label` draws a label asked for at (x, y): cut to fit across `rect` and moved inside it,
   * with the extent it has there, so a caller can check the room it takes before drawing it.
   */
  labelSpot(text: string, x: number, y: number, rect: Rect, path: string): { text: string; x: number; y: number; extent: Extent } {
    const fitted = this.fit(text, rect.right - rect.left, path);
    const extent = this.extent(fitted, CENTRED);
    if (extent.up + extent.down > rect.bottom - rect.top) fail(path, 'has no vertical room for its label');
    return {
      text: fitted,
      x: Math.max(rect.left + extent.left, Math.min(rect.right - extent.right, x)),
      y: Math.max(rect.top + extent.up, Math.min(rect.bottom - extent.down, y)),
      extent,
    };
  }

  /** A trusted image, named by `asset`, fitted inside the box. */
  image(asset: string, x: number, y: number, width: number, height: number): ChartNode {
    this.#place();
    return { kind: 'image', asset, x, y, width, height };
  }

  #place(): void {
    if (++this.#placed > MAX_PLACED) {
      throw new Error(`Drawing too complex (more than ${MAX_PLACED} data labels and images)`);
    }
  }

  push(...nodes: ChartNode[]): void {
    this.nodes.push(...nodes);
  }

  /** A mark: its nodes, with `title` as its tooltip. */
  mark(title: string, nodes: ChartNode[]): void {
    this.nodes.push({ kind: 'mark', title, nodes });
  }
}

/** The value `known` holds for `key`, measured and kept the first time it is asked for. */
function remembered<T>(known: Map<string, T>, key: string, measure: () => T): T {
  const kept = known.get(key);
  if (kept !== undefined) {
    return kept;
  }
  const value = measure();
  known.set(key, value);
  return value;
}
