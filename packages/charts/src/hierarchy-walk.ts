// What every hierarchy display shares as it walks its tree: the orders the layouts visit nodes in,
// the order siblings are drawn in, and each node's paint and tooltip path below the root. The two
// visiting orders are a port of d3-hierarchy 3.1.3 (Copyright 2010-2026 Mike Bostock, ISC; see
// THIRD_PARTY_NOTICES.md), from src/hierarchy/eachBefore.js and src/hierarchy/eachAfter.js.
import { paints, type Paint } from './palette.js';

/** What separates the names in a node's tooltip. */
const PATH_SEPARATOR = ' › ';

/**
 * The path below a hierarchy's root to a node, from the names on the way down, as the node's tooltip
 * names it: `hierarchyPath(['Home', 'Rent'])` is `'Home › Rent'`. It is text to show, not a key: a
 * name may itself hold the separator, and the text is not escaped for markup.
 */
export function hierarchyPath(names: readonly string[]): string {
  return names.join(PATH_SEPARATOR);
}

/** Every node, each before its children. */
export function eachBefore<N extends { children: readonly N[] }>(root: N, visit: (node: N) => void): void {
  const stack = [root];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    visit(node);
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]!);
  }
}

/**
 * Every node, each after its children, in d3's order. The layouts depend on it: packing draws from
 * one generator as it goes, so the order decides which numbers each enclosing circle shuffles by, and
 * the tidy tree places each node against the sibling before it.
 */
export function eachAfter<N extends { children: readonly N[] }>(root: N, visit: (node: N) => void): void {
  const nodes = [root];
  const next: N[] = [];
  for (let node = nodes.pop(); node !== undefined; node = nodes.pop()) {
    next.push(node);
    nodes.push(...node.children);
  }
  for (let node = next.pop(); node !== undefined; node = next.pop()) visit(node);
}

/** Largest first, a missing value last; 0 for a tie, which a stable sort keeps in the given order. */
export function largestFirst(a: { value: number | undefined }, b: { value: number | undefined }): number {
  if (a.value === undefined) return b.value === undefined ? 0 : 1;
  return b.value === undefined ? -1 : b.value - a.value;
}

/** A node below the root as it is drawn: its paint, and its path below the root, as its tooltip names it. */
export interface Branching<N> {
  node: N;
  paint: Paint;
  path: string;
}

/**
 * Every node below `root`, each before its children, with its paint and path. Each branch below the
 * root takes its legend entry's paint from `paintOf`, and each node below its own colour, else its
 * parent's paint.
 */
export function branches<N extends { item: { name: string; color: string | undefined; path: string }; children: readonly N[] }>(
  root: N,
  paintOf: ReadonlyMap<string, Paint>,
): Branching<N>[] {
  const drawn: Branching<N>[] = [];
  const visit = (node: N, inherited: Paint, names: readonly string[]): void => {
    const paint = node.item.color === undefined ? inherited : paints([{ color: node.item.color, path: node.item.path }])[0]!;
    drawn.push({ node, paint, path: hierarchyPath(names) });
    for (const child of node.children) visit(child, paint, [...names, child.item.name]);
  };
  for (const branch of root.children) visit(branch, paintOf.get(branch.item.name)!, [branch.item.name]);
  return drawn;
}
