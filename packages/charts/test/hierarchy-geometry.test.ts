import { describe, expect, it } from 'vitest';
import { binary, dice, pack, partition, placed, slice, sliceDice, squarify, treemap, type LaidOut, type Tiling } from '../src/hierarchy-geometry.js';

// Every expected position below was computed once with d3-hierarchy 3.1.3 on the same tree, summed
// and sorted largest first, in a 400 by 300 rectangle, and pinned as a literal.
interface Named {
  name: string;
  value: number;
  children: readonly Named[];
}
const leaf = (name: string, value: number): Named => ({ name, value, children: [] });
const parent = (name: string, children: Named[]): Named => ({ name, value: children.reduce((sum, child) => sum + child.value, 0), children });
const TREE = parent('root', [
  parent('A', [leaf('A1', 30), leaf('A2', 22), leaf('A3', 31)]),
  parent('B', [leaf('B1', 7), leaf('B2', 4), leaf('B3', 2), leaf('B4', 1)]),
  leaf('C', 4),
]);
const NO_PADDING = { inner: 0, top: 0, right: 0, bottom: 0, left: 0 };
/** Every leaf of `tree`, by name, squarified in 600 by 400. */
function squarified(tree: Named): Map<string, LaidOut<Named>> {
  const root = placed(tree, true);
  treemap(root, squarify, 600, 400, NO_PADDING);
  return new Map(root.children.map((node) => [node.item.name, node]));
}

/** Every node by name, once laid out by `layout`. */
function laidOut(layout: (root: LaidOut<Named>) => void, sort = true): Map<string, LaidOut<Named>> {
  const root = placed(TREE, sort);
  layout(root);
  const nodes = new Map<string, LaidOut<Named>>();
  const visit = (node: LaidOut<Named>): void => {
    nodes.set(node.item.name, node);
    node.children.forEach(visit);
  };
  visit(root);
  return nodes;
}
const box = (node: LaidOut<Named> | undefined) => [node!.x0, node!.y0, node!.x1, node!.y1];
const disc = (node: LaidOut<Named> | undefined) => [node!.x, node!.y, node!.r];
const tiled = (tile: Tiling, name: string) => box(laidOut((root) => treemap(root, tile, 400, 300, NO_PADDING)).get(name));
const area = (node: LaidOut<Named> | undefined) => (node!.x1 - node!.x0) * (node!.y1 - node!.y0);
const leaves = (nodes: Map<string, LaidOut<Named>>) => [...nodes.values()].filter((node) => node.children.length === 0);
/** Each leaf's share of the rectangle's area, less its share of the total value. */
const areaErrors = (nodes: Map<string, LaidOut<Named>>) => leaves(nodes).map((node) => Math.abs(area(node) / 120_000 - node.value / 101));
/** How far each child reaches outside its parent: 0 when inside. */
function overhangs(nodes: Map<string, LaidOut<Named>>): number[] {
  return [...nodes.values()].flatMap((node) =>
    node.children.map((child) => Math.max(0, node.x0 - child.x0, node.y0 - child.y0, child.x1 - node.x1, child.y1 - node.y1)));
}
/** How far two sibling circles overlap: 0 when apart. */
function overlaps(nodes: Map<string, LaidOut<Named>>): number[] {
  return [...nodes.values()].flatMap((node) => node.children.flatMap((a, i) =>
    node.children.slice(i + 1).map((b) => Math.max(0, a.r + b.r - Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)))));
}
/** How far a child circle reaches outside its parent's. */
function outside(nodes: Map<string, LaidOut<Named>>): number[] {
  return [...nodes.values()].flatMap((node) =>
    node.children.map((child) => Math.max(0, Math.sqrt((child.x - node.x) ** 2 + (child.y - node.y) ** 2) + child.r - node.r)));
}

/** Lays a tree out as a treemap, squarified in 400 by 300. */
const treemapped = (padding: typeof NO_PADDING) => (root: LaidOut<Named>) => treemap(root, squarify, 400, 300, padding);
/** Lays a tree out as an icicle in 400 by 300. */
const partitioned = (padding: number) => (root: LaidOut<Named>) => partition(root, 400, 300, padding);
/** Lays a tree out as packed circles in 400 by 300. */
const packed = (padding: number) => (root: LaidOut<Named>) => pack(root, 400, 300, padding);
/** The names of a tree's children, as `placed` orders them. */
const childNames = (tree: Named, sort: boolean) => placed(tree, sort).children.map((node) => node.item.name);
/** Bruls, Huizing and van Wijk's example: leaves of 6, 6, 4, 3, 2, 2 and 1. */
const BRULS = parent('root', [6, 6, 4, 3, 2, 2, 1].map((value, i) => leaf(`L${i}`, value)));
const PADDED = { inner: 2, top: 3, right: 3, bottom: 3, left: 3 };
const CRUSHING = { inner: 0, top: 400, right: 0, bottom: 0, left: 0 };

// Leaves of 1 and 1e15 in an order for which d3's smallest enclosing circle finds no consistent basis
// (d3-hierarchy 3.1.3 throws on it, unsorted, with no padding).
const FAR = parent('root', [1, 1e15, 1e15, 1, 1e15, 1, 1, 1, 1].map((value, i) => leaf(`F${i}`, value)));
/** Every node of FAR, by name, packed unsorted in 400 by 300 with no padding. */
function packedFar(): Map<string, LaidOut<Named>> {
  const root = placed(FAR, false);
  pack(root, 400, 300, 0);
  return new Map([root, ...root.children].map((node) => [node.item.name, node]));
}

describe('placed', () => {
  it('orders siblings largest first, a tie in the given order', () => {
    expect(childNames(parent('r', [leaf('a', 1), leaf('b', 3), leaf('c', 1), leaf('d', 2)]), true)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('keeps the given order when not sorting', () => {
    expect(childNames(parent('r', [leaf('a', 1), leaf('b', 3)]), false)).toEqual(['a', 'b']);
  });

  it('counts the levels below each node', () => {
    expect(placed(TREE, true).height).toBe(2);
  });
});

describe('treemap tilings, against d3-hierarchy 3.1.3', () => {
  it('squarifies as d3 does', () => {
    expect(tiled(squarify, 'A1')).toEqual([0, 152.45901639344262, 241.5841584158416, 300]);
    expect(tiled(squarify, 'B4')).toEqual([376.23762376237624, 183.33333333333334, 400, 233.33333333333334]);
  });

  it('squarifies towards the golden ratio: the leaves of 6, 6, 4, 3, 2, 2 and 1 in 600 by 400', () => {
    // A ratio of 1 would put L4 at [300, 233.33, 420, 400] instead.
    expect(box(squarified(BRULS).get('L4'))).toEqual([300, 233.33333333333334, 540, 316.6666666666667]);
  });

  it.each([
    ['binary', binary, [328.71287128712873, 116.66666666666667, 400, 183.33333333333334]],
    ['dice', dice, [356.4356435643565, 0, 372.27722772277235, 300]],
    ['slice', slice, [0, 267.3267326732673, 400, 279.20792079207916]],
    ['slice-dice, slicing at odd depths', sliceDice, [328.71287128712873, 150, 384.1584158415842, 235.71428571428572]],
  ] as const)('tiles %s as d3 does', (_, tile, expected) => {
    expect(tiled(tile, 'B2')).toEqual(expected);
  });
});

describe('treemaps', () => {
  it('give each leaf an area in proportion to its value', () => {
    expect(Math.max(...areaErrors(laidOut(treemapped(NO_PADDING))))).toBeLessThan(1e-12);
  });

  it('keep every child inside its parent, with padding', () => {
    expect(Math.max(...overhangs(laidOut(treemapped(PADDED))))).toBe(0);
  });

  it('pad as d3 does: between siblings, inside each parent below the root, and not inside the root', () => {
    // d3: paddingInner(2), paddingOuter 3 below the root and 0 at it.
    expect(box(laidOut(treemapped(PADDED)).get('A'))).toEqual([0, 0, 328.35643564356434, 300]);
    expect(box(laidOut(treemapped(PADDED)).get('A1'))).toEqual([3, 153.4262295081967, 239.3824406537039, 297]);
  });

  it('give children no room where padding takes it all, rather than a negative size', () => {
    const nodes = laidOut(treemapped(CRUSHING));
    expect(box(nodes.get('A1'))[3]! - box(nodes.get('A1'))[1]!).toBe(0);
  });
});

describe('partition', () => {
  // d3 gives the root a band of its own; this partition does not draw the root, so the two levels
  // below it take 150 each. d3's own layout, stretched by 3/2 and moved up a band, gives these.
  it('places a node as d3 does, the root left out', () => {
    expect(box(laidOut(partitioned(0)).get('B2'))).toEqual([356.4356435643565, 150, 372.27722772277235, 300]);
  });

  it('gives each level an equal band', () => {
    const nodes = laidOut(partitioned(0));
    expect([box(nodes.get('A'))[1], box(nodes.get('A'))[3], box(nodes.get('A1'))[3]]).toEqual([0, 150, 300]);
  });

  it('gives each node a length in proportion to its value', () => {
    const nodes = laidOut(partitioned(0));
    expect(nodes.get('C')!.x1 - nodes.get('C')!.x0).toBeCloseTo((400 * 4) / 101, 12);
  });

  it('takes the padding off each node\'s far sides', () => {
    const nodes = laidOut(partitioned(2));
    expect(box(nodes.get('A'))[3]).toBe(148);
  });
});

describe('circle packing, against d3-hierarchy 3.1.3', () => {
  it('places circles as d3 does', () => {
    expect(disc(laidOut(packed(0)).get('A1'))).toEqual([208.66145008265676, 132.0630224230808, 51.306266169156935]);
    expect(disc(laidOut(packed(0)).get('B4'))).toEqual([313.833225297642, 127.9588525491809, 9.367199774070473]);
  });

  it('places circles as d3 does with padding', () => {
    expect(disc(laidOut(packed(3)).get('A1'))).toEqual([203.8138343162928, 132.74841036661974, 47.00948714339218]);
  });

  it('keeps sibling circles apart', () => {
    expect(Math.max(...overlaps(laidOut(packed(0))))).toBeLessThan(1e-6);
  });

  it('keeps every circle inside its parent', () => {
    expect(Math.max(...outside(laidOut(packed(3))))).toBeLessThan(1e-9);
  });

  it('gives leaves radii in proportion to the square roots of their values', () => {
    const nodes = laidOut(packed(0));
    expect(nodes.get('A1')!.r / nodes.get('B4')!.r).toBeCloseTo(Math.sqrt(30), 12);
  });

  it('encloses circles where d3 finds no smallest enclosing circle, keeping them inside and apart', () => {
    expect(Math.max(...outside(packedFar()))).toBeLessThan(1e-9);
    expect(Math.max(...overlaps(packedFar()))).toBeLessThan(1e-6);
  });

  it('fits the root to the shorter side', () => {
    expect(disc(laidOut(packed(0)).get('root'))).toEqual([200, 150, 150]);
  });
});
