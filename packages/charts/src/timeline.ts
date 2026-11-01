// A timeline: one time or linear axis laid along a track (a line, a serpentine, a spiral or a
// curve), with each series' moments and periods placed along it by arc length.
import type { Point, Shape } from '@borrowdale/core';
import { cos, sin } from '@borrowdale/core/math';
import type { Drawing, Extent } from './drawing.js';
import { assertRoom, GAP, TICK, type Rect } from './frame.js';
import { fail } from './read.js';
import { POINT_SIZE, solid } from './marks.js';
import { INK, type Paint } from './palette.js';
import { formatAxisValue, scaleOf } from './scale.js';
import { markerNode } from './symbols.js';
import type { ChartNode } from './types.js';
import type { CheckedTimelineChart } from './validate.js';

// Points per half turn of a serpentine, and per whole turn of a spiral.
const HALF_TURN_POINTS = 16;
const TURN_POINTS = 64;
// How thick a period is drawn along the track, and the track itself.
const PERIOD_WIDTH = 6;
const TRACK_WIDTH = 1.5;
// How many lines out from the track, on each side, an event's label may move to clear the labels
// before it.
const LABEL_LEVELS = 3;
// The side of a cell of the grid that finds labels near a new one.
const CELL = 64;

/** A track: its points, and how far along it each one is. */
interface Track {
  points: readonly Point[];
  /** The distance from the start to each point. */
  lengths: readonly number[];
  length: number;
}

export function layoutTimeline(drawing: Drawing, chart: CheckedTimelineChart, rect: Rect, paints: Paint[]): void {
  const { axis, series } = chart;
  const line = drawing.lineHeight();
  // Tick labels on the track's left and event labels on its right each take a line and a gap.
  const margin = line + TICK + GAP;
  const area: Rect = { left: rect.left + margin, top: rect.top + margin, right: rect.right - margin, bottom: rect.bottom - margin };
  assertRoom(area, chart.width, chart.height);
  const track = trackOf(axis, area, 2 * margin, chart);
  let [low, high] = [Infinity, -Infinity];
  for (const entry of series) {
    for (const event of entry.data) {
      [low, high] = [Math.min(low, event.at), Math.max(high, event.to ?? event.at)];
    }
  }
  const end = axis.min ?? axis.max ?? 0;
  const scale = scaleOf(axis, low > high ? [end, end] : [low, high], track.length);
  const along = (value: number) => pointAt(track, scale.fraction(value) * track.length);

  const taken = new LabelRoom();
  const centred = { anchor: 'middle', baseline: 'middle' } as const;
  if (!axis.hidden) {
    drawing.push(drawing.outline({ kind: 'linearPath', points: [...track.points] }, { stroke: INK, strokeWidth: TRACK_WIDTH }, ['track']));
    const room = Math.max(0, ...scale.labels.map((label) => drawing.width(label))) + GAP;
    const shown = new Set(scale.labelled(room, (value) => scale.fraction(value) * track.length));
    scale.ticks.forEach((tick, i) => {
      const { point, normal } = along(tick);
      drawing.push(drawing.outline(lineShape(point, offset(point, normal, TICK)), { stroke: INK, strokeWidth: 1 }, ['tick', tick]));
      // A label also needs to clear those of other turns or rows near it, which can be close on the
      // chart however far along the track they are.
      const [x, y] = offset(point, normal, TICK + GAP + line / 2);
      const box = boxAt(drawing.extent(scale.labels[i]!, centred), x, y);
      if (shown.has(i) && taken.clear(box)) {
        taken.add(box);
        drawing.push(drawing.text(scale.labels[i]!, { x, y, ...centred }));
      }
    });
  }

  const levels = Array.from({ length: LABEL_LEVELS }, (_, i) => i);
  // How far out from the track each place for an event's label is: the lines on its right, then
  // those on its left beyond the tick labels, so a label kept off the chart's edge can still move.
  const step = line + GAP / 2;
  const right = PERIOD_WIDTH / 2 + GAP + line / 2;
  const left = axis.hidden ? right : TICK + GAP + line + GAP / 2 + line / 2;
  const places = [...levels.map((level) => -(right + level * step)), ...levels.map((level) => left + level * step)];
  series.forEach((entry, s) => {
    const paint = paints[s]!;
    entry.data.forEach((event, i) => {
      const key = [entry.name, 'event', i];
      const named = event.label === undefined ? '' : `${event.label}, `;
      const nodes: ChartNode[] = [];
      const from = scale.fraction(event.at) * track.length;
      if (event.to === undefined) {
        nodes.push(markerNode(drawing, 'circle', pointAt(track, from).point, POINT_SIZE, solid(paint.color), key, entry.style));
      } else {
        const to = scale.fraction(event.to) * track.length;
        nodes.push(drawing.outline({ kind: 'linearPath', points: stretch(track, from, to) },
          { stroke: paint.color, strokeWidth: PERIOD_WIDTH }, key, entry.style));
      }
      if (entry.dataLabels && event.label !== undefined) {
        // Beside the moment or the middle of the period, at the first of those places where the label,
        // as drawn, cut short and kept on the chart, clears those placed before it; at the first
        // place when none does.
        const { point, normal } = pointAt(track, event.to === undefined ? from : (from + scale.fraction(event.to) * track.length) / 2);
        const path = `${entry.path}.dataLabels`;
        const spots = places.map((distance) => drawing.labelSpot(event.label!, ...offset(point, normal, distance), rect, path));
        const spot = spots.find(({ extent, x, y }) => taken.clear(boxAt(extent, x, y))) ?? spots[0]!;
        taken.add(boxAt(spot.extent, spot.x, spot.y));
        nodes.push(drawing.label(event.label, spot.x, spot.y, rect, path));
      }
      const when = event.to === undefined ? formatAxisValue(event.at, axis) : `${formatAxisValue(event.at, axis)} to ${formatAxisValue(event.to, axis)}`;
      drawing.mark(`${entry.name}: ${named}${when}`, nodes);
    });
  });
}

/** The points of the axis' track in `area`, earliest first. A serpentine's rows must be `rowSpacing` apart. */
function trackOf(axis: CheckedTimelineChart['axis'], area: Rect, rowSpacing: number, chart: CheckedTimelineChart): Track {
  const path = axis.track;
  const [width, height] = [area.right - area.left, area.bottom - area.top];
  switch (path.type) {
    case 'line': {
      const y = (area.top + area.bottom) / 2;
      return measured([[area.left, y], [area.right, y]]);
    }
    case 'serpentine': {
      if (path.rows === 1) {
        const y = (area.top + area.bottom) / 2;
        return measured([[area.left, y], [area.right, y]]);
      }
      // Rows evenly from the top of the area to its bottom, joined by half turns whose diameter is
      // the space between them; the labels of neighbouring rows share that space.
      const spacing = height / (path.rows - 1);
      if (spacing < rowSpacing) {
        const room = Math.max(1, Math.floor(height / rowSpacing) + 1);
        return fail(`${axis.path}.path.rows`, `is ${path.rows}, but a ${chart.width} × ${chart.height} chart has room for ${room}`);
      }
      const radius = spacing / 2;
      const points: Point[] = [];
      for (let row = 0; row < path.rows; row++) {
        const y = area.top + row * spacing;
        const [start, end] = row % 2 === 0 ? [area.left + radius, area.right - radius] : [area.right - radius, area.left + radius];
        points.push([start, y], [end, y]);
        if (row + 1 < path.rows) {
          // Outward on the side the row ends at, down to the next row.
          const side = row % 2 === 0 ? 1 : -1;
          for (let k = 1; k < HALF_TURN_POINTS; k++) {
            const angle = (Math.PI * k) / HALF_TURN_POINTS;
            points.push([end + side * radius * sin(angle), y + radius - radius * cos(angle)]);
          }
        }
      }
      return measured(points);
    }
    case 'spiral': {
      const [cx, cy] = [(area.left + area.right) / 2, (area.top + area.bottom) / 2];
      const outer = Math.min(width, height) / 2;
      const inner = outer * path.innerRadius;
      const count = Math.ceil(path.turns * TURN_POINTS);
      const points: Point[] = [];
      for (let k = 0; k <= count; k++) {
        const turned = (path.turns * k) / count;
        const angle = 2 * Math.PI * turned;
        const r = inner + ((outer - inner) * turned) / path.turns;
        points.push([cx + r * sin(angle), cy - r * cos(angle)]);
      }
      return measured(points);
    }
    case 'curve': {
      const track = measured(path.points.map(([x, y]): Point => [area.left + x * width, area.top + y * height]));
      if (track.length < 1) {
        fail(`${axis.path}.path.points`, `must be spread out: on a ${chart.width} × ${chart.height} chart they make a track shorter than 1`);
      }
      return track;
    }
  }
}

function measured(points: Point[]): Track {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const [[x1, y1], [x2, y2]] = [points[i - 1]!, points[i]!];
    lengths.push(lengths[i - 1]! + Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)));
  }
  return { points, lengths, length: lengths.at(-1)! };
}

/** The point `distance` along the track, and the unit normal on its left there. */
function pointAt(track: Track, distance: number): { point: Point; normal: Point } {
  const { points, lengths } = track;
  // The segment the distance falls in, by halving.
  let [low, high] = [0, points.length - 1];
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (lengths[middle]! <= distance) low = middle;
    else high = middle;
  }
  const [[x1, y1], [x2, y2]] = [points[low]!, points[high]!];
  const span = lengths[high]! - lengths[low]!;
  const t = span === 0 ? 0 : Math.min(1, Math.max(0, (distance - lengths[low]!) / span));
  const [dx, dy] = [x2 - x1, y2 - y1];
  const size = Math.sqrt(dx * dx + dy * dy) || 1;
  return { point: [x1 + dx * t, y1 + dy * t], normal: [dy / size, -dx / size] };
}

/** The part of the track from one distance along it to another, as points. */
function stretch(track: Track, from: number, to: number): Point[] {
  const { points, lengths } = track;
  // The first point past `from`, by halving, then every point before `to`.
  let [low, high] = [0, points.length];
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (lengths[middle]! > from) high = middle;
    else low = middle + 1;
  }
  const part = [pointAt(track, from).point];
  for (let i = low; i < points.length && lengths[i]! < to; i++) {
    part.push(points[i]!);
  }
  part.push(pointAt(track, to).point);
  return part;
}

/** A label's box on the chart, from its extent about the point it is centred on. */
function boxAt({ left, right, up, down }: Extent, x: number, y: number): Rect {
  return { left: x - left, right: x + right, top: y - up, bottom: y + down };
}

/** The boxes of the labels placed so far, in a grid of cells, so a new one is checked only against those near it. */
class LabelRoom {
  readonly #cells = new Map<string, Rect[]>();

  /** Whether `box` overlaps no box placed so far. */
  clear(box: Rect): boolean {
    return this.#keys(box).every((key) => (this.#cells.get(key) ?? []).every((other) => !overlaps(box, other)));
  }

  add(box: Rect): void {
    for (const key of this.#keys(box)) {
      const cell = this.#cells.get(key) ?? [];
      cell.push(box);
      this.#cells.set(key, cell);
    }
  }

  #keys({ left, top, right, bottom }: Rect): string[] {
    const keys: string[] = [];
    for (let column = Math.floor(left / CELL); column <= Math.floor(right / CELL); column++) {
      for (let row = Math.floor(top / CELL); row <= Math.floor(bottom / CELL); row++) {
        keys.push(`${column} ${row}`);
      }
    }
    return keys;
  }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function offset([x, y]: Point, [nx, ny]: Point, distance: number): Point {
  return [x + nx * distance, y + ny * distance];
}

function lineShape([x1, y1]: Point, [x2, y2]: Point): Shape {
  return { kind: 'line', x1, y1, x2, y2 };
}
