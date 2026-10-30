// The axes of a chart with x and y axes: their labels measured, the room they take beside the plot,
// and their lines, ticks, gridlines, labels and titles.
import type { Shape } from '@borrowdale/core';
import { cos, sin } from '@borrowdale/core/math';
import type { TextAnchor, TextBaseline } from '@borrowdale/text';
import type { CheckedAxis } from './check-axis.js';
import type { Drawing, Extent } from './drawing.js';
import { assertRoom, BAND_PADDING, GAP, TICK, type Rect } from './frame.js';
import { GRID, GRID_WIDTH, INK } from './palette.js';
import { fail } from './read.js';
import { bandScale, type BandScale, type PlacedScale, type Scale } from './scale.js';

/** A cartesian chart's axes: the x axis, the y axis and the second y axis. */
export type AxisKey = 'x' | 'y' | 'y2';

export type Side = 'bottom' | 'left' | 'right';

/** An axis as drawn at one side of the plot: its labels, measured once. */
export interface Guide {
  side: Side;
  key: AxisKey;
  axis: CheckedAxis;
  /** Tick labels of a linear axis, or the categories of a band axis. */
  labels: readonly string[];
  /** How far its labels reach out from the axis, beyond the tick and the gap. */
  reach: number;
  /** How much room a label needs along the axis, to thin out labels that would overlap. */
  room: number;
  /** How far its end labels reach past the ends of the axis: left and right, or up and down. */
  ends: Extent;
  /** How a label sits at its tick, over the side's own placing: rotated labels' anchor and turn. */
  style: Partial<ReturnType<typeof labelStyle>>;
  /** How far the axis reaches out from the plot: tick, gap, labels and title. */
  depth: number;
}

/** The room an axis' labels need below the plot and above and below its ends. */
export interface Reserve {
  bottom: number;
  up: number;
  down: number;
}

export function reserveFor(guides: readonly Guide[]): Reserve {
  const [below, ...sides] = guides;
  const shown = sides.filter((side) => !side.axis.hidden);
  return {
    bottom: below!.axis.hidden ? 0 : below!.depth,
    up: Math.max(0, ...shown.map((side) => side.ends.up)),
    down: Math.max(0, ...shown.map((side) => side.ends.down)),
  };
}

const NO_ENDS: Extent = { left: 0, right: 0, up: 0, down: 0 };

/**
 * An axis at one side of the plot with its labels measured. Flat labels take one line below the plot
 * and the widest label's width beside it; a linear axis' end labels, centred on its end ticks, reach
 * half their width past the ends below the plot, and half a line beside it, while a band axis' sit
 * inside. Rotated labels take their rotated bounds. Every label's tick is within the plot, so the
 * plot leaves room past its ends for the furthest any label reaches either way: the most a label may
 * need, which leaves room to spare for all but the end ones.
 */
export function guide(
  side: Side,
  key: AxisKey,
  axis: CheckedAxis,
  scale: Scale | undefined,
  drawing: Drawing,
  line: number,
): Guide {
  const labels = axis.type === 'band' ? axis.categories : scale!.labels;
  const angle = axis.labelAngle;
  const [first, last] = [labels[0] ?? '', labels.at(-1) ?? ''];
  const shown = (ends: Extent): Extent => (axis.hidden ? NO_ENDS : ends);
  if (angle === 0) {
    const widest = Math.max(0, ...labels.map((label) => drawing.width(label)));
    const reach = side === 'bottom' ? line : widest;
    const ends =
      axis.type === 'band'
        ? NO_ENDS
        : side === 'bottom'
          ? { ...NO_ENDS, left: drawing.width(first) / 2, right: drawing.width(last) / 2 }
          : { ...NO_ENDS, up: line / 2, down: line / 2 };
    const room = SIDES[side].room(widest, line);
    return { side, key, axis, labels, reach, room, ends: shown(ends), style: {}, depth: depthOf(reach, axis, line) };
  }
  const style = labelStyle(side, angle);
  const extents = labels.map((label) => drawing.extent(label, style));
  const most = (of: (extent: Extent) => number): number => Math.max(0, ...extents.map(of));
  const reach = most((extent) => (side === 'bottom' ? extent.down : side === 'left' ? extent.left : extent.right));
  // Along the axis, a slanted label needs its line height divided by the sine of its slant to clear
  // the next one, or its whole extent, whichever is less.
  const radians = (angle * Math.PI) / 180;
  const room =
    side === 'bottom'
      ? Math.min(
          most((extent) => extent.left + extent.right),
          line / Math.abs(sin(radians)),
        ) + GAP
      : Math.min(
          most((extent) => extent.up + extent.down),
          line / Math.abs(cos(radians)),
        ) +
        GAP / 2;
  const ends =
    side === 'bottom'
      ? { ...NO_ENDS, left: most((extent) => extent.left), right: most((extent) => extent.right) }
      : { ...NO_ENDS, up: most((extent) => extent.up), down: most((extent) => extent.down) };
  return { side, key, axis, labels, reach, room, ends: shown(ends), style, depth: depthOf(reach, axis, line) };
}

/** How a rotated label is anchored at its tick: ending there on the left of it, starting there on the right. */
function labelStyle(side: Side, angle: number): { anchor: TextAnchor; baseline: TextBaseline; rotate: number } {
  switch (side) {
    case 'bottom':
      return { anchor: angle < 0 ? 'end' : 'start', baseline: 'top', rotate: angle };
    case 'left':
      return { anchor: 'end', baseline: 'middle', rotate: angle };
    case 'right':
      return { anchor: 'start', baseline: 'middle', rotate: angle };
  }
}

// How far an axis reaches out from the plot: tick, gap, its labels' `reach` and its title.
function depthOf(reach: number, axis: CheckedAxis, line: number): number {
  return TICK + GAP + reach + titleDepth(axis, line);
}

function titleDepth(axis: CheckedAxis, line: number): number {
  return axis.title === undefined ? 0 : GAP + line;
}

interface SideRules {
  /** The axis line, along the plot's edge. */
  edge: (plot: Rect) => [number, number, number, number];
  /** A tick mark at position `at` on the axis. */
  tick: (plot: Rect, at: number) => [number, number, number, number];
  /** A gridline across the plot at `at`. */
  grid: (plot: Rect, at: number) => [number, number, number, number];
  /** Where a label goes, at position `at`. */
  label: (plot: Rect, at: number) => { x: number; y: number; anchor: TextAnchor; baseline: TextBaseline };
  /** How much room a label needs along the axis, to thin out labels that would overlap. */
  room: (widest: number, line: number) => number;
  /** Where the title goes, beyond the labels; side titles are rotated to read along the axis. */
  title: (plot: Rect, reach: number, line: number) => { x: number; y: number; rotate: number };
}

const SIDES: Record<Side, SideRules> = {
  bottom: {
    edge: (p) => [p.left, p.bottom, p.right, p.bottom],
    tick: (p, at) => [at, p.bottom, at, p.bottom + TICK],
    grid: (p, at) => [at, p.bottom, at, p.top],
    label: (p, at) => ({ x: at, y: p.bottom + TICK + GAP, anchor: 'middle', baseline: 'top' }),
    room: (widest) => widest + GAP,
    title: (p, reach) => ({ x: (p.left + p.right) / 2, y: p.bottom + TICK + GAP + reach + GAP, rotate: 0 }),
  },
  left: {
    edge: (p) => [p.left, p.top, p.left, p.bottom],
    tick: (p, at) => [p.left, at, p.left - TICK, at],
    grid: (p, at) => [p.left, at, p.right, at],
    label: (p, at) => ({ x: p.left - TICK - GAP, y: at, anchor: 'end', baseline: 'middle' }),
    room: (_widest, line) => line + GAP / 2,
    // Read from bottom to top; once rotated its line height is its width.
    title: (p, reach, line) => ({
      x: p.left - TICK - GAP - reach - GAP - line,
      y: (p.top + p.bottom) / 2,
      rotate: -90,
    }),
  },
  right: {
    edge: (p) => [p.right, p.top, p.right, p.bottom],
    tick: (p, at) => [p.right, at, p.right + TICK, at],
    grid: (p, at) => [p.left, at, p.right, at],
    label: (p, at) => ({ x: p.right + TICK + GAP, y: at, anchor: 'start', baseline: 'middle' }),
    room: (_widest, line) => line + GAP / 2,
    title: (p, reach, line) => ({
      x: p.right + TICK + GAP + reach + GAP + line,
      y: (p.top + p.bottom) / 2,
      rotate: 90,
    }),
  },
};

function lineShape([x1, y1, x2, y2]: [number, number, number, number]): Shape {
  return { kind: 'line', x1, y1, x2, y2 };
}

export function drawGrid(
  drawing: Drawing,
  plot: Rect,
  { side, key, axis }: Guide,
  scale: PlacedScale | undefined,
): void {
  if (axis.type !== 'linear' || axis.hidden || !axis.grid) {
    return;
  }
  for (const tick of scale!.ticks) {
    const shape = lineShape(SIDES[side].grid(plot, scale!.at(tick)));
    drawing.push(drawing.outline(shape, { stroke: GRID, strokeWidth: GRID_WIDTH }, ['grid', key, tick]));
  }
}

export function drawGuide(
  drawing: Drawing,
  plot: Rect,
  guide: Guide,
  scale: PlacedScale | undefined,
  bands: BandScale | undefined,
  line: number,
): void {
  const { side, key, axis, labels, reach, room } = guide;
  if (axis.hidden) {
    return;
  }
  const rules = SIDES[side];
  const ink = { stroke: INK, strokeWidth: 1 };
  const every = (spacing: number): number => labelEvery(room, spacing);
  const label = (at: number) => ({ ...rules.label(plot, at), ...guide.style });
  drawing.push(drawing.outline(lineShape(rules.edge(plot)), ink, ['axis', key]));
  if (axis.type === 'linear') {
    // Ticks are evenly spaced, and a lone tick has nothing to overlap.
    const [first, second] = scale!.ticks;
    const nth = every(second === undefined ? Infinity : Math.abs(scale!.at(second) - scale!.at(first!)));
    scale!.ticks.forEach((tick, i) => {
      const at = scale!.at(tick);
      drawing.push(drawing.outline(lineShape(rules.tick(plot, at)), ink, ['tick', key, tick]));
      if (i % nth === 0) {
        drawing.push(drawing.text(labels[i]!, label(at)));
      }
    });
  } else {
    const nth = every(bands!.step);
    labels.forEach((name, i) => {
      if (i % nth === 0) {
        drawing.push(drawing.text(name, label(bands!.start(i) + bands!.bandwidth / 2)));
      }
    });
  }
  if (axis.title !== undefined) {
    // Along the side it is on, as long as the plot.
    const room = side === 'bottom' ? plot.right - plot.left : plot.bottom - plot.top;
    const title = drawing.fit(axis.title, room, `${axis.path}.title`);
    drawing.push(drawing.text(title, { ...rules.title(plot, reach, line), anchor: 'middle', baseline: 'top' }));
  }
}

// How many times the plot is narrowed to keep a band axis' end labels on the chart.
const MAX_REFITS = 20;
// How far a label may reach past the chart's padding through rounding: positions are written with
// two decimals.
const LABEL_ROUNDING = 0.005;

/**
 * The plot narrowed so that the end labels of its flat band axis stay inside `rect`. Band labels are
 * centred on their bands, so the first and last shown can reach past the ends of the axis. Each time
 * the plot is narrowed by what they still reach out, which narrows the bands and moves the labels out
 * again, but by less, until they fit. A lone label wider than the chart never fits, and throws.
 */
export function fitBandEnds(
  plot: Rect,
  guides: readonly Guide[],
  rect: Rect,
  halfOf: (label: string, side: Side) => number,
  chart: { width: number; height: number },
): Rect {
  const guide = guides.find(({ axis }) => axis.type === 'band' && !axis.hidden && axis.labelAngle === 0);
  if (!guide) {
    return plot;
  }
  const { labels, room, side } = guide;
  const [start, end] = side === 'bottom' ? (['left', 'right'] as const) : (['top', 'bottom'] as const);
  let fitted = plot;
  for (let refit = 0; refit <= MAX_REFITS; refit++) {
    assertRoom(fitted, chart.width, chart.height);
    const bands = bandScale(labels.length, [fitted[start], fitted[end]], BAND_PADDING);
    const every = labelEvery(room, bands.step);
    const last = Math.floor((labels.length - 1) / every) * every;
    const center = (i: number): number => bands.start(i) + bands.bandwidth / 2;
    const before = rect[start] - (center(0) - halfOf(labels[0]!, side));
    const after = center(last) + halfOf(labels[last]!, side) - rect[end];
    if (before <= LABEL_ROUNDING && after <= LABEL_ROUNDING) {
      return fitted;
    }
    fitted = { ...fitted, [start]: fitted[start] + Math.max(0, before), [end]: fitted[end] - Math.max(0, after) };
  }
  return fail(`a ${chart.width} × ${chart.height} chart`, `leaves no room for the end labels of ${guide.axis.path}`);
}

/** How many labels `spacing` apart to step over, to keep one that does not overlap the last. */
function labelEvery(room: number, spacing: number): number {
  return Math.max(1, Math.ceil(room / spacing));
}
