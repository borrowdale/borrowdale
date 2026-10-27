// Ported from rough.js 4.6.6 (src/fillers/*.ts). MIT License, Copyright (c) 2019 Preet Shihn.
// See THIRD_PARTY_NOTICES.md. The dots filler draws its jitter from the seeded random stream,
// where rough.js used Math.random() regardless of the seed.

import { lineLength, type Line, type Op, type OpSet, type Point, type ResolvedOptions } from './core.js';
import { hachureLines } from './hachure.js';
import { ellipseWithParams, generateEllipseParams } from './renderer.js';
import { doubleLineFillOps, nextRandom } from './strokes.js';

type Filler = (polygonList: Point[][], o: ResolvedOptions) => OpSet;

// rough.js falls back to hachure for any unknown style; validation rejects those before here.
export function fillPolygons(polygonList: Point[][], o: ResolvedOptions): OpSet {
  return fillerFor(o.fillStyle)(polygonList, o);
}

function fillerFor(fillStyle: string): Filler {
  switch (fillStyle) {
    case 'zigzag':
      return zigzagFill;
    case 'cross-hatch':
      return hatchFill;
    case 'dashed':
      return dashedFill;
    case 'zigzag-line':
      return zigzagLineFill;
    case 'dots':
      return dotsFill;
    default:
      return hachureFill;
  }
}

function polygonHachureLines(polygonList: Point[][], o: ResolvedOptions): Line[] {
  const angle = o.hachureAngle + 90;
  let gap = o.hachureGap;
  if (gap < 0) {
    gap = o.strokeWidth * 4;
  }
  gap = Math.round(Math.max(gap, 0.1));
  let skipOffset = 1;
  if (o.roughness >= 1) {
    if (nextRandom(o) > 0.7) {
      skipOffset = gap;
    }
  }
  return hachureLines(polygonList, gap, angle, skipOffset || 1);
}

function renderLines(lines: Line[], o: ResolvedOptions): Op[] {
  const ops: Op[] = [];
  for (const line of lines) {
    ops.push(...doubleLineFillOps(line[0][0], line[0][1], line[1][0], line[1][1], o));
  }
  return ops;
}

function hachureFill(polygonList: Point[][], o: ResolvedOptions): OpSet {
  const lines = polygonHachureLines(polygonList, o);
  return { type: 'fillSketch', ops: renderLines(lines, o) };
}

function hatchFill(polygonList: Point[][], o: ResolvedOptions): OpSet {
  const set = hachureFill(polygonList, o);
  const o2 = Object.assign({}, o, { hachureAngle: o.hachureAngle + 90 });
  const set2 = hachureFill(polygonList, o2);
  set.ops = set.ops.concat(set2.ops);
  return set;
}

function zigzagFill(polygonList: Point[][], o: ResolvedOptions): OpSet {
  let gap = o.hachureGap;
  if (gap < 0) {
    gap = o.strokeWidth * 4;
  }
  gap = Math.max(gap, 0.1);
  const o2 = Object.assign({}, o, { hachureGap: gap });
  const lines = polygonHachureLines(polygonList, o2);
  const zigZagAngle = (Math.PI / 180) * o.hachureAngle;
  const zigzagLines: Line[] = [];
  const dgx = gap * 0.5 * Math.cos(zigZagAngle);
  const dgy = gap * 0.5 * Math.sin(zigZagAngle);
  for (const [p1, p2] of lines) {
    if (lineLength([p1, p2])) {
      zigzagLines.push(
        [
          [p1[0] - dgx, p1[1] + dgy],
          [...p2],
        ],
        [
          [p1[0] + dgx, p1[1] - dgy],
          [...p2],
        ],
      );
    }
  }
  return { type: 'fillSketch', ops: renderLines(zigzagLines, o) };
}

function dashedFill(polygonList: Point[][], o: ResolvedOptions): OpSet {
  const lines = polygonHachureLines(polygonList, o);
  const offset = o.dashOffset < 0 ? (o.hachureGap < 0 ? o.strokeWidth * 4 : o.hachureGap) : o.dashOffset;
  const gap = o.dashGap < 0 ? (o.hachureGap < 0 ? o.strokeWidth * 4 : o.hachureGap) : o.dashGap;
  const ops: Op[] = [];
  for (const line of lines) {
    const length = lineLength(line);
    const count = Math.floor(length / (offset + gap));
    const startOffset = (length + gap - count * (offset + gap)) / 2;
    let p1 = line[0];
    let p2 = line[1];
    if (p1[0] > p2[0]) {
      p1 = line[1];
      p2 = line[0];
    }
    const alpha = Math.atan((p2[1] - p1[1]) / (p2[0] - p1[0]));
    for (let i = 0; i < count; i++) {
      const lstart = i * (offset + gap);
      const lend = lstart + offset;
      const start: Point = [
        p1[0] + lstart * Math.cos(alpha) + startOffset * Math.cos(alpha),
        p1[1] + lstart * Math.sin(alpha) + startOffset * Math.sin(alpha),
      ];
      const end: Point = [
        p1[0] + lend * Math.cos(alpha) + startOffset * Math.cos(alpha),
        p1[1] + lend * Math.sin(alpha) + startOffset * Math.sin(alpha),
      ];
      ops.push(...doubleLineFillOps(start[0], start[1], end[0], end[1], o));
    }
  }
  return { type: 'fillSketch', ops };
}

function zigzagLineFill(polygonList: Point[][], o: ResolvedOptions): OpSet {
  const gap = o.hachureGap < 0 ? o.strokeWidth * 4 : o.hachureGap;
  const zo = o.zigzagOffset < 0 ? gap : o.zigzagOffset;
  o = Object.assign({}, o, { hachureGap: gap + zo });
  const lines = polygonHachureLines(polygonList, o);
  const ops: Op[] = [];
  for (const line of lines) {
    const length = lineLength(line);
    const count = Math.round(length / (2 * zo));
    let p1 = line[0];
    let p2 = line[1];
    if (p1[0] > p2[0]) {
      p1 = line[1];
      p2 = line[0];
    }
    const alpha = Math.atan((p2[1] - p1[1]) / (p2[0] - p1[0]));
    for (let i = 0; i < count; i++) {
      const lstart = i * 2 * zo;
      const lend = (i + 1) * 2 * zo;
      const dz = Math.sqrt(2 * Math.pow(zo, 2));
      const start: Point = [p1[0] + lstart * Math.cos(alpha), p1[1] + lstart * Math.sin(alpha)];
      const end: Point = [p1[0] + lend * Math.cos(alpha), p1[1] + lend * Math.sin(alpha)];
      const middle: Point = [
        start[0] + dz * Math.cos(alpha + Math.PI / 4),
        start[1] + dz * Math.sin(alpha + Math.PI / 4),
      ];
      ops.push(
        ...doubleLineFillOps(start[0], start[1], middle[0], middle[1], o),
        ...doubleLineFillOps(middle[0], middle[1], end[0], end[1], o),
      );
    }
  }
  return { type: 'fillSketch', ops };
}

function dotsFill(polygonList: Point[][], o: ResolvedOptions): OpSet {
  o = Object.assign({}, o, { hachureAngle: 0 });
  const lines = polygonHachureLines(polygonList, o);
  let gap = o.hachureGap;
  if (gap < 0) {
    gap = o.strokeWidth * 4;
  }
  gap = Math.max(gap, 0.1);
  let fweight = o.fillWeight;
  if (fweight < 0) {
    fweight = o.strokeWidth / 2;
  }
  const ro = gap / 4;
  const ops: Op[] = [];
  for (const line of lines) {
    const length = lineLength(line);
    const dl = length / gap;
    const count = Math.ceil(dl) - 1;
    const offset = length - count * gap;
    const x = (line[0][0] + line[1][0]) / 2 - gap / 4;
    const minY = Math.min(line[0][1], line[1][1]);
    for (let i = 0; i < count; i++) {
      const y = minY + offset + i * gap;
      const cx = x - ro + nextRandom(o) * 2 * ro;
      const cy = y - ro + nextRandom(o) * 2 * ro;
      const dot = ellipseWithParams(cx, cy, o, generateEllipseParams(fweight, fweight, o));
      ops.push(...dot.opset.ops);
    }
  }
  return { type: 'fillSketch', ops };
}
