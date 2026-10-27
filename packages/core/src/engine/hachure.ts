// Ported from hachure-fill 0.5.2 (bin/hachure.js). MIT License, Copyright (c) 2023 Preet Shihn.
// See THIRD_PARTY_NOTICES.md.

import { charge } from './budget.js';
import type { Line, Point } from './core.js';
import { cos, sin } from './math.js';

interface Edge {
  ymin: number;
  ymax: number;
  x: number;
  islope: number;
}

interface ActiveEdge {
  edge: Edge;
}

function rotatePoints(points: Point[], center: Point, degrees: number): void {
  if (points && points.length) {
    const [cx, cy] = center;
    const angle = (Math.PI / 180) * degrees;
    const cosAngle = cos(angle);
    const sinAngle = sin(angle);
    for (const p of points) {
      const [x, y] = p;
      p[0] = (x - cx) * cosAngle - (y - cy) * sinAngle + cx;
      p[1] = (x - cx) * sinAngle + (y - cy) * cosAngle + cy;
    }
  }
}

function rotateLines(lines: Line[], center: Point, degrees: number): void {
  const points: Point[] = [];
  for (const line of lines) {
    points.push(...line);
  }
  rotatePoints(points, center, degrees);
}

function areSamePoints(p1: Point, p2: Point): boolean {
  return p1[0] === p2[0] && p1[1] === p2[1];
}

// Note: rotates the input polygons in place and back again, exactly as the original does.
export function hachureLines(
  polygons: Point[][],
  hachureGap: number,
  hachureAngle: number,
  hachureStepOffset = 1,
): Line[] {
  const angle = hachureAngle;
  const gap = Math.max(hachureGap, 0.1);
  const rotationCenter: Point = [0, 0];
  if (angle) {
    for (const polygon of polygons) {
      rotatePoints(polygon, rotationCenter, angle);
    }
  }
  const lines = straightHachureLines(polygons, gap, hachureStepOffset);
  if (angle) {
    for (const polygon of polygons) {
      rotatePoints(polygon, rotationCenter, -angle);
    }
    rotateLines(lines, rotationCenter, -angle);
  }
  return lines;
}

function straightHachureLines(polygons: Point[][], gap: number, hachureStepOffset: number): Line[] {
  const vertexArray: Point[][] = [];
  for (const polygon of polygons) {
    const vertices = [...polygon];
    if (!areSamePoints(vertices[0]!, vertices[vertices.length - 1]!)) {
      vertices.push([vertices[0]![0], vertices[0]![1]]);
    }
    if (vertices.length > 2) {
      vertexArray.push(vertices);
    }
  }
  const lines: Line[] = [];
  gap = Math.max(gap, 0.1);
  const edges: Edge[] = [];
  for (const vertices of vertexArray) {
    for (let i = 0; i < vertices.length - 1; i++) {
      const p1 = vertices[i]!;
      const p2 = vertices[i + 1]!;
      if (p1[1] !== p2[1]) {
        const ymin = Math.min(p1[1], p2[1]);
        edges.push({
          ymin,
          ymax: Math.max(p1[1], p2[1]),
          x: ymin === p1[1] ? p1[0] : p2[0],
          islope: (p2[0] - p1[0]) / (p2[1] - p1[1]),
        });
      }
    }
  }
  edges.sort((e1, e2) => {
    if (e1.ymin < e2.ymin) {
      return -1;
    }
    if (e1.ymin > e2.ymin) {
      return 1;
    }
    if (e1.x < e2.x) {
      return -1;
    }
    if (e1.x > e2.x) {
      return 1;
    }
    if (e1.ymax === e2.ymax) {
      return 0;
    }
    return (e1.ymax - e2.ymax) / Math.abs(e1.ymax - e2.ymax);
  });
  if (!edges.length) {
    return lines;
  }
  let activeEdges: ActiveEdge[] = [];
  let y = edges[0]!.ymin;
  let iteration = 0;
  while (activeEdges.length || edges.length) {
    // Charged per active edge: this loop advances one unit of y at a time, drawing or not.
    charge(1 + activeEdges.length);
    if (edges.length) {
      let ix = -1;
      for (let i = 0; i < edges.length; i++) {
        if (edges[i]!.ymin > y) {
          break;
        }
        ix = i;
      }
      const removed = edges.splice(0, ix + 1);
      for (const edge of removed) {
        activeEdges.push({ edge });
      }
    }
    activeEdges = activeEdges.filter((ae) => !(ae.edge.ymax <= y));
    activeEdges.sort((ae1, ae2) => {
      if (ae1.edge.x === ae2.edge.x) {
        return 0;
      }
      return (ae1.edge.x - ae2.edge.x) / Math.abs(ae1.edge.x - ae2.edge.x);
    });
    if (hachureStepOffset !== 1 || iteration % gap === 0) {
      if (activeEdges.length > 1) {
        for (let i = 0; i < activeEdges.length; i = i + 2) {
          const nexti = i + 1;
          if (nexti >= activeEdges.length) {
            break;
          }
          const ce = activeEdges[i]!.edge;
          const ne = activeEdges[nexti]!.edge;
          lines.push([
            [Math.round(ce.x), y],
            [Math.round(ne.x), y],
          ]);
        }
      }
    }
    y += hachureStepOffset;
    for (const ae of activeEdges) {
      ae.edge.x = ae.edge.x + hachureStepOffset * ae.edge.islope;
    }
    iteration++;
  }
  return lines;
}
