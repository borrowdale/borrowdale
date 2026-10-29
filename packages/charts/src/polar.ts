import type { Point, Shape } from '@borrowdale/core';
import { cos, sin } from '@borrowdale/core/math';
import type { TextAnchor, TextBaseline } from '@borrowdale/text';
import { coordinate } from './curves.js';
import type { Drawing } from './drawing.js';
import { assertRoom, GAP, type Rect } from './frame.js';
import { GRID, GRID_WIDTH, hatched, LINE_WIDTH, type Paint } from './palette.js';
import { formatNumber, formatValue, linearScale, place, PLAIN_FORMAT, type PlacedScale } from './scale.js';
import { TURN_ROUNDING, type CheckedPieChart, type CheckedPolarChart, type SeriesOf } from './validate.js';

const RADIANS = Math.PI / 180;
// Beyond this share of a unit vector's length off an axis, a label is placed to that side.
const SIDE = 0.01;

/** The point `degrees` clockwise from the top of a circle of radius 1 around the origin. */
function onCircle(degrees: number): Point {
  const radians = degrees * RADIANS;
  return [sin(radians), -cos(radians)];
}

/** Lays out a pie or donut into `rect`, as large as fits. */
export function layoutPie(drawing: Drawing, chart: CheckedPieChart, rect: Rect, paints: Paint[]): void {
  assertRoom(rect, chart.width, chart.height);
  const [pie] = chart.series;
  const { startAngle, endAngle, innerRadius } = pie;
  const { center, radius } = fitSweep(rect, startAngle, endAngle, innerRadius);

  const total = pie.data.reduce((sum, slice) => sum + slice.value, 0);
  let angle = startAngle;
  pie.data.forEach((slice, i) => {
    const from = angle;
    angle += (slice.value / total) * (endAngle - startAngle);
    // A slice whose sweep rounds to nothing has nothing to draw.
    if (!(angle > from)) {
      return;
    }
    const share = formatNumber((slice.value / total) * 100, 1, PLAIN_FORMAT);
    drawing.mark(`${slice.name}: ${formatValue(slice.value)} (${share}%)`, [
      drawing.shape(
        sliceShape(center, radius, radius * innerRadius, from, angle),
        hatched(paints[i]!),
        `${pie.name}|${slice.name}|slice`,
        pie.style,
      ),
    ]);
  });
}

/**
 * The centre and radius of the largest part of a circle from `startAngle` to `endAngle` that fits in
 * `rect`, with a hole of `innerRadius` times the radius: its extent is that of its ends, the quarter
 * turns between them, and the centre or the ends of the hole.
 */
function fitSweep(rect: Rect, startAngle: number, endAngle: number, innerRadius: number): { center: Point; radius: number } {
  const quarters = Array.from({ length: 16 }, (_, i) => (Math.floor(startAngle / 90) + i) * 90).filter(
    (angle) => angle > startAngle && angle < endAngle,
  );
  const outer = [startAngle, endAngle, ...quarters].map(onCircle);
  const inner =
    innerRadius === 0 ? [[0, 0] as Point] : [startAngle, endAngle].map((angle) => scaled(onCircle(angle), innerRadius));
  const xs = [...outer, ...inner].map(([px]) => px);
  const ys = [...outer, ...inner].map(([, py]) => py);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const radius = Math.min((rect.right - rect.left) / (maxX - minX), (rect.bottom - rect.top) / (maxY - minY));
  const center: Point = [
    (rect.left + rect.right) / 2 - (radius * (minX + maxX)) / 2,
    (rect.top + rect.bottom) / 2 - (radius * (minY + maxY)) / 2,
  ];
  return { center, radius };
}

function sliceShape([cx, cy]: Point, radius: number, hole: number, from: number, to: number): Shape {
  const whole = to - from >= 360 - TURN_ROUNDING;
  if (hole === 0 && whole) {
    return { kind: 'circle', cx, cy, diameter: 2 * radius };
  }
  const at = (r: number, angle: number): string => {
    const [px, py] = onCircle(angle);
    return `${coordinate(cx + r * px)} ${coordinate(cy + r * py)}`;
  };
  // An arc whose ends round to one point is dropped, by SVG and the stroke engine alike, as one arc
  // over nearly a whole turn would be. So each edge is two arcs that meet at the middle of the
  // slice, and neither sweeps more than half a turn.
  const middle = (from + to) / 2;
  const arcTo = (r: number, angle: number, clockwise: boolean): string =>
    ` A${coordinate(r)} ${coordinate(r)} 0 0 ${clockwise ? 1 : 0} ${at(r, angle)}`;
  const edge = (r: number, end: number, clockwise: boolean): string =>
    `${arcTo(r, middle, clockwise)}${arcTo(r, end, clockwise)}`;
  if (whole) {
    // A ring: the outer and the inner circle, the inner a hole by the even-odd rule the engine fills
    // paths with.
    const outer = `M${at(radius, from)}${edge(radius, from, true)} Z`;
    return { kind: 'path', d: `${outer} M${at(hole, from)}${edge(hole, from, false)} Z` };
  }
  // A path, not core's arc shape, whose sampling makes a thin slice cost more the thinner it is.
  const start = hole === 0 ? `M${coordinate(cx)} ${coordinate(cy)} L${at(radius, from)}` : `M${at(radius, from)}`;
  const back = hole === 0 ? '' : ` L${at(hole, to)}${edge(hole, from, false)}`;
  return { kind: 'path', d: `${start}${edge(radius, to, true)}${back} Z` };
}

type PolarSeries = SeriesOf<'polar'>;
type PolarType = PolarSeries['type'];

/** A polar chart's place: its centre and radius, and the points around it. */
interface PolarFrame {
  center: Point;
  radius: number;
  /** The point `distance` from the centre, `degrees` clockwise from the top. */
  point: (degrees: number, distance: number) => Point;
}

function polarFrame([cx, cy]: Point, radius: number): PolarFrame {
  return {
    center: [cx, cy],
    radius,
    point: (degrees, distance) => {
      const [dx, dy] = onCircle(degrees);
      return [cx + distance * dx, cy + distance * dy];
    },
  };
}

interface PolarContext {
  drawing: Drawing;
  frame: PolarFrame;
  /** The angle of category `index`'s spoke. */
  angleOf: (index: number) => number;
  /** The placed scale of the radius axis. */
  radius: PlacedScale;
}

/** What a series type is on a polar chart. A new type fails to compile until it has an entry. */
interface PolarMark<S extends PolarSeries> {
  /** Every value the series puts on the radius axis. */
  values: (entry: S) => number[];
  draw: (context: PolarContext, entry: S, paint: Paint) => void;
}

const POLAR_MARKS: { [K in PolarType]: PolarMark<Extract<PolarSeries, { type: K }>> } = {
  radar: { values: (entry) => entry.data, draw: drawRadar },
};

// One cast, as for the cartesian marks: the entry for `entry.type` takes exactly that series.
function polarMarkOf<S extends PolarSeries>(entry: S): PolarMark<S> {
  return POLAR_MARKS[entry.type] as unknown as PolarMark<S>;
}

/** Lays out a polar chart into `rect`: one spoke per category, clockwise from the top. */
export function layoutPolar(drawing: Drawing, chart: CheckedPolarChart, rect: Rect, paints: Paint[]): void {
  const { angle: spokes, radius: axis, series } = chart;
  const line = drawing.lineHeight();
  const widest = spokes.hidden ? 0 : Math.max(...spokes.categories.map((category) => drawing.width(category)));
  const room = spokes.hidden ? 0 : GAP;
  const radius = Math.min(
    (rect.right - rect.left) / 2 - widest - room,
    (rect.bottom - rect.top) / 2 - (spokes.hidden ? 0 : line) - room,
  );
  assertRoom({ left: 0, top: 0, right: radius, bottom: radius }, chart.width, chart.height);
  const frame = polarFrame([(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2], radius);
  const angleOf = (k: number): number => (k * 360) / spokes.categories.length;
  // From the centre, unless the axis fixes where it starts.
  let [low, high] = [Infinity, -Infinity];
  for (const entry of series) {
    for (const value of polarMarkOf(entry).values(entry)) {
      [low, high] = [Math.min(low, value), Math.max(high, value)];
    }
  }
  const scale = place(linearScale(axis, [axis.min === undefined ? 0 : low, high], radius), [0, radius]);
  const ring = (distance: number): Point[] => spokes.categories.map((_, k) => frame.point(angleOf(k), distance));

  if (!axis.hidden && axis.grid) {
    for (const tick of scale.ticks.filter((tick) => tick > scale.domain[0])) {
      const shape = { kind: 'polygon' as const, points: ring(scale.at(tick)) };
      drawing.push(drawing.shape(shape, { stroke: GRID, strokeWidth: GRID_WIDTH }, `grid|radius|${tick}`));
    }
  }
  const [cx, cy] = frame.center;
  ring(radius).forEach(([px, py], k) => {
    const spoke = { kind: 'line' as const, x1: cx, y1: cy, x2: px, y2: py };
    drawing.push(drawing.shape(spoke, { stroke: GRID, strokeWidth: GRID_WIDTH }, `spoke|${k}`));
  });

  const context: PolarContext = { drawing, frame, angleOf, radius: scale };
  series.forEach((entry, i) => polarMarkOf(entry).draw(context, entry, paints[i]!));

  if (!axis.hidden) {
    scale.ticks.forEach((tick, i) => {
      if (tick > scale.domain[0]) {
        const at = { x: cx + GAP / 2, y: cy - scale.at(tick) };
        drawing.push(drawing.text(scale.labels[i]!, { ...at, anchor: 'start', baseline: 'middle' }));
      }
    });
  }
  if (!spokes.hidden) {
    ring(radius + GAP).forEach(([px, py], k) => {
      const [dx, dy] = onCircle(angleOf(k));
      const anchor: TextAnchor = dx > SIDE ? 'start' : dx < -SIDE ? 'end' : 'middle';
      const baseline: TextBaseline = dy < -SIDE ? 'bottom' : dy > SIDE ? 'top' : 'middle';
      drawing.push(drawing.text(spokes.categories[k]!, { x: px, y: py, anchor, baseline }));
    });
  }
}

function drawRadar(context: PolarContext, entry: Extract<PolarSeries, { type: 'radar' }>, paint: Paint): void {
  const { drawing, frame, angleOf, radius } = context;
  const points = entry.data.map((value, k) => frame.point(angleOf(k), radius.at(value)));
  const style = { ...hatched(paint), strokeWidth: LINE_WIDTH };
  drawing.mark(entry.name, [drawing.shape({ kind: 'polygon', points }, style, `${entry.name}|radar`, entry.style)]);
}

function scaled([px, py]: Point, factor: number): Point {
  return [px * factor, py * factor];
}
