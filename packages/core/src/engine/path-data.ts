// Ported from path-data-parser 0.1.0 (src/parser.ts, src/absolutize.ts, src/normalize.ts)
// and points-on-path 0.2.1 (src/index.ts). MIT License, Copyright (c) 2020 Preet Shihn.
// See THIRD_PARTY_NOTICES.md.

import { pointsOnBezierCurves, simplify } from './bezier.js';
import { charge } from './budget.js';
import { MAX_COORDINATE, type Point } from './core.js';
import { asin, cos, sin, tan } from './math.js';

export interface Segment {
  key: string;
  data: number[];
}

const COMMAND = 0;
const NUMBER = 1;
const EOD = 2;
type TokenType = 0 | 1 | 2;

interface PathToken {
  type: TokenType;
  text: string;
}

const PARAMS: Record<string, number> = {
  A: 7, a: 7, C: 6, c: 6, H: 1, h: 1, L: 2, l: 2, M: 2, m: 2,
  Q: 4, q: 4, S: 4, s: 4, T: 2, t: 2, V: 1, v: 1, Z: 0, z: 0,
};

const SEPARATOR = /^([ \t\r\n,]+)/;
const COMMAND_LETTER = /^([aAcChHlLmMqQsStTvVzZ])/;
const NUMBER_TEXT = /^(([-+]?[0-9]+(\.[0-9]*)?|[-+]?\.[0-9]+)([eE][-+]?[0-9]+)?)/;

// The original reads the legacy RegExp.$1 global; this reads the same capture from the match.
function tokenize(d: string): PathToken[] {
  const tokens: PathToken[] = [];
  while (d !== '') {
    charge();
    let match: RegExpExecArray | null;
    if ((match = SEPARATOR.exec(d))) {
      d = d.slice(match[1]!.length);
    } else if ((match = COMMAND_LETTER.exec(d))) {
      tokens[tokens.length] = { type: COMMAND, text: match[1]! };
      d = d.slice(match[1]!.length);
    } else if ((match = NUMBER_TEXT.exec(d))) {
      tokens[tokens.length] = { type: NUMBER, text: `${parseFloat(match[1]!)}` };
      d = d.slice(match[1]!.length);
    } else {
      throw new Error(`Invalid shape: path.d: unexpected ${JSON.stringify(d.slice(0, 20))}`);
    }
  }
  tokens[tokens.length] = { type: EOD, text: '' };
  return tokens;
}

function isType(token: PathToken, type: number): boolean {
  return token.type === type;
}

export function parsePath(d: string): Segment[] {
  const segments: Segment[] = [];
  const tokens = tokenize(d);
  let mode = 'BOD';
  let index = 0;
  let token = tokens[index]!;
  while (!isType(token, EOD)) {
    let paramsCount = 0;
    const params: number[] = [];
    if (mode === 'BOD') {
      if (token.text === 'M' || token.text === 'm') {
        index++;
        paramsCount = PARAMS[token.text]!;
        mode = token.text;
      } else {
        return parsePath('M0,0' + d);
      }
    } else if (isType(token, NUMBER)) {
      paramsCount = PARAMS[mode]!;
      // rough.js loops forever here: a command with no parameters (Z) never advances the index.
      if (paramsCount === 0) {
        throw new Error(`Invalid shape: path.d: a number cannot follow ${mode}`);
      }
    } else {
      index++;
      paramsCount = PARAMS[token.text]!;
      mode = token.text;
    }
    if (index + paramsCount < tokens.length) {
      for (let i = index; i < index + paramsCount; i++) {
        const numberToken = tokens[i]!;
        if (isType(numberToken, NUMBER)) {
          params[params.length] = +numberToken.text;
        } else {
          throw new Error(`Invalid shape: path.d: ${mode} needs a number, got ${numberToken.text}`);
        }
      }
      if (typeof PARAMS[mode] === 'number') {
        const segment: Segment = { key: mode, data: params };
        segments.push(segment);
        index += paramsCount;
        token = tokens[index]!;
        if (mode === 'M') mode = 'L';
        if (mode === 'm') mode = 'l';
      } else {
        throw new Error(`Invalid shape: path.d: bad segment ${mode}`);
      }
    } else {
      throw new Error('Invalid shape: path.d ended in the middle of a command');
    }
  }
  return segments;
}

// Translate relative commands to absolute commands.
export function absolutize(segments: Segment[]): Segment[] {
  let cx = 0;
  let cy = 0;
  let subx = 0;
  let suby = 0;
  const out: Segment[] = [];
  for (const { key, data } of segments) {
    switch (key) {
      case 'M':
        out.push({ key: 'M', data: [...data] });
        [cx, cy] = data as Point;
        [subx, suby] = data as Point;
        break;
      case 'm':
        cx += data[0]!;
        cy += data[1]!;
        out.push({ key: 'M', data: [cx, cy] });
        subx = cx;
        suby = cy;
        break;
      case 'L':
        out.push({ key: 'L', data: [...data] });
        [cx, cy] = data as Point;
        break;
      case 'l':
        cx += data[0]!;
        cy += data[1]!;
        out.push({ key: 'L', data: [cx, cy] });
        break;
      case 'C':
        out.push({ key: 'C', data: [...data] });
        cx = data[4]!;
        cy = data[5]!;
        break;
      case 'c': {
        const newdata = data.map((d, i) => (i % 2 ? d + cy : d + cx));
        out.push({ key: 'C', data: newdata });
        cx = newdata[4]!;
        cy = newdata[5]!;
        break;
      }
      case 'Q':
        out.push({ key: 'Q', data: [...data] });
        cx = data[2]!;
        cy = data[3]!;
        break;
      case 'q': {
        const newdata = data.map((d, i) => (i % 2 ? d + cy : d + cx));
        out.push({ key: 'Q', data: newdata });
        cx = newdata[2]!;
        cy = newdata[3]!;
        break;
      }
      case 'A':
        out.push({ key: 'A', data: [...data] });
        cx = data[5]!;
        cy = data[6]!;
        break;
      case 'a':
        cx += data[5]!;
        cy += data[6]!;
        out.push({ key: 'A', data: [data[0]!, data[1]!, data[2]!, data[3]!, data[4]!, cx, cy] });
        break;
      case 'H':
        out.push({ key: 'H', data: [...data] });
        cx = data[0]!;
        break;
      case 'h':
        cx += data[0]!;
        out.push({ key: 'H', data: [cx] });
        break;
      case 'V':
        out.push({ key: 'V', data: [...data] });
        cy = data[0]!;
        break;
      case 'v':
        cy += data[0]!;
        out.push({ key: 'V', data: [cy] });
        break;
      case 'S':
        out.push({ key: 'S', data: [...data] });
        cx = data[2]!;
        cy = data[3]!;
        break;
      case 's': {
        const newdata = data.map((d, i) => (i % 2 ? d + cy : d + cx));
        out.push({ key: 'S', data: newdata });
        cx = newdata[2]!;
        cy = newdata[3]!;
        break;
      }
      case 'T':
        out.push({ key: 'T', data: [...data] });
        cx = data[0]!;
        cy = data[1]!;
        break;
      case 't':
        cx += data[0]!;
        cy += data[1]!;
        out.push({ key: 'T', data: [cx, cy] });
        break;
      case 'Z':
      case 'z':
        out.push({ key: 'Z', data: [] });
        cx = subx;
        cy = suby;
        break;
    }
  }
  return out;
}

// Normalize a path to only M, L, C and Z commands.
export function normalize(segments: Segment[]): Segment[] {
  const out: Segment[] = [];

  let lastType = '';
  let cx = 0;
  let cy = 0;
  let subx = 0;
  let suby = 0;
  let lcx = 0;
  let lcy = 0;

  for (const { key, data } of segments) {
    switch (key) {
      case 'M':
        out.push({ key: 'M', data: [...data] });
        [cx, cy] = data as Point;
        [subx, suby] = data as Point;
        break;
      case 'C':
        out.push({ key: 'C', data: [...data] });
        cx = data[4]!;
        cy = data[5]!;
        lcx = data[2]!;
        lcy = data[3]!;
        break;
      case 'L':
        out.push({ key: 'L', data: [...data] });
        [cx, cy] = data as Point;
        break;
      case 'H':
        cx = data[0]!;
        out.push({ key: 'L', data: [cx, cy] });
        break;
      case 'V':
        cy = data[0]!;
        out.push({ key: 'L', data: [cx, cy] });
        break;
      case 'S': {
        let cx1 = 0;
        let cy1 = 0;
        if (lastType === 'C' || lastType === 'S') {
          cx1 = cx + (cx - lcx);
          cy1 = cy + (cy - lcy);
        } else {
          cx1 = cx;
          cy1 = cy;
        }
        out.push({ key: 'C', data: [cx1, cy1, ...data] });
        lcx = data[0]!;
        lcy = data[1]!;
        cx = data[2]!;
        cy = data[3]!;
        break;
      }
      case 'T': {
        const x = data[0]!;
        const y = data[1]!;
        let x1 = 0;
        let y1 = 0;
        if (lastType === 'Q' || lastType === 'T') {
          x1 = cx + (cx - lcx);
          y1 = cy + (cy - lcy);
        } else {
          x1 = cx;
          y1 = cy;
        }
        const cx1 = cx + (2 * (x1 - cx)) / 3;
        const cy1 = cy + (2 * (y1 - cy)) / 3;
        const cx2 = x + (2 * (x1 - x)) / 3;
        const cy2 = y + (2 * (y1 - y)) / 3;
        out.push({ key: 'C', data: [cx1, cy1, cx2, cy2, x, y] });
        lcx = x1;
        lcy = y1;
        cx = x;
        cy = y;
        break;
      }
      case 'Q': {
        const x1 = data[0]!;
        const y1 = data[1]!;
        const x = data[2]!;
        const y = data[3]!;
        const cx1 = cx + (2 * (x1 - cx)) / 3;
        const cy1 = cy + (2 * (y1 - cy)) / 3;
        const cx2 = x + (2 * (x1 - x)) / 3;
        const cy2 = y + (2 * (y1 - y)) / 3;
        out.push({ key: 'C', data: [cx1, cy1, cx2, cy2, x, y] });
        lcx = x1;
        lcy = y1;
        cx = x;
        cy = y;
        break;
      }
      case 'A': {
        const r1 = Math.abs(data[0]!);
        const r2 = Math.abs(data[1]!);
        const angle = data[2]!;
        const largeArcFlag = data[3]!;
        const sweepFlag = data[4]!;
        const x = data[5]!;
        const y = data[6]!;
        if (r1 === 0 || r2 === 0) {
          out.push({ key: 'C', data: [cx, cy, x, y, x, y] });
          cx = x;
          cy = y;
        } else if (cx !== x || cy !== y) {
          const curves = arcToCubicCurves(cx, cy, x, y, r1, r2, angle, largeArcFlag, sweepFlag);
          for (const curve of curves) {
            out.push({ key: 'C', data: curve });
          }
          cx = x;
          cy = y;
        }
        break;
      }
      case 'Z':
        out.push({ key: 'Z', data: [] });
        cx = subx;
        cy = suby;
        break;
    }
    lastType = key;
  }
  return out;
}

function degToRad(degrees: number): number {
  return (Math.PI * degrees) / 180;
}

function rotate(x: number, y: number, angleRad: number): [number, number] {
  const X = x * cos(angleRad) - y * sin(angleRad);
  const Y = x * sin(angleRad) + y * cos(angleRad);
  return [X, Y];
}

function arcToCubicCurves(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r1: number,
  r2: number,
  angle: number,
  largeArcFlag: number,
  sweepFlag: number,
  recursive?: number[],
): number[][] {
  const angleRad = degToRad(angle);
  let params: number[][] = [];

  let f1 = 0;
  let f2 = 0;
  let cx = 0;
  let cy = 0;
  if (recursive) {
    [f1, f2, cx, cy] = recursive as [number, number, number, number];
  } else {
    [x1, y1] = rotate(x1, y1, -angleRad);
    [x2, y2] = rotate(x2, y2, -angleRad);

    const x = (x1 - x2) / 2;
    const y = (y1 - y2) / 2;
    let h = (x * x) / (r1 * r1) + (y * y) / (r2 * r2);
    if (h > 1) {
      h = Math.sqrt(h);
      r1 = h * r1;
      r2 = h * r2;
    }

    const sign = largeArcFlag === sweepFlag ? -1 : 1;

    const r1Pow = r1 * r1;
    const r2Pow = r2 * r2;

    const left = r1Pow * r2Pow - r1Pow * y * y - r2Pow * x * x;
    const right = r1Pow * y * y + r2Pow * x * x;

    const k = sign * Math.sqrt(Math.abs(left / right));

    cx = (k * r1 * y) / r2 + (x1 + x2) / 2;
    cy = (k * -r2 * x) / r1 + (y1 + y2) / 2;

    f1 = asin(parseFloat(((y1 - cy) / r2).toFixed(9)));
    f2 = asin(parseFloat(((y2 - cy) / r2).toFixed(9)));

    if (x1 < cx) {
      f1 = Math.PI - f1;
    }
    if (x2 < cx) {
      f2 = Math.PI - f2;
    }

    if (f1 < 0) {
      f1 = Math.PI * 2 + f1;
    }
    if (f2 < 0) {
      f2 = Math.PI * 2 + f2;
    }

    if (sweepFlag && f1 > f2) {
      f1 = f1 - Math.PI * 2;
    }
    if (!sweepFlag && f2 > f1) {
      f2 = f2 - Math.PI * 2;
    }
  }

  let df = f2 - f1;

  if (Math.abs(df) > (Math.PI * 120) / 180) {
    const f2old = f2;
    const x2old = x2;
    const y2old = y2;

    if (sweepFlag && f2 > f1) {
      f2 = f1 + ((Math.PI * 120) / 180) * 1;
    } else {
      f2 = f1 + ((Math.PI * 120) / 180) * -1;
    }

    x2 = cx + r1 * cos(f2);
    y2 = cy + r2 * sin(f2);
    params = arcToCubicCurves(x2, y2, x2old, y2old, r1, r2, angle, 0, sweepFlag, [f2, f2old, cx, cy]);
  }

  df = f2 - f1;

  const c1 = cos(f1);
  const s1 = sin(f1);
  const c2 = cos(f2);
  const s2 = sin(f2);
  const t = tan(df / 4);
  const hx = (4 / 3) * r1 * t;
  const hy = (4 / 3) * r2 * t;

  const m1 = [x1, y1];
  const m2 = [x1 + hx * s1, y1 - hy * c1];
  const m3 = [x2 + hx * s2, y2 - hy * c2];
  const m4 = [x2, y2];

  m2[0] = 2 * m1[0]! - m2[0]!;
  m2[1] = 2 * m1[1]! - m2[1]!;

  if (recursive) {
    return [m2, m3, m4].concat(params);
  }
  params = [m2, m3, m4].concat(params);
  const curves: number[][] = [];
  for (let i = 0; i < params.length; i += 3) {
    const rr1 = rotate(params[i]![0]!, params[i]![1]!, angleRad);
    const rr2 = rotate(params[i + 1]![0]!, params[i + 1]![1]!, angleRad);
    const rr3 = rotate(params[i + 2]![0]!, params[i + 2]![1]!, angleRad);
    curves.push([rr1[0], rr1[1], rr2[0], rr2[1], rr3[0], rr3[1]]);
  }
  return curves;
}

/** Path text parsed into absolute M, L, C and Z segments, every number within ±MAX_COORDINATE. */
export function normalizedPath(path: string): Segment[] {
  // Checked as written, which covers arc radii and rotation before arcs become curves, and again
  // once relative coordinates and arcs have become absolute.
  const parsed = assertWithinRange(parsePath(path), 'contains');
  return assertWithinRange(normalize(absolutize(parsed)), 'reaches, once arcs and relative coordinates are resolved,');
}

function assertWithinRange(segments: Segment[], verb: string): Segment[] {
  for (const { data } of segments) {
    for (const value of data) {
      if (!(Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE)) {
        throw new Error(`Invalid shape: path.d ${verb} ${value}, outside ±${MAX_COORDINATE}`);
      }
    }
  }
  return segments;
}

export function pointsOnPath(segments: Segment[], tolerance?: number, distance?: number): Point[][] {
  const sets: Point[][] = [];
  let currentPoints: Point[] = [];
  let start: Point = [0, 0];
  let pendingCurve: Point[] = [];

  const appendPendingCurve = () => {
    if (pendingCurve.length >= 4) {
      currentPoints.push(...pointsOnBezierCurves(pendingCurve, tolerance));
    }
    pendingCurve = [];
  };

  const appendPendingPoints = () => {
    appendPendingCurve();
    if (currentPoints.length) {
      sets.push(currentPoints);
      currentPoints = [];
    }
  };

  for (const { key, data } of segments) {
    switch (key) {
      case 'M':
        appendPendingPoints();
        start = [data[0]!, data[1]!];
        currentPoints.push(start);
        break;
      case 'L':
        appendPendingCurve();
        currentPoints.push([data[0]!, data[1]!]);
        break;
      case 'C':
        if (!pendingCurve.length) {
          const lastPoint = currentPoints.length ? currentPoints[currentPoints.length - 1]! : start;
          pendingCurve.push([lastPoint[0], lastPoint[1]]);
        }
        pendingCurve.push([data[0]!, data[1]!]);
        pendingCurve.push([data[2]!, data[3]!]);
        pendingCurve.push([data[4]!, data[5]!]);
        break;
      case 'Z':
        appendPendingCurve();
        currentPoints.push([start[0], start[1]]);
        break;
    }
  }
  appendPendingPoints();

  if (!distance) {
    return sets;
  }

  const out: Point[][] = [];
  for (const set of sets) {
    const simplifiedSet = simplify(set, distance);
    if (simplifiedSet.length) {
      out.push(simplifiedSet);
    }
  }
  return out;
}
