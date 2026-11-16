import { show } from './read.js';
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

/**
 * Throws for a node of a kind no renderer knows: only a layout built by hand can hold one. Its kind is
 * written as every rejected value is, so no text from it reaches the message unescaped.
 */
export function unknownNode(node: never): never {
  throw new Error(`Unknown chart node: ${show((node as { kind?: unknown }).kind)}`);
}
