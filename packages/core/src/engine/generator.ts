// Ported from rough.js 4.6.6 (src/generator.ts). MIT License, Copyright (c) 2019 Preet Shihn.
// See THIRD_PARTY_NOTICES.md. Each function returns the drawable's op sets; the option object is
// shared by all sets of one shape, exactly as in rough.js, because its randomizer is stateful.

import { curveToBezier, pointsOnBezierCurves } from './bezier.js';
import type { Point as ShapePoint, Shape } from '../types.js';
import type { Op, OpSet, Point, ResolvedOptions } from './core.js';
import { fillArc, fillPolygons } from './fillers.js';
import { normalizedPath, pointsOnPath } from './path-data.js';
import {
  arc as arcOps,
  curve as curveOps,
  ellipseWithParams,
  generateEllipseParams,
  line as lineOps,
  linearPath as linearPathOps,
  rectangle as rectangleOps,
  solidFillPolygon,
  svgPath,
} from './renderer.js';

const NOS = 'none';

/** The op sets for one shape: its fill (if any) first, then its outline (if stroked). */
export function shapeSets(shape: Shape, o: ResolvedOptions): OpSet[] {
  switch (shape.kind) {
    case 'line':
      return line(shape.x1, shape.y1, shape.x2, shape.y2, o);
    case 'rectangle':
      return rectangle(shape.x, shape.y, shape.width, shape.height, o);
    case 'ellipse':
      return ellipse(shape.cx, shape.cy, shape.width, shape.height, o);
    case 'circle':
      return ellipse(shape.cx, shape.cy, shape.diameter, shape.diameter, o);
    case 'arc':
      return arc(shape.cx, shape.cy, shape.width, shape.height, shape.start, shape.stop, shape.closed ?? false, o);
    case 'polygon':
      return polygon(toEnginePoints(shape.points), o);
    case 'linearPath':
      return linearPath(toEnginePoints(shape.points), o);
    case 'curve':
      return curve(toEnginePoints(shape.points), o);
    case 'path':
      return path(shape.d, o);
    default:
      return unknownKind(shape);
  }
}

function unknownKind(shape: never): never {
  throw new Error(`Unknown shape kind: ${String((shape as { kind?: unknown }).kind)}`);
}

// The fill code rotates polygons in place, so the engine always works on its own copy.
function toEnginePoints(points: readonly ShapePoint[]): Point[] {
  return points.map(([x, y]) => [x, y]);
}

// line and linearPath have no fill and return their outline even when `stroke` is 'none'
// (rough.js does the same), so they do not go through `assemble`.
function line(x1: number, y1: number, x2: number, y2: number, o: ResolvedOptions): OpSet[] {
  return [lineOps(x1, y1, x2, y2, o)];
}

function linearPath(points: Point[], o: ResolvedOptions): OpSet[] {
  return [linearPathOps(points, false, o)];
}

/**
 * The shape's fill first (if it has one), then its outline (if it is stroked). Callers compute the
 * outline before calling, and the fill runs here afterwards, which is the order the stroke
 * randomness is drawn in.
 */
function assemble(o: ResolvedOptions, outline: OpSet, fill?: () => OpSet | undefined): OpSet[] {
  const sets: OpSet[] = [];
  const fillSet = hasFill(o) ? fill?.() : undefined;
  if (fillSet) {
    sets.push(fillSet);
  }
  if (o.stroke !== NOS) {
    sets.push(outline);
  }
  return sets;
}

// One rule for every kind: rough.js used three (and drew invisible fills for 'none').
function hasFill(o: ResolvedOptions): boolean {
  return !!o.fill && o.fill !== NOS && o.fill !== 'transparent';
}

function polygonFill(points: Point[], o: ResolvedOptions): OpSet {
  return o.fillStyle === 'solid' ? solidFillPolygon([points], o) : fillPolygons([points], o);
}

function rectangle(x: number, y: number, width: number, height: number, o: ResolvedOptions): OpSet[] {
  const outline = rectangleOps(x, y, width, height, o);
  const corners = (): Point[] => [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
  return assemble(o, outline, () => polygonFill(corners(), o));
}

function polygon(points: Point[], o: ResolvedOptions): OpSet[] {
  const outline = linearPathOps(points, true, o);
  return assemble(o, outline, () => polygonFill(points, o));
}

function ellipse(x: number, y: number, width: number, height: number, o: ResolvedOptions): OpSet[] {
  const ellipseParams = generateEllipseParams(width, height, o);
  const ellipseResponse = ellipseWithParams(x, y, o, ellipseParams);
  const fill = (): OpSet => {
    if (o.fillStyle === 'solid') {
      const shape = ellipseWithParams(x, y, o, ellipseParams).opset;
      shape.type = 'fillPath';
      return shape;
    }
    return fillPolygons([ellipseResponse.estimatedPoints], o);
  };
  return assemble(o, ellipseResponse.opset, fill);
}

function arc(
  x: number,
  y: number,
  width: number,
  height: number,
  start: number,
  stop: number,
  closed: boolean,
  o: ResolvedOptions,
): OpSet[] {
  const outline = arcOps(x, y, width, height, start, stop, closed, true, o);
  const fill = (): OpSet => {
    if (o.fillStyle === 'solid') {
      const fillOptions: ResolvedOptions = { ...o };
      fillOptions.disableMultiStroke = true;
      const shape = arcOps(x, y, width, height, start, stop, true, false, fillOptions);
      shape.type = 'fillPath';
      return shape;
    }
    return fillArc(x, y, width, height, start, stop, o);
  };
  return assemble(o, outline, closed ? fill : undefined);
}

function curve(points: Point[], o: ResolvedOptions): OpSet[] {
  const outline = curveOps(points, o);
  const fill = (): OpSet | undefined => {
    if (o.fillStyle === 'solid') {
      const fillShape = curveOps(points, {
        ...o,
        disableMultiStroke: true,
        roughness: o.roughness ? o.roughness + o.fillShapeRoughnessGain : 0,
      });
      return { type: 'fillPath', ops: mergedShape(fillShape.ops) };
    }
    const polyPoints: Point[] = [];
    if (points.length < 3) {
      polyPoints.push(...points);
    } else if (points.length === 3) {
      polyPoints.push(
        ...pointsOnBezierCurves(curveToBezier([points[0]!, points[0]!, points[1]!, points[2]!]), 10, (1 + o.roughness) / 2),
      );
    } else {
      polyPoints.push(...pointsOnBezierCurves(curveToBezier(points), 10, (1 + o.roughness) / 2));
    }
    return polyPoints.length ? fillPolygons([polyPoints], o) : undefined;
  };
  return assemble(o, outline, fill);
}

function path(d: string, o: ResolvedOptions): OpSet[] {
  if (!d) {
    return [];
  }
  // The last replace is rough.js's own: a string, not a regex, so at runtime it looks for the
  // literal text "/(ss)/g" ("\s" in a string literal is just "s"). Kept for byte-identical output.
  d = (d || '').replace(/\n/g, ' ').replace(/(-\s)/g, '-').replace('/(ss)/g', ' ');

  // Parsed once: the range check, the fill polygons and the strokes all read the same segments.
  const segments = normalizedPath(d);
  const distance = (1 + o.roughness) / 2;
  const sets = pointsOnPath(segments, 1, distance);
  const outline = svgPath(segments, o);
  const fill = (): OpSet => {
    if (o.fillStyle !== 'solid') {
      return fillPolygons(sets, o);
    }
    if (sets.length !== 1) {
      return solidFillPolygon(sets, o);
    }
    const fillShape = svgPath(segments, {
      ...o,
      disableMultiStroke: true,
      roughness: o.roughness ? o.roughness + o.fillShapeRoughnessGain : 0,
    });
    return { type: 'fillPath', ops: mergedShape(fillShape.ops) };
  };
  return assemble(o, outline, fill);
}


export function opsToPath(drawing: OpSet, fixedDecimals: number): string {
  let pathText = '';
  for (const item of drawing.ops) {
    const data = item.data.map((d) => +d.toFixed(fixedDecimals));
    switch (item.op) {
      case 'move':
        pathText += `M${data[0]} ${data[1]} `;
        break;
      case 'bcurveTo':
        pathText += `C${data[0]} ${data[1]}, ${data[2]} ${data[3]}, ${data[4]} ${data[5]} `;
        break;
      case 'lineTo':
        pathText += `L${data[0]} ${data[1]} `;
        break;
    }
  }
  return pathText.trim();
}

function mergedShape(input: Op[]): Op[] {
  return input.filter((d, i) => i === 0 || d.op !== 'move');
}
