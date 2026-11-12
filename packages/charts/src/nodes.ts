import type { ChartNode } from './types.js';

/** Visits every node in painting order, entering every node that holds others. */
export function eachNode(nodes: readonly ChartNode[], visit: (node: ChartNode) => void): void {
  for (const node of nodes) {
    visit(node);
    eachNode(childrenOf(node), visit);
  }
}

function childrenOf(node: ChartNode): readonly ChartNode[] {
  switch (node.kind) {
    case 'gradient':
    case 'image':
    case 'sketch':
    case 'text':
      return [];
    case 'mark':
    case 'clip':
      return node.nodes;
    default:
      return unknownNode(node);
  }
}

export function unknownNode(node: never): never {
  throw new Error(`Unknown chart node: ${String((node as { kind?: unknown }).kind)}`);
}
