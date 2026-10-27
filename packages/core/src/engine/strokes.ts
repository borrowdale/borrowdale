// Ported from rough.js 4.6.6 (src/renderer.ts, private helpers). MIT License, Copyright (c) 2019
// Preet Shihn. See THIRD_PARTY_NOTICES.md. The random-number and single-stroke primitives that both
// the shape geometry (renderer.ts) and the fillers (fillers.ts) draw with.

import { charge } from './budget.js';
import { Random, type Op, type ResolvedOptions } from './core.js';

export function doubleLineFillOps(x1: number, y1: number, x2: number, y2: number, o: ResolvedOptions): Op[] {
  return doubleLine(x1, y1, x2, y2, o, true);
}


export function cloneOptionsAlterSeed(o: ResolvedOptions): ResolvedOptions {
  const result: ResolvedOptions = { ...o };
  result.randomizer = undefined;
  if (o.seed) {
    result.seed = o.seed + 1;
  }
  return result;
}

export function nextRandom(o: ResolvedOptions): number {
  if (!o.randomizer) {
    o.randomizer = new Random(o.seed || 0);
  }
  return o.randomizer.next();
}

export function randomOffset(min: number, max: number, o: ResolvedOptions, roughnessGain = 1): number {
  return o.roughness * roughnessGain * (nextRandom(o) * (max - min) + min);
}

export function randomOffsetAround(x: number, o: ResolvedOptions, roughnessGain = 1): number {
  return randomOffset(-x, x, o, roughnessGain);
}

export function doubleLine(x1: number, y1: number, x2: number, y2: number, o: ResolvedOptions, filling = false): Op[] {
  const singleStroke = filling ? o.disableMultiStrokeFill : o.disableMultiStroke;
  const o1 = strokeLine(x1, y1, x2, y2, o, true, false);
  if (singleStroke) {
    return o1;
  }
  const o2 = strokeLine(x1, y1, x2, y2, o, true, true);
  return o1.concat(o2);
}

export function strokeLine(x1: number, y1: number, x2: number, y2: number, o: ResolvedOptions, move: boolean, overlay: boolean): Op[] {
  charge();
  const lengthSq = Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2);
  const length = Math.sqrt(lengthSq);
  let roughnessGain = 1;
  if (length < 200) {
    roughnessGain = 1;
  } else if (length > 500) {
    roughnessGain = 0.4;
  } else {
    roughnessGain = -0.0016668 * length + 1.233334;
  }

  let offset = o.maxRandomnessOffset || 0;
  if (offset * offset * 100 > lengthSq) {
    offset = length / 10;
  }
  const halfOffset = offset / 2;
  const divergePoint = 0.2 + nextRandom(o) * 0.2;
  let midDispX = (o.bowing * o.maxRandomnessOffset * (y2 - y1)) / 200;
  let midDispY = (o.bowing * o.maxRandomnessOffset * (x1 - x2)) / 200;
  midDispX = randomOffsetAround(midDispX, o, roughnessGain);
  midDispY = randomOffsetAround(midDispY, o, roughnessGain);
  const ops: Op[] = [];
  const randomHalf = () => randomOffsetAround(halfOffset, o, roughnessGain);
  const randomFull = () => randomOffsetAround(offset, o, roughnessGain);
  const preserveVertices = o.preserveVertices;
  if (move) {
    if (overlay) {
      ops.push({
        op: 'move',
        data: [x1 + (preserveVertices ? 0 : randomHalf()), y1 + (preserveVertices ? 0 : randomHalf())],
      });
    } else {
      ops.push({
        op: 'move',
        data: [
          x1 + (preserveVertices ? 0 : randomOffsetAround(offset, o, roughnessGain)),
          y1 + (preserveVertices ? 0 : randomOffsetAround(offset, o, roughnessGain)),
        ],
      });
    }
  }
  if (overlay) {
    ops.push({
      op: 'bcurveTo',
      data: [
        midDispX + x1 + (x2 - x1) * divergePoint + randomHalf(),
        midDispY + y1 + (y2 - y1) * divergePoint + randomHalf(),
        midDispX + x1 + 2 * (x2 - x1) * divergePoint + randomHalf(),
        midDispY + y1 + 2 * (y2 - y1) * divergePoint + randomHalf(),
        x2 + (preserveVertices ? 0 : randomHalf()),
        y2 + (preserveVertices ? 0 : randomHalf()),
      ],
    });
  } else {
    ops.push({
      op: 'bcurveTo',
      data: [
        midDispX + x1 + (x2 - x1) * divergePoint + randomFull(),
        midDispY + y1 + (y2 - y1) * divergePoint + randomFull(),
        midDispX + x1 + 2 * (x2 - x1) * divergePoint + randomFull(),
        midDispY + y1 + 2 * (y2 - y1) * divergePoint + randomFull(),
        x2 + (preserveVertices ? 0 : randomFull()),
        y2 + (preserveVertices ? 0 : randomFull()),
      ],
    });
  }
  return ops;
}
