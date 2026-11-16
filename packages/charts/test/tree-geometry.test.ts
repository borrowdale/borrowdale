import { describe, expect, it } from 'vitest';
import { eachBefore } from '../src/hierarchy-walk.js';
import { cluster, placedTree, radialSeparation, separation, tidy, type PlacedNode, type Separation } from '../src/tree-geometry.js';

interface Item {
  name: string;
  value: number | undefined;
  children: Item[];
}
const node = (name: string, ...children: Item[]): Item => ({ name, value: undefined, children });
const valued = (name: string, value: number | undefined): Item => ({ name, value, children: [] });

// Uneven depths, so a subtree is moved apart from the one before it and the shift is spread over
// the siblings between them.
const TREE = node(
  'root',
  node('A', node('A1'), node('A2', node('A2a'), node('A2b'), node('A2c')), node('A3')),
  node('B', node('B1')),
  node('C'),
  node('D', node('D1', node('D1a'), node('D1b')), node('D2')),
);

// Its outermost leaves at different depths, so a separation that depends on depth tells left from right.
const UNEVEN = node('root', node('A', node('A1', node('A1a'))), node('B'));

/** Each node's [x, y] by name, once `layout` has placed `tree` in its given order. */
function laidOut(
  layout: (root: PlacedNode<Item>, separate: Separation, width: number, height: number) => void,
  separate: Separation,
  width: number,
  height: number,
  tree: Item,
): Record<string, [number, number]> {
  const root = placedTree(tree, false);
  layout(root, separate, width, height);
  const places: Record<string, [number, number]> = {};
  eachBefore(root, (placed) => {
    places[placed.item.name] = [placed.x, placed.y];
  });
  return places;
}

/** The names of `tree`'s children, in the order `placedTree` puts them. */
function order(tree: Item, sort: boolean): string[] {
  return placedTree(tree, sort).children.map((child) => child.item.name);
}

// d3-hierarchy 3.1.3's positions for TREE, computed once with d3 and pinned bit for bit: `tree()` and
// `cluster()` sized 400 × 300, and sized 360 × 100 with the radial separation d3 documents,
// `(a.parent === b.parent ? 1 : 2) / a.depth`.
const D3_TIDY = {
  root: [211.11111111111111, 0], A: [88.88888888888889, 100], B: [222.22222222222223, 100], C: [277.77777777777777, 100],
  D: [333.3333333333333, 100], A1: [44.44444444444444, 200], A2: [88.88888888888889, 200], A3: [133.33333333333331, 200],
  B1: [222.22222222222223, 200], D1: [311.1111111111111, 200], D2: [355.55555555555554, 200], A2a: [44.44444444444444, 300],
  A2b: [88.88888888888889, 300], A2c: [133.33333333333331, 300], D1a: [288.88888888888886, 300], D1b: [333.3333333333333, 300],
};
const D3_CLUSTER = {
  root: [227.94117647058823, 0], A: [94.11764705882352, 100.00000000000001], B: [211.76470588235296, 200.00000000000003],
  C: [258.8235294117647, 300], D: [347.05882352941177, 100.00000000000001], A1: [23.52941176470588, 300],
  A2: [94.11764705882352, 200.00000000000003], A3: [164.70588235294116, 300], B1: [211.76470588235296, 300],
  D1: [317.6470588235294, 200.00000000000003], D2: [376.4705882352941, 300], A2a: [70.58823529411765, 300],
  A2b: [94.11764705882352, 300], A2c: [117.64705882352942, 300], D1a: [305.88235294117646, 300], D1b: [329.4117647058823, 300],
};
const D3_RADIAL_TIDY = {
  root: [188.57142857142856, 0], A: [68.57142857142857, 33.333333333333336], B: [171.42857142857142, 33.333333333333336],
  C: [240, 33.333333333333336], D: [308.57142857142856, 33.333333333333336], A1: [34.285714285714285, 66.66666666666667],
  A2: [68.57142857142857, 66.66666666666667], A3: [102.85714285714286, 66.66666666666667], B1: [171.42857142857142, 66.66666666666667],
  D1: [291.42857142857144, 66.66666666666667], D2: [325.7142857142857, 66.66666666666667], A2a: [45.7142857142857, 100],
  A2b: [68.57142857142856, 100], A2c: [91.4285714285714, 100], D1a: [280.00000000000006, 100], D1b: [302.8571428571429, 100],
};
const D3_UNEVEN_RADIAL_CLUSTER = { root: [144, 0], A: [36, 33.333333333333336], B: [252.00000000000003, 100], A1: [36, 66.66666666666667], A1a: [36, 100] };
const D3_RADIAL_CLUSTER = {
  root: [200.10000000000002, 0], A: [69.6, 33.333333333333336], B: [165.6, 66.66666666666667], C: [252.00000000000003, 100],
  D: [313.20000000000005, 33.333333333333336], A1: [21.600000000000005, 100], A2: [64.80000000000001, 66.66666666666667],
  A3: [122.4, 100], B1: [165.6, 100], D1: [288, 66.66666666666667], D2: [338.40000000000003, 100], A2a: [50.400000000000006, 100],
  A2b: [64.80000000000001, 100], A2c: [79.20000000000002, 100], D1a: [280.80000000000007, 100], D1b: [295.20000000000005, 100],
};

describe('node-link tree layouts', () => {
  it.each([
    ['a tidy tree', tidy, separation, 400, 300, TREE, D3_TIDY],
    ['a cluster', cluster, separation, 400, 300, TREE, D3_CLUSTER],
    ['a radial tidy tree', tidy, radialSeparation, 360, 100, TREE, D3_RADIAL_TIDY],
    ['a radial cluster', cluster, radialSeparation, 360, 100, TREE, D3_RADIAL_CLUSTER],
    ['a radial cluster whose outer leaves lie at different depths', cluster, radialSeparation, 360, 100, UNEVEN, D3_UNEVEN_RADIAL_CLUSTER],
  ] as const)('place %s exactly where d3 places it', (_, layout, separate, width, height, tree, expected) => {
    expect(laidOut(layout, separate, width, height, tree)).toEqual(expected);
  });

  it('order siblings largest first, a missing value after every value and a tie in the given order', () => {
    const tree = node('root', valued('none', undefined), valued('small', 1), valued('tie', 5), valued('large', 9), valued('same', 5), valued('zero', 0));

    expect(order(tree, true)).toEqual(['large', 'tie', 'same', 'small', 'zero', 'none']);
  });

  it('keep the given order when not sorting', () => {
    const tree = node('root', valued('none', undefined), valued('small', 1), valued('large', 9));

    expect(order(tree, false)).toEqual(['none', 'small', 'large']);
  });
});
