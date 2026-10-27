// Ported from rough.js 4.6.6 (src/core.ts, src/geometry.ts, src/math.ts).
// MIT License, Copyright (c) 2019 Preet Shihn. See THIRD_PARTY_NOTICES.md.

export type Point = [number, number];
export type Line = [Point, Point];

export type OpType = 'move' | 'bcurveTo' | 'lineTo';
export type OpSetType = 'path' | 'fillPath' | 'fillSketch';

export interface Op {
  op: OpType;
  data: number[];
}

export interface OpSet {
  type: OpSetType;
  ops: Op[];
}

export interface ResolvedOptions {
  maxRandomnessOffset: number;
  roughness: number;
  bowing: number;
  stroke: string;
  strokeWidth: number;
  curveFitting: number;
  curveTightness: number;
  curveStepCount: number;
  fill?: string | undefined;
  fillStyle: string;
  fillWeight: number;
  hachureAngle: number;
  hachureGap: number;
  dashOffset: number;
  dashGap: number;
  zigzagOffset: number;
  seed: number;
  randomizer?: Random | undefined;
  disableMultiStroke: boolean;
  disableMultiStrokeFill: boolean;
  preserveVertices: boolean;
  fillShapeRoughnessGain: number;
}

export const DEFAULT_OPTIONS: ResolvedOptions = {
  maxRandomnessOffset: 2,
  roughness: 1,
  bowing: 1,
  stroke: '#000',
  strokeWidth: 1,
  curveTightness: 0,
  curveFitting: 0.95,
  curveStepCount: 9,
  fillStyle: 'hachure',
  fillWeight: -1,
  hachureAngle: -41,
  hachureGap: -1,
  dashOffset: -1,
  dashGap: -1,
  zigzagOffset: -1,
  seed: 0,
  disableMultiStroke: false,
  disableMultiStrokeFill: false,
  preserveVertices: false,
  fillShapeRoughnessGain: 0.8,
};

export function lineLength(line: Line): number {
  const p1 = line[0];
  const p2 = line[1];
  return Math.sqrt(Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2));
}

// mulberry32, in place of rough.js's LCG, which had degenerate seeds (2^30 gives a constant 0.5)
// and fell back to Math.random() for a seed of 0. Only 32-bit integer arithmetic, so every
// JavaScript engine produces the same stream.
export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
