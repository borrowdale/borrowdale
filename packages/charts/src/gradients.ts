import { svgElement, type Sketch } from '@borrowdale/core';
import type { ChartNode } from './types.js';

type GradientNode = Extract<ChartNode, { kind: 'gradient' }>;

export function gradientIds(nodes: readonly ChartNode[], prefix: string): Map<GradientNode, string> {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(prefix)) throw new Error('Chart idPrefix must be 1 to 100 letters, digits, underscores or hyphens, starting with a letter');
  const ids = new Map<GradientNode, string>();
  const visit = (nodes: readonly ChartNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'mark') visit(node.nodes);
      if (node.kind === 'gradient' && !ids.has(node)) ids.set(node, `${prefix}-gradient-${ids.size}`);
    }
  };
  visit(nodes);
  return ids;
}

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
