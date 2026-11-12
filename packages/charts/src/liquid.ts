// Lays out a liquid fill: the container's outline, the liquid up to its level under a wave, cut to a
// circle by the circle's own edge, and the level written in the middle.
import type { Point, Shape } from '@borrowdale/core';
import { sin } from '@borrowdale/core/math';
import type { Drawing } from './drawing.js';
import { assertRoom, type Rect } from './frame.js';
import { hatched, type Paint } from './palette.js';
import { formatNumber, PLAIN_FORMAT } from './scale.js';
import type { CheckedLiquidChart } from './liquid-series.js';

/** Points along the surface: a whole number of them to every quarter wave, for 1 to `MAX_WAVES` waves. */
const SAMPLES = 240;
/** How far the surface rises and falls, as a share of the container's smaller side. */
const AMPLITUDE = 0.02;

/** `paints` holds the series' legend paint. */
export function layoutLiquid(drawing: Drawing, chart: CheckedLiquidChart, rect: Rect, paints: readonly Paint[]): void {
  assertRoom(rect, chart.width, chart.height);
  const liquid = chart.series[0]!;
  const paint = paints[0]!;
  const circle = liquid.shape === 'circle';
  const radius = Math.min(rect.right - rect.left, rect.bottom - rect.top) / 2;
  const [cx, cy] = [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2];
  const box = circle ? { left: cx - radius, right: cx + radius, top: cy - radius, bottom: cy + radius } : rect;
  const [width, height] = [box.right - box.left, box.bottom - box.top];
  const level = box.bottom - liquid.value * height;
  // An empty or full container has a flat surface.
  const rise = liquid.value > 0 && liquid.value < 1 ? AMPLITUDE * Math.min(width, height) : 0;
  const xs = Array.from({ length: SAMPLES + 1 }, (_, i) => box.left + (i * width) / SAMPLES);
  const surface = (x: number) => level + rise * sin((2 * Math.PI * liquid.waves * (x - box.left)) / width);
  // The container's top and foot at x: a circle's edge, or the rect's. The liquid lies between the
  // higher of its surface and the container's top, and the container's foot.
  const rims = xs.map((x): [number, number, number] => {
    const half = Math.sqrt(Math.max(0, radius * radius - (x - cx) * (x - cx)));
    return circle ? [x, cy - half, cy + half] : [x, box.top, box.bottom];
  });
  const tops = rims.map(([x, top, foot]): Point => [x, Math.min(Math.max(surface(x), top), foot)]);
  const feet = rims.map(([x, , foot]): Point => [x, foot]).reverse();
  const container: Shape = circle
    ? { kind: 'circle', cx, cy, diameter: 2 * radius }
    : { kind: 'rectangle', x: box.left, y: box.top, width, height };
  const percent = `${formatNumber(liquid.value * 100, 0, PLAIN_FORMAT)}%`;
  const key = [liquid.name, 'liquid'];
  drawing.mark(`${liquid.name}: ${percent}`, [
    ...(liquid.value > 0 ? [drawing.shape({ kind: 'polygon', points: [...tops, ...feet] }, hatched(paint), key, liquid.style)] : []),
    drawing.outline(container, { stroke: paint.color }, [liquid.name, 'container'], liquid.style),
    drawing.label(percent, cx, cy, rect, `${liquid.path}.value`),
  ]);
}
