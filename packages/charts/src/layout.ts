import type { SketchStyle } from '@borrowdale/core';
import { layoutCartesian, legendOf } from './cartesian.js';
import { Drawing } from './drawing.js';
import { GAP, PAD, type Rect } from './frame.js';
import { hatched, LINE_WIDTH, paints, type Paint } from './palette.js';
import { layoutGauge } from './gauge.js';
import { layoutPie, layoutPolar, polarLegendOf } from './polar.js';
import { fail } from './read.js';
import type { ChartLayout, ChartOptions, ChartSpec, LegendPosition } from './types.js';
import { checkChart, type CheckedChart } from './validate.js';

const SWATCH = 10;
const SWATCH_GAP = 4;
const ENTRY_SPACING = 14;
const ROW_GAP = 4;
const TITLE_GROWTH = 4;

interface LegendEntry {
  name: string;
  paint: Paint;
  /** A series drawn as a line is shown by a line; anything else by a hatched box. */
  line: boolean;
  dash: number[] | undefined;
  style: SketchStyle;
}

/**
 * Validates a chart and places every part of it: measures all text, picks scales and ticks, and
 * draws every shape. The result is data for the renderers, the same in every JavaScript engine.
 * Throws an error naming the place in the spec for anything that cannot be drawn.
 */
export function layoutChart(spec: ChartSpec, options: ChartOptions = {}): ChartLayout {
  const chart = checkChart(spec, options.font);
  const drawing = new Drawing(chart);
  const entries = legendEntries(chart);

  const rect: Rect = { left: PAD, top: PAD, right: chart.width - PAD, bottom: chart.height - PAD };
  if (chart.title !== undefined) {
    const size = chart.fontSize + TITLE_GROWTH;
    const position = { x: chart.width / 2, y: rect.top, anchor: 'middle' as const, baseline: 'top' as const };
    drawing.push(drawing.text(chart.title, { ...position, fontSize: size }));
    rect.top += drawing.lineHeight(size) + GAP;
  }
  drawLegend(drawing, entries, chart.legend ?? (entries.length >= 2 ? 'top' : 'none'), rect);

  const entryPaints = entries.map((entry) => entry.paint);
  switch (chart.system) {
    case 'cartesian':
      layoutCartesian(drawing, chart, rect, entryPaints);
      break;
    case 'polar':
      layoutPolar(drawing, chart, rect, entryPaints);
      break;
    case 'pie':
      layoutPie(drawing, chart, rect, new Map(entries.map((entry) => [entry.name, entry.paint])));
      break;
    case 'gauge':
      layoutGauge(drawing, chart, rect, entryPaints);
      break;
    default:
      unknownSystem(chart);
  }
  return {
    width: chart.width,
    height: chart.height,
    ...(chart.title === undefined ? {} : { title: chart.title }),
    family: chart.font.family,
    nodes: drawing.nodes,
    labels: drawing.labels,
    missing: drawing.missing,
  };
}

/**
 * One entry per slice name of a pie's rings, in the order they first appear, else one per series,
 * each with its colour and hatching.
 */
function legendEntries(chart: CheckedChart): LegendEntry[] {
  if (chart.system === 'pie') {
    const first = new Map<string, { name: string; color: string | undefined; path: string; style: SketchStyle }>();
    for (const pie of chart.series) {
      pie.data.forEach((slice, i) => {
        if (!first.has(slice.name)) {
          first.set(slice.name, { name: slice.name, color: slice.color, path: `${pie.path}.data[${i}]`, style: pie.style });
        }
      });
    }
    const slices = [...first.values()];
    return paints(slices).map((paint, i) => ({ name: slices[i]!.name, paint, line: false, dash: undefined, style: slices[i]!.style }));
  }
  const lines =
    chart.system === 'cartesian'
      ? chart.series.map((entry) => legendOf(entry) === 'line')
      : chart.system === 'polar'
        ? chart.series.map((entry) => polarLegendOf(entry) === 'line')
        : chart.series.map(() => false);
  const series: readonly CheckedChart['series'][number][] = chart.series;
  return paints(series).map((paint, i) => {
    const entry = series[i]!;
    const dash = entry.type === 'line' || entry.type === 'polarLine' ? entry.dash : undefined;
    return { name: entry.name, paint, line: lines[i]!, dash, style: entry.style };
  });
}

function unknownSystem(chart: never): never {
  throw new Error(`Unknown chart system: ${String((chart as { system?: unknown }).system)}`);
}

/** Draws the legend at its position inside `rect`, and shrinks `rect` to what is left. */
function drawLegend(drawing: Drawing, entries: readonly LegendEntry[], position: LegendPosition, rect: Rect): void {
  if (position === 'none') {
    return;
  }
  const rowHeight = Math.max(drawing.lineHeight(), SWATCH);
  const widths = entries.map((entry) => SWATCH + SWATCH_GAP + drawing.width(entry.name));
  if (position === 'right') {
    // One column, which must fit: unlike a legend above or below, it cannot wrap.
    const height = entries.length * rowHeight + (entries.length - 1) * ROW_GAP;
    if (height > rect.bottom - rect.top) {
      const left = `${Math.floor(rect.bottom - rect.top)} are left`;
      fail('legend', `"right" needs ${Math.ceil(height)} units of height for ${entries.length} entries, but ${left}`);
    }
    const left = rect.right - Math.max(...widths);
    entries.forEach((entry, i) => {
      drawEntry(drawing, entry, left, rect.top + i * (rowHeight + ROW_GAP) + rowHeight / 2);
    });
    rect.right = left - GAP;
    return;
  }
  // Rows from left to right, wrapped to the width available, each centred.
  const rows: number[][] = [];
  widths.forEach((width, i) => {
    const row = rows.at(-1);
    const used = row ? row.reduce((sum, j) => sum + widths[j]! + ENTRY_SPACING, 0) : 0;
    if (row && used + width <= rect.right - rect.left) {
      row.push(i);
    } else {
      rows.push([i]);
    }
  });
  const height = rows.length * rowHeight + (rows.length - 1) * ROW_GAP;
  const top = position === 'top' ? rect.top : rect.bottom - height;
  rows.forEach((row, r) => {
    const rowWidth = row.reduce((sum, i) => sum + widths[i]!, 0) + (row.length - 1) * ENTRY_SPACING;
    let left = (rect.left + rect.right) / 2 - rowWidth / 2;
    for (const i of row) {
      drawEntry(drawing, entries[i]!, left, top + r * (rowHeight + ROW_GAP) + rowHeight / 2);
      left += widths[i]! + ENTRY_SPACING;
    }
  });
  if (position === 'top') {
    rect.top += height + GAP;
  } else {
    rect.bottom -= height + GAP;
  }
}

function drawEntry(drawing: Drawing, entry: LegendEntry, left: number, middle: number): void {
  const key = `legend|${entry.name}`;
  const swatch = entry.line
    ? drawing.shape(
        { kind: 'line', x1: left, y1: middle, x2: left + SWATCH, y2: middle },
        { stroke: entry.paint.color, strokeWidth: LINE_WIDTH, ...(entry.dash ? { strokeLineDash: entry.dash } : {}) },
        key,
        entry.style,
      )
    : drawing.shape(
        { kind: 'rectangle', x: left, y: middle - SWATCH / 2, width: SWATCH, height: SWATCH },
        { ...hatched(entry.paint), hachureGap: 2.5 },
        key,
        entry.style,
      );
  const label = { x: left + SWATCH + SWATCH_GAP, y: middle, anchor: 'start' as const, baseline: 'middle' as const };
  drawing.push(swatch, drawing.text(entry.name, label));
}

