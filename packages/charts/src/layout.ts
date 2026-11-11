import type { SketchStyle } from '@borrowdale/core';
import { ownOptions } from '@borrowdale/core/internal';
import { layoutCalendar } from './calendar.js';
import { layoutCartesian, legendOf, legendSymbol, type LegendShape } from './cartesian.js';
import type { ColorScale } from './color-scale.js';
import { Drawing } from './drawing.js';
import { GAP, PAD, type Rect } from './frame.js';
import { hatched, INK, LINE_WIDTH, paints, type Paint } from './palette.js';
import { EMPTY_CELL, NO_VALUE } from './marks.js';
import { layoutGauge } from './gauge.js';
import { layoutPie } from './pie.js';
import { layoutPolar, polarLegendOf } from './polar.js';
import { fail } from './read.js';
import { markerNode } from './symbols.js';
import { layoutTimeline } from './timeline.js';
import type { ChartLayout, ChartSpec, LayoutChartOptions, LegendPosition, Marker } from './types.js';
import { encodingOf } from './color-axis.js';
import { checkChart, type CheckedChart } from './validate.js';

const SWATCH = 10;
const SWATCH_GAP = 4;
const ENTRY_SPACING = 14;
const ROW_GAP = 4;
const TITLE_GROWTH = 4;
// The length of a colour axis' ramp in the legend.
const RAMP = 100;
// The paint of a series coloured by value: never drawn, as its cells take the colour axis' colours
// and the legend shows the axis in place of an entry for it.
const BY_VALUE_PAINT: Paint = { color: INK, hachureAngle: 0 };

interface LegendEntry {
  name: string;
  /** Where the name is in the spec. */
  path: string;
  paint: Paint;
  /** A series drawn as a line is shown by a line; anything else by a hatched box. */
  line: boolean;
  dash: number[] | undefined;
  style: SketchStyle;
  symbol?: Marker | undefined;
}

const LAYOUT_OPTIONS: Record<keyof LayoutChartOptions, true> = { font: true };

/**
 * Validates a chart and places every part of it: measures all text, picks scales and ticks, and
 * draws every shape. The result is data for the renderers, the same in every JavaScript engine.
 * Throws an error naming the place in the spec for anything that cannot be drawn.
 */
export function layoutChart(spec: ChartSpec, options: LayoutChartOptions = {}): ChartLayout {
  const { font } = ownOptions(options, LAYOUT_OPTIONS);
  const chart = checkChart(spec, font);
  const drawing = new Drawing(chart);
  const entries = legendEntries(chart);

  const rect: Rect = { left: PAD, top: PAD, right: chart.width - PAD, bottom: chart.height - PAD };
  if (chart.title !== undefined) {
    const size = chart.fontSize + TITLE_GROWTH;
    const position = { x: chart.width / 2, y: rect.top, anchor: 'middle' as const, baseline: 'top' as const };
    const title = drawing.fit(chart.title, rect.right - rect.left, 'title', size);
    drawing.push(drawing.text(title, { ...position, fontSize: size }));
    rect.top += drawing.lineHeight(size) + GAP;
  }
  drawLegend(drawing, chart, entries, rect);

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
    case 'timeline':
      layoutTimeline(drawing, chart, rect, entryPaints);
      break;
    case 'calendar':
      layoutCalendar(drawing, chart, rect);
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
          first.set(slice.name, {
            name: slice.name,
            color: slice.color,
            path: `${pie.path}.data[${i}]`,
            style: pie.style,
          });
        }
      });
    }
    const slices = [...first.values()];
    return paints(slices).map((paint, i) => ({
      name: slices[i]!.name,
      path: `${slices[i]!.path}.name`,
      paint,
      line: false,
      dash: undefined,
      style: slices[i]!.style,
    }));
  }
  const symbolOf = (entry: CheckedChart['series'][number]) => legendSymbol('symbol' in entry ? entry.symbol : undefined);
  const shapes: LegendShape[] =
    chart.system === 'cartesian'
      ? chart.series.map(legendOf)
      : chart.system === 'polar'
        ? chart.series.map((entry) => ({ line: polarLegendOf(entry) === 'line', symbol: symbolOf(entry) }))
        : chart.series.map((entry) => ({ line: false, symbol: symbolOf(entry) }));
  const series: readonly CheckedChart['series'][number][] = chart.series;
  // A series coloured by value takes its colours from the colour axis, so it takes no palette pair.
  const painted = paints(series.filter((entry) => encodingOf(entry) === undefined));
  let next = 0;
  return series.map((entry, i) => {
    const paint = encodingOf(entry) === undefined ? painted[next++]! : BY_VALUE_PAINT;
    const dash = 'dash' in entry ? entry.dash : undefined;
    const { line, symbol } = shapes[i]!;
    return { name: entry.name, path: `${entry.path}.name`, paint, line, dash, style: entry.style, symbol };
  });
}

function unknownSystem(chart: never): never {
  throw new Error(`Unknown chart system: ${String((chart as { system?: unknown }).system)}`);
}

/** One thing the legend shows, as wide as it is drawn: a series' entry, or the colour axis. */
interface LegendItem {
  /** What it shows, as an error about its width names it. */
  what: string;
  width: number;
  draw: (left: number, middle: number) => void;
}

/** A part of a legend item: text, a swatch or a ramp. */
interface Piece {
  width: number;
  draw: (left: number, middle: number) => void;
}

/** Pieces side by side, `SWATCH_GAP` apart: the item is as wide as they are drawn. */
function pieces(what: string, parts: readonly Piece[]): LegendItem {
  const width = parts.reduce((sum, part) => sum + part.width, 0) + (parts.length - 1) * SWATCH_GAP;
  return {
    what,
    width,
    draw: (left, middle) => {
      parts.reduce((at, part) => {
        part.draw(at, middle);
        return at + part.width + SWATCH_GAP;
      }, left);
    },
  };
}

/**
 * What the legend shows at `position` across `across` units: an entry per series not coloured by
 * value, its name cut short to fit, then the colour axis and a "no value" swatch where some cell has
 * none.
 */
function legendItems(
  drawing: Drawing, chart: CheckedChart, shown: readonly LegendEntry[], position: LegendPosition, across: number, missing: boolean,
): LegendItem[] {
  // A legend on the right takes at most half the width: a name too long for its row is cut short.
  const row = position === 'right' ? across / 2 : across;
  const room = row - SWATCH - SWATCH_GAP;
  const items = shown.map((entry): LegendItem => {
    const name = drawing.fit(entry.name, room, entry.path);
    return { what: entry.path, width: SWATCH + SWATCH_GAP + drawing.width(name), draw: (left, middle) => drawEntry(drawing, entry, name, left, middle) };
  });
  if (chart.color) items.push(colorItem(drawing, chart.color, row));
  if (missing) items.push(noValueItem(drawing));
  for (const item of items) {
    if (item.width > row) fail('legend', `needs ${Math.ceil(item.width)} units of width for ${item.what}, but ${Math.floor(row)} are left`);
  }
  return items;
}

/** The colour axis: its title, then a ramp between its end labels, or a swatch per class between boundaries. */
function colorItem(drawing: Drawing, color: ColorScale, row: number): LegendItem {
  const { legend } = color;
  const label = (text: string): Piece => ({
    width: drawing.width(text),
    draw: (left, middle) => {
      if (text !== '') drawing.push(drawing.text(text, { x: left, y: middle, anchor: 'start', baseline: 'middle' }));
    },
  });
  const box = (x: number, middle: number, length: number) =>
    ({ kind: 'rectangle' as const, x, y: middle - SWATCH / 2, width: length, height: SWATCH });
  const parts: Piece[] = [];
  if (legend.kind === 'ramp') {
    const ramp: Piece = {
      width: RAMP,
      draw: (left, middle) => {
        const { sketch } = drawing.shape(box(left, middle, RAMP), { stroke: '#000000', fill: '#000000', fillStyle: 'solid' }, ['legend', 'colorAxis']);
        drawing.push({ kind: 'gradient', sketch, from: [left, middle], to: [left + RAMP, middle], stops: legend.stops });
      },
    };
    parts.push(label(legend.labels[0]), ramp, label(legend.labels[1]));
  } else {
    legend.colors.forEach((fill, i) => {
      parts.push(label(legend.labels[i]!), {
        width: SWATCH,
        draw: (left, middle) => drawing.push(drawing.shape(box(left, middle, SWATCH), { stroke: fill, fill, fillStyle: 'solid' }, ['legend', 'colorAxis', i])),
      });
    });
    parts.push(label(legend.labels.at(-1)!));
  }
  if (color.title === undefined) return pieces('the colour axis', parts);
  // The title takes what the scale leaves of the row, cut short as other titles are.
  const scale = pieces('the colour axis', parts).width;
  return pieces('the colour axis', [label(drawing.fit(color.title, row - scale - SWATCH_GAP, 'colorAxis.title')), ...parts]);
}

/** An outlined, empty swatch: what a cell with no value is drawn as. */
function noValueItem(drawing: Drawing): LegendItem {
  return pieces(`the "${NO_VALUE}" swatch`, [
    {
      width: SWATCH,
      draw: (left, middle) => drawing.push(drawing.outline(
        { kind: 'rectangle', x: left, y: middle - SWATCH / 2, width: SWATCH, height: SWATCH }, EMPTY_CELL, ['legend', NO_VALUE])),
    },
    {
      width: drawing.width(NO_VALUE),
      draw: (left, middle) => drawing.push(drawing.text(NO_VALUE, { x: left, y: middle, anchor: 'start', baseline: 'middle' })),
    },
  ]);
}

/**
 * Draws the legend at its position inside `rect`, and shrinks `rect` to what is left. It defaults to
 * the top with two or more items, or a colour axis, and to none otherwise.
 */
function drawLegend(drawing: Drawing, chart: CheckedChart, entries: readonly LegendEntry[], rect: Rect): void {
  // A pie's entries are its slices; every other chart's are its series, less those coloured by value.
  const encodings = chart.system === 'pie' ? [] : chart.series.map(encodingOf);
  const shown = entries.filter((_, i) => encodings[i] === undefined);
  const missing = encodings.some((encoding) => encoding?.missing);
  const count = shown.length + (chart.color ? 1 : 0) + (missing ? 1 : 0);
  const position = chart.legend ?? (count >= 2 || chart.color ? 'top' : 'none');
  if (position === 'none') {
    return;
  }
  const items = legendItems(drawing, chart, shown, position, rect.right - rect.left, missing);
  const rowHeight = Math.max(drawing.lineHeight(), SWATCH);
  const widths = items.map((item) => item.width);
  if (position === 'right') {
    // One column, which must fit: unlike a legend above or below, it cannot wrap.
    const height = items.length * rowHeight + (items.length - 1) * ROW_GAP;
    if (height > rect.bottom - rect.top) {
      const left = `${Math.floor(rect.bottom - rect.top)} are left`;
      fail('legend', `"right" needs ${Math.ceil(height)} units of height for ${items.length} entries, but ${left}`);
    }
    const left = rect.right - Math.max(...widths);
    items.forEach((item, i) => {
      item.draw(left, rect.top + i * (rowHeight + ROW_GAP) + rowHeight / 2);
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
      items[i]!.draw(left, top + r * (rowHeight + ROW_GAP) + rowHeight / 2);
      left += widths[i]! + ENTRY_SPACING;
    }
  });
  if (position === 'top') {
    rect.top += height + GAP;
  } else {
    rect.bottom -= height + GAP;
  }
}

function drawEntry(drawing: Drawing, entry: LegendEntry, name: string, left: number, middle: number): void {
  const key = ['legend', entry.name];
  const swatch = entry.line
    ? drawing.outline(
        { kind: 'line', x1: left, y1: middle, x2: left + SWATCH, y2: middle },
        { stroke: entry.paint.color, strokeWidth: LINE_WIDTH, ...(entry.dash ? { strokeLineDash: entry.dash } : {}) },
        key,
        entry.style,
      )
    : entry.symbol
      ? markerNode(drawing, entry.symbol, [left + SWATCH / 2, middle], SWATCH,
          { ...hatched(entry.paint), hachureGap: 2.5 }, key, entry.style)
      : drawing.shape(
        { kind: 'rectangle', x: left, y: middle - SWATCH / 2, width: SWATCH, height: SWATCH },
        { ...hatched(entry.paint), hachureGap: 2.5 },
        key,
        entry.style,
      );
  const label = { x: left + SWATCH + SWATCH_GAP, y: middle, anchor: 'start' as const, baseline: 'middle' as const };
  drawing.push(swatch, drawing.text(name, label));
}
