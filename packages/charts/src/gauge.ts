import type { Point, Shape } from '@borrowdale/core';
import type { Drawing } from './drawing.js';
import { assertRoom, GAP, TICK, type Rect } from './frame.js';
import {
  alignTowards,
  fitSweep,
  isWholeTurn,
  polarFrame,
  RADIANS,
  RIM_SHARE,
  rimTicks,
  sliceShape,
} from './geometry.js';
import { solid } from './marks.js';
import { GRID, GRID_WIDTH, hatched, INK, type Paint } from './palette.js';
import { fail } from './read.js';
import { formatValue, linearScale, place } from './scale.js';
import type { CheckedGaugeChart, SeriesOf } from './validate.js';

type GaugeSeries = SeriesOf<'gauge'>;

// The width of the dial's track, and of each bar's ring, as a share of the radius.
const TRACK_SHARE = 0.1;
// The space between rings, in units.
const RING_GAP = 3;
// Half the width of a needle at its base, and the radius of the hub it turns on.
const NEEDLE_HALF = 3;
const HUB = 5;
// How much larger than the labels a lone gauge writes its value.
const VALUE_GROWTH = 4;
// Fitting the dial above a lone gauge's value: how many times, and how close is close enough.
const MAX_REFITS = 20;
const FIT_TOLERANCE = 0.01;

/**
 * Lays out a gauge into `rect`: its dial, as large as fits, with coloured bands along the rim, ticks
 * and labels inside it, bars in rings from the rim inwards, and needles from the centre. A lone gauge
 * also writes its value under the centre.
 */
export function layoutGauge(drawing: Drawing, chart: CheckedGaugeChart, rect: Rect, paints: Paint[]): void {
  const { angle: axis, series } = chart;
  const { startAngle, endAngle, bands } = axis;
  const whole = isWholeTurn(startAngle, endAngle);
  const lone = series.length === 1;
  const valueSize = chart.fontSize + VALUE_GROWTH;
  // Room under the centre for the hub and a lone gauge's value, which the dial may not leave.
  const below = HUB + (lone ? GAP + drawing.lineHeight(valueSize) : 0);
  assertRoom(rect, chart.width, chart.height);
  // Raising the bottom of the room by what the value overflows raises the centre by as much when the
  // height limits the dial, and by half of it when the width does, so this ends within a few rounds.
  let room = rect;
  let { center, radius } = fitSweep(room, startAngle, endAngle, 0);
  for (let round = 0; round < MAX_REFITS && center[1] + below > rect.bottom + FIT_TOLERANCE; round++) {
    room = { ...room, bottom: room.bottom - (center[1] + below - rect.bottom) };
    assertRoom(room, chart.width, chart.height);
    ({ center, radius } = fitSweep(room, startAngle, endAngle, 0));
  }
  assertRoom({ left: 0, top: 0, right: radius, bottom: radius }, chart.width, chart.height);
  const [cx, cy] = center;
  const { point } = polarFrame(center, radius, 0);

  // The dial shows 0 unless its fixed ends leave it out.
  const zero = (axis.min ?? 0) <= 0 && 0 <= (axis.max ?? 0) ? [0] : [];
  let [low, high] = [Infinity, -Infinity];
  for (const value of [
    ...zero,
    ...series.map((entry) => entry.value),
    ...bands.flatMap((band) => [band.from, band.to]),
  ]) {
    [low, high] = [Math.min(low, value), Math.max(high, value)];
  }
  const rimLength = radius * (endAngle - startAngle) * RADIANS * RIM_SHARE;
  const scale = place(linearScale(axis, [low, high], rimLength), [startAngle, endAngle]);
  const [first, last] = scale.domain;
  const origin = Math.min(Math.max(0, first), last);

  // The track along the rim holds the bands; bars take rings inside it, or the track itself when
  // there are no bands.
  const width = radius * TRACK_SHARE;
  const bars = series.filter((entry) => entry.display === 'bar');
  const shift = bands.length > 0 ? 1 : 0;
  const ringOuter = (j: number): number => radius - j * (width + RING_GAP);
  const inner = ringOuter(Math.max(1, bars.length + shift)) + RING_GAP;
  // Ticks and labels go inside the innermost ring, outside the hub.
  if (inner - (axis.hidden ? 0 : TICK + GAP) <= HUB) {
    const [where, problem] =
      bars.length > 0
        ? ['series', `holds ${bars.length} gauge bars, more rings than the dial has room for`]
        : [`a ${chart.width} × ${chart.height} chart`, "leaves no room for the dial's ticks around its hub"];
    fail(where, problem);
  }
  const grid = { stroke: GRID, strokeWidth: GRID_WIDTH };
  const arc = (outer: number, from: number, to: number): Shape =>
    sliceShape(center, outer, outer - width, scale.at(from), scale.at(to));

  drawing.push(drawing.shape(arc(radius, first, last), grid, 'track'));
  bands.forEach((band, i) => {
    drawing.push(drawing.shape(arc(radius, band.from, band.to), solid(band.color), `band|${i}`));
  });

  if (!axis.hidden) {
    const ink = { stroke: INK, strokeWidth: 1 };
    const { ticks, labels } = rimTicks(scale, whole);
    ticks.forEach((tick, i) => {
      const at = scale.at(tick);
      const [[x1, y1], [x2, y2]] = [point(at, inner), point(at, inner - TICK)];
      drawing.push(drawing.shape({ kind: 'line', x1, y1, x2, y2 }, ink, `tick|${tick}`));
      // Inside the rim, so each label is placed towards the centre.
      const [px, py] = point(at, inner - TICK - GAP);
      drawing.push(drawing.text(labels[i]!, { x: px, y: py, ...alignTowards(at, false) }));
    });
  }

  series.forEach((entry, i) => {
    const paint = paints[i]!;
    const title = `${entry.name}: ${formatValue(entry.value, axis.format)}`;
    if (entry.display === 'bar') {
      const [from, to] = [Math.min(origin, entry.value), Math.max(origin, entry.value)];
      if (to > from) {
        const ring = ringOuter(bars.indexOf(entry) + shift);
        drawing.mark(title, [drawing.shape(arc(ring, from, to), hatched(paint), `${entry.name}|gauge`, entry.style)]);
      }
      return;
    }
    drawing.mark(title, [
      drawing.shape(
        needle(point, scale.at(entry.value), entry.length * radius),
        solid(paint.color),
        `${entry.name}|gauge`,
        entry.style,
      ),
    ]);
  });
  if (series.some((entry) => entry.display === 'needle')) {
    drawing.push(drawing.shape({ kind: 'circle', cx, cy, diameter: 2 * HUB }, solid(INK), 'hub'));
  }
  if (lone) {
    const [only] = series as [GaugeSeries];
    const text = formatValue(only.value, axis.format);
    drawing.push(
      drawing.text(text, { x: cx, y: cy + HUB + GAP, anchor: 'middle', baseline: 'top', fontSize: valueSize }),
    );
  }
}

/** A needle from the centre to `length` at `degrees`: a thin triangle on the hub. */
function needle(point: (degrees: number, distance: number) => Point, degrees: number, length: number): Shape {
  return {
    kind: 'polygon',
    points: [point(degrees, length), point(degrees + 90, NEEDLE_HALF), point(degrees - 90, NEEDLE_HALF)],
  };
}
