import { svgElement, type Sketch } from '@borrowdale/core';
import type { ChartNode } from './types.js';

export type GradientNode = Extract<ChartNode, { kind: 'gradient' }>;

/**
 * What a gradient paints: gradients with the same ends and stops paint alike, so they share one
 * definition. A tapered path has a node per edge.
 */
export const gradientKey = (node: GradientNode): string => JSON.stringify([node.from, node.to, node.stops]);

export function gradientAttributes(node: GradientNode, id: string) {
  return { id, gradientUnits: 'userSpaceOnUse', x1: node.from[0], y1: node.from[1], x2: node.to[0], y2: node.to[1] };
}

export function gradientSvg(node: GradientNode, id: string): string {
  return svgElement('linearGradient', gradientAttributes(node, id),
    node.stops.map((stop) => svgElement('stop', { offset: stop.offset, 'stop-color': stop.color })).join(''));
}

export function paintedSketch(node: GradientNode, id: string): Sketch {
  const paint = `url(#${id})`;
  return { paths: node.sketch.paths.map((path) => ({ ...path,
    stroke: path.stroke === 'none' ? 'none' : paint, fill: path.fill === 'none' ? 'none' : paint })) };
}
