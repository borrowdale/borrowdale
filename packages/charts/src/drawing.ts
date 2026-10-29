import { Budget, sketch, type Shape, type SketchStyle } from '@borrowdale/core';
import { layoutText, measureText, textBounds, type LayoutOptions } from '@borrowdale/text';
import { INK } from './palette.js';
import type { ChartNode } from './types.js';
import type { CheckedChart } from './validate.js';

// Bounds the stroke engine's work for the whole chart: twice what one `sketch` call may do. Measured,
// a work unit takes 0.4 to 2.3 µs depending on the fill, so this stays under about a second; 200
// hachure-filled bars use about 130,000 units and 1,000 scatter points about 76,000.
const MAX_OPERATIONS = 400_000;

/** Distances from a point, in each direction. */
export interface Extent {
  left: number;
  right: number;
  up: number;
  down: number;
}

type TextOptions = Omit<LayoutOptions, 'font' | 'fontSize'> & { fontSize?: number | undefined };

/** Draws shapes and text for one chart, with one budget, and keeps every label it laid out. */
export class Drawing {
  readonly nodes: ChartNode[] = [];
  readonly #chart: CheckedChart;
  readonly #budget = new Budget(MAX_OPERATIONS);
  readonly #labels = new Set<string>();
  readonly #missing = new Set<string>();

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

  width(text: string, fontSize = this.#chart.fontSize): number {
    return measureText(text, { font: this.#chart.font, fontSize }).width;
  }

  /**
   * A shape in its `defaults` style, then the chart's style, then its series' `own` style, seeded
   * from the chart seed and `key`, so a mark keeps its strokes when other marks change.
   */
  shape(shape: Shape, defaults: SketchStyle, key: string, own: SketchStyle = {}): ChartNode {
    const seed = `${this.#chart.seed}|${key}`;
    const style = { ...defaults, ...this.#chart.style, ...own, seed };
    return { kind: 'sketch', sketch: sketch(shape, style, this.#budget) };
  }

  /**
   * How far `text` reaches from the point it is placed at, laid out with `options` and rotated: to
   * the left and right, and up and down. Measures without keeping the label.
   */
  extent(text: string, options: Omit<TextOptions, 'x' | 'y'>): Extent {
    const fontSize = options.fontSize ?? this.#chart.fontSize;
    const { x, y, width, height } = textBounds(layoutText(text, { ...options, x: 0, y: 0, font: this.#chart.font, fontSize }));
    return { left: -x, right: x + width, up: -y, down: y + height };
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

  push(...nodes: ChartNode[]): void {
    this.nodes.push(...nodes);
  }

  /** A mark: its nodes, with `title` as its tooltip. */
  mark(title: string, nodes: ChartNode[]): void {
    this.nodes.push({ kind: 'mark', title, nodes });
  }
}
