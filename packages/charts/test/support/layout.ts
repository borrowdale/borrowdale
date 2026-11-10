// Reading a chart layout back in tests: its marks, texts and the points its shapes pass through.
import { layoutChart, toSvgChart, type ChartLayout, type ChartSpec } from '@borrowdale/charts';
import type { Point } from '@borrowdale/core';
import type { ChartNode } from '../../src/types.js';
import { textBounds } from '@borrowdale/text';
import { PAD } from '../../src/frame.js';

/** Every drawn node, those inside marks included, one level down. */
function drawnNodes(layout: ChartLayout): ChartNode[] {
  return layout.nodes.flatMap((node) => (node.kind === 'mark' ? node.nodes : [node]));
}

/** The mark whose tooltip is `title`. */
export function mark(layout: ChartLayout, title: string): ChartNode {
  const found = layout.nodes.find((node) => node.kind === 'mark' && node.title === title);
  if (!found) {
    throw new Error(`No mark titled ${title}`);
  }
  return found;
}

/** The shapes of a mark, without its tooltip. */
export function shapesOf(layout: ChartLayout, title: string): ChartNode[] {
  const found = mark(layout, title);
  return found.kind === 'mark' ? found.nodes : [];
}

/**
 * The points the drawn shapes pass through: each path's starting points, line ends and the end of
 * each curve, not a curve's control points, which lie off the curve.
 */
export function pointsOnCurves(layout: ChartLayout): [number, number][] {
  const ds = drawnNodes(layout);
  const paths = ds.flatMap((node) => (node.kind === 'sketch' ? node.sketch.paths.map((path) => path.d) : []));
  const onCurve = /(?:[ML]|C[^,]*,[^,]*,)\s*(-?[\d.]+)[ ,](-?[\d.]+)/g;
  return paths.flatMap((d) =>
    [...d.matchAll(onCurve)].map((match): [number, number] => [Number(match[1]), Number(match[2])]),
  );
}

/** How many of those points lie outside the chart, or within `margin` of its edges. */
export function pointsOutside(layout: ChartLayout, margin = 0): number {
  const [right, bottom] = [layout.width - margin, layout.height - margin];
  return pointsOnCurves(layout).filter(([px, py]) => px < margin || py < margin || px > right || py > bottom).length;
}

/** How many labels reach outside the chart's padding. */
export function labelsOutside(layout: ChartLayout): number {
  const drawn = drawnNodes(layout);
  const labels = drawn.flatMap((node) => (node.kind === 'text' ? [textBounds(node.text)] : []));
  const [low, right, bottom] = [PAD - 0.01, layout.width - PAD + 0.01, layout.height - PAD + 0.01];
  return labels.filter((box) => box.x < low || box.y < low || box.x + box.width > right || box.y + box.height > bottom)
    .length;
}

export function titles(layout: ChartLayout): string[] {
  return layout.nodes.flatMap((node) => (node.kind === 'mark' ? [node.title] : []));
}

/** Each pair of drawn texts, in marks or not, whose boxes overlap, as "first / second". */
export function overlappingTexts(layout: ChartLayout): string[] {
  const drawn = drawnNodes(layout);
  const boxes = drawn.flatMap((node) => (node.kind === 'text' ? [{ text: node.text.text, ...textBounds(node.text) }] : []));
  return boxes.flatMap((a, i) =>
    boxes.slice(i + 1).flatMap((b) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height ? [`${a.text} / ${b.text}`] : [],
    ),
  );
}

export function texts(layout: ChartLayout): string[] {
  return layout.nodes.flatMap((node) => (node.kind === 'text' ? [node.text.text] : []));
}

/** A drawn text: the point it was placed at, and the box it covers there. */
export interface PlacedText {
  text: string;
  at: Point;
  box: ReturnType<typeof textBounds>;
}

/** Each drawn text, in marks or not. */
export function placedTexts(layout: ChartLayout): PlacedText[] {
  const drawn = drawnNodes(layout);
  return drawn.flatMap((node) =>
    node.kind === 'text' ? [{ text: node.text.text, at: node.text.pivot, box: textBounds(node.text) }] : [],
  );
}

/** Each drawn `text`, in drawing order. */
export function placedAs(layout: ChartLayout, text: string): PlacedText[] {
  return placedTexts(layout).filter((placed) => placed.text === text);
}

/** Where each drawn `text` was placed, in drawing order. */
export function placesOf(layout: ChartLayout, text: string): Point[] {
  return placedAs(layout, text).map((placed) => placed.at);
}

/** Laying a spec out, to be called by `toThrow`. */
export function laying(spec: unknown): () => ChartLayout {
  return () => layoutChart(spec as ChartSpec);
}

/** The tooltips of a spec's marks, as its SVG writes them. */
export function svgTitles(spec: ChartSpec): string[] {
  return [...toSvgChart(layoutChart(spec)).matchAll(/<title>([^<]*)<\/title>/g)].map((match) => match[1]!);
}
