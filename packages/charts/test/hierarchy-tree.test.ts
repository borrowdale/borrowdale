import { describe, expect, it } from 'vitest';
import { layoutChart, type ChartLayout, type ChartSpec } from '@borrowdale/charts';
import examples from '../../../apps/examples/hierarchy-cases.json' with { type: 'json' };
import { isNodeLink } from '../src/hierarchy-series.js';
import { labelsOutside, laying, overlappingTexts, placedAs, placedTexts, placesOf, pointsOutside, shapesOf, titles, unmarkedSketches } from './support/layout.js';

// Every chart `tree` makes is 400 by 300, its legend left out unless a test asks for it.
function tree(data: object, options: object = {}, chart: object = {}): ChartSpec {
  return {
    width: 400, height: 300, legend: 'none', style: { roughness: 0 },
    series: [{ type: 'hierarchy', name: 'T', display: 'tree', data, ...options }],
    ...chart,
  } as ChartSpec;
}
// A leaf of 0, a leaf with no value, and a parent whose value is the sum of known ones.
const FAMILY = {
  name: 'root',
  children: [
    { name: 'A', children: [{ name: 'A1', value: 3 }, { name: 'A2', value: 0 }] },
    { name: 'B' },
  ],
};
/** A root with `count` leaves below one branch: `count` + 2 nodes. */
const wide = (count: number) => ({ name: 'root', children: [{ name: 'branch', children: Array.from({ length: count }, (_, i) => ({ name: `n${i}` })) }] });
const NODE_LINK_EXAMPLES = examples.filter((example) => isNodeLink(example.spec.series[0]!.display));
const DENDROGRAM = examples.find((example) => example.name === 'dendrogram')!.spec as ChartSpec;
/** A root with one child. */
const one = (child: object) => ({ name: 'root', children: [child] });
// A long name on the only leaf at the left end of its row, and at the right end, with nothing beside it there.
const LONG_AT_EDGE = { name: 'root', children: [{ name: 'A', children: [{ name: 'a very long leaf name indeed' }] }, { name: 'B' }, { name: 'C' }] };
const LONG_AT_RIGHT = { name: 'root', children: [{ name: 'B' }, { name: 'C' }, { name: 'A', children: [{ name: 'a very long leaf name indeed' }] }] };
// Leaves 1, 2 and 4 from the root.
const SPACED = { name: 'root', children: [{ name: 'one', length: 1 }, { name: 'two', length: 2 }, { name: 'four', length: 4 }] };
// A parent above its own parent and one below it, each with two leaves either side of it.
const SIDES = {
  name: 'root',
  children: [{ name: 'A', children: [{ name: 'A1' }, { name: 'A2' }] }, { name: 'B', children: [{ name: 'B1' }, { name: 'B2' }] }],
};
// A parent whose own parent lies to its left, with far more room on its right than on its left.
const ROOM_ON_RIGHT = {
  name: 'root',
  children: [{ name: 'P1', children: [{ name: 'a' }, { name: 'Parent long name', children: [{ name: 'x' }] }] }, { name: 'P2', children: [{ name: 'b' }] }],
};
// The mirror of ROOM_ON_RIGHT: a parent whose own parent lies to its right, with far more room on its left.
const ROOM_ON_LEFT = {
  name: 'root',
  children: [{ name: 'P2', children: [{ name: 'b' }] }, { name: 'P1', children: [{ name: 'Parent long name', children: [{ name: 'x' }] }, { name: 'a' }] }],
};
// A child a hundredth of its parent's length below it, level with it but for that.
const SHORT_CHILD = { name: 'root', children: [{ name: 'A', length: 1, children: [{ name: 'a', length: 0.01 }] }, { name: 'B', length: 1 }] };
/** A chain of `levels` nodes below the root, each named by 60 letters. */
const longChain = (levels: number): object => ({ name: `${'w'.repeat(59)}${levels}`, ...(levels === 0 ? {} : { children: [longChain(levels - 1)] }) });
// A word of the largest value, one of 0 and one of none.
const WORDS = { name: 'I', children: [{ name: 'big', value: 8 }, { name: 'zero', value: 0 }, { name: 'none' }] };

/** The kinds of the nodes in the mark titled `title`. */
function kinds(layout: ChartLayout, title: string): string[] {
  return shapesOf(layout, title).map((node) => node.kind);
}

/** Every name drawn, in drawing order. */
function names(layout: ChartLayout): string[] {
  return placedTexts(layout).map((placed) => placed.text);
}

/** How far across and down the chart the first `text` drawn is placed. */
function xOf(layout: ChartLayout, text: string): number {
  return placesOf(layout, text)[0]![0];
}
function yOf(layout: ChartLayout, text: string): number {
  return placesOf(layout, text)[0]![1];
}

/** The path data of the first stroke of a tree's `index`th link. */
function linkPath(spec: ChartSpec, index: number): string {
  return unmarkedSketches(layoutChart(spec))[index]!.sketch.paths[0]!.d;
}
/** How many curves path data is drawn with. */
function curves(d: string): number {
  return d.split('C').length - 1;
}
/** Where path data starts. */
function startOf(d: string): string {
  return d.slice(0, d.indexOf('C')).trim();
}
/** The points path data passes through: where it starts, and where each curve ends, before any next stroke. */
function vertices(d: string): [number, number][] {
  return [d.slice(1, d.indexOf('C')), ...d.split('C').slice(1)].map((part) => {
    const numbers = part.split('M')[0]!.trim().split(/[ ,]+/).map(Number);
    return [numbers.at(-2)!, numbers.at(-1)!];
  });
}
/** How far `point` lies from `centre`. */
function distance([x, y]: [number, number], [cx, cy]: [number, number]): number {
  return Math.hypot(x - cx, y - cy);
}

/** The top and the bottom of the first `text` drawn. */
function topOf(layout: ChartLayout, text: string): number {
  return placedAs(layout, text)[0]!.box.y;
}
function bottomOf(layout: ChartLayout, text: string): number {
  const { box } = placedAs(layout, text)[0]!;
  return box.y + box.height;
}

/** How tall the first `text` drawn is. */
function heightOf(layout: ChartLayout, text: string): number {
  return placedAs(layout, text)[0]!.box.height;
}

describe('hierarchies drawn as nodes and links', () => {
  it('name each node in its tooltip, the root too, with its value where every leaf below it has one', () => {
    expect(titles(layoutChart(tree(FAMILY)))).toEqual(['root', 'A: 3', 'A › A1: 3', 'A › A2: 0', 'B']);
  });

  it.each(['A › A2: 0', 'B'])('draw the node %s, with its name, though it has no value above 0', (title) => {
    expect(kinds(layoutChart(tree(FAMILY)), title)).toEqual(['sketch', 'text']);
  });

  it('join every node below the root to its parent', () => {
    expect(unmarkedSketches(layoutChart(tree(FAMILY)))).toHaveLength(4);
  });

  it('write each value after its name with dataLabels, and a node with no value by its name', () => {
    expect(names(layoutChart(tree(FAMILY, { dataLabels: true })))).toEqual(['root', 'A: 3', 'A1: 3', 'A2: 0', 'B']);
  });

  it.each([
    ['right', 0, -1],
    ['left', 0, 1],
    ['down', 1, -1],
    ['up', 1, 1],
  ])('run %s from the root', (direction, axis, before) => {
    const layout = layoutChart(tree(FAMILY, { direction }));

    expect(Math.sign(placesOf(layout, 'root')[0]![axis]! - placesOf(layout, 'A1')[0]![axis]!)).toBe(before);
  });

  // East Germanic, the last parent of the dendrogram example, has no room below its line, at the
  // plot's bottom, so its name goes above it: written once in the legend, and again in the tree.
  it("write a parent's name on the other side of its line where the side away from its parent has no room", () => {
    expect(names(layoutChart(DENDROGRAM)).join('|')).toMatch(/East Germanic.*East Germanic/);
  });

  // A curved link arrives at the parent's name from its own parent's side, so a name the away side has
  // no room for is left out rather than written across that link.
  it("leave out, rather than write across its own link, a parent's name the away side has no room for, with curved links", () => {
    const data = { name: 'root', children: [{ name: 'A', children: [{ name: 'a1' }] }, { name: 'Parent long name', children: [{ name: 'x' }] }] };
    expect(names(layoutChart(tree(data, {}, { height: 70 })))).not.toContain('Parent long name');
  });

  it('write each name of an organisation chart', () => {
    expect(names(layoutChart(tree(FAMILY, { nodeShape: 'box', direction: 'down' })))).toEqual(['root', 'A', 'A1', 'A2', 'B']);
  });

  it('leave out every name of an indented tree whose rows are shorter than a line', () => {
    expect(names(layoutChart(tree(wide(60), { display: 'indented' }, { height: 100 })))).toEqual([]);
  });

  it('write a word tree\'s largest value larger than its smallest', () => {
    const words = { name: 'I', children: [{ name: 'like', children: [{ name: 'tea', value: 9 }, { name: 'rain', value: 1 }] }] };
    const layout = layoutChart(tree(words, { display: 'wordTree' }));

    expect(heightOf(layout, 'tea')).toBeGreaterThan(heightOf(layout, 'rain'));
  });

  it("write a word tree's word of no value as one of 0, and its largest twice as tall", () => {
    const layout = layoutChart(tree(WORDS, { display: 'wordTree' }));

    expect([heightOf(layout, 'none'), heightOf(layout, 'big') / heightOf(layout, 'zero')]).toEqual([heightOf(layout, 'zero'), expect.closeTo(2, 1)]);
  });

  it('find node-link examples to check', () => {
    expect(NODE_LINK_EXAMPLES).not.toHaveLength(0);
  });

  it.each([
    ['boxes running down', LONG_AT_EDGE, { nodeShape: 'box', direction: 'down' }],
    ['boxes running down, at the right end', LONG_AT_RIGHT, { nodeShape: 'box', direction: 'down' }],
    ['boxes running right', LONG_AT_EDGE, { nodeShape: 'box', direction: 'right' }],
    ['dots running up', LONG_AT_EDGE, { direction: 'up', links: 'elbow' }],
  ])("keep every stroke of a tree of %s inside the chart, a node alone at a row's end included", (_, data, options) => {
    expect(pointsOutside(layoutChart(tree(data, options)))).toBe(0);
  });

  it.each([
    ['left', LONG_AT_EDGE],
    ['right', LONG_AT_RIGHT],
  ])("cut short, rather than leave out, a long name alone at the %s end of a vertical tree's row", (_, data) => {
    expect(names(layoutChart(tree(data, { direction: 'down' }))).join(' ')).toMatch(/a very long.*…/);
  });

  it('keep a tree inside the chart when a leaf has a name longer than the plot is wide', () => {
    expect(pointsOutside(layoutChart(tree({ name: 'root', children: [{ name: 'x'.repeat(100) }, { name: 'B' }] })))).toBe(0);
  });

  it('place each node of a tree spaced by length its summed length from the root', () => {
    const layout = layoutChart(tree(SPACED, { distance: 'length' }));

    expect((xOf(layout, 'four') - xOf(layout, 'two')) / (xOf(layout, 'two') - xOf(layout, 'one'))).toBeCloseTo(2);
  });

  it("write a parent's name on the side of its line away from its own parent, in a tree running right", () => {
    const layout = layoutChart(tree(SIDES));

    expect([yOf(layout, 'A') < (yOf(layout, 'A1') + yOf(layout, 'A2')) / 2, yOf(layout, 'B') > (yOf(layout, 'B1') + yOf(layout, 'B2')) / 2]).toEqual([true, true]);
  });

  it("run a parent's name away from its own parent, in a tree running down", () => {
    const layout = layoutChart(tree(SIDES, { direction: 'down' }));

    expect([xOf(layout, 'A') < (xOf(layout, 'A1') + xOf(layout, 'A2')) / 2, xOf(layout, 'B') > (xOf(layout, 'B1') + xOf(layout, 'B2')) / 2]).toEqual([true, true]);
  });

  it.each([
    ['right', ROOM_ON_RIGHT],
    ['left', ROOM_ON_LEFT],
  ])("give a parent's name in a tree running down the room on the side it runs into, its %s", (_, data) => {
    expect(names(layoutChart(tree(data, { direction: 'down' })))).toContain('Parent long name');
  });

  it("write a child's name though it lies all but level with its parent, in a tree running down", () => {
    expect(names(layoutChart(tree(SHORT_CHILD, { direction: 'down', distance: 'length' })))).toContain('a');
  });

  it.each([
    ['Ada', 'Lin', { width: 800, height: 600, fontSize: 19 }],
    ['Ada', 'Tony', { width: 800, height: 600 }],
  ])('write whole the names %s and %s in the boxes sized for them', (first, second, chart) => {
    expect(names(layoutChart(tree({ name: 'CEO', children: [{ name: first }, { name: second }] }, { nodeShape: 'box', direction: 'down' }, chart)))).toEqual(['CEO', first, second]);
  });

  it('write whole the widest leaf name of a radial tree, in the room kept for it at the rim', () => {
    const leaves = { name: 'R', children: [{ name: 'xqc' }, { name: 'vAyyolLhtEQtelMECy' }, { name: 'qPakDLa' }] };
    expect(names(layoutChart(tree(leaves, { display: 'radialTree' }, { width: 1400, height: 1400 })))).toEqual(['R', 'xqc', 'vAyyolLhtEQtelMECy', 'qPakDLa']);
  });

  it('keep every stroke of a word tree whose words are wider than the plot inside the chart', () => {
    expect(pointsOutside(layoutChart(tree(longChain(3), { display: 'wordTree' })))).toBe(0);
  });

  // The second link, from A to A1, leaves a parent away from the centre, so its arc has a radius.
  it("draw a radial tree's elbow from its parent round its parent's ring, through more points than a straight link", () => {
    const [elbow, straight] = [linkPath(tree(FAMILY, { display: 'radialTree', links: 'elbow' }), 1), linkPath(tree(FAMILY, { display: 'radialTree', links: 'straight' }), 1)];

    expect([startOf(elbow), curves(elbow) > 2 * curves(straight)]).toEqual([startOf(straight), true]);
  });

  // The first link leaves the root, at the centre; the second leaves A, on the first ring.
  it("turn a radial tree's elbow on its parent's ring, not its child's", () => {
    const spec = tree(FAMILY, { display: 'radialTree', links: 'elbow' });
    const [centre, [start, next]] = [vertices(linkPath(spec, 0))[0]!, vertices(linkPath(spec, 1))];

    expect(distance(next!, centre)).toBeCloseTo(distance(start!, centre), 1);
  });

  it('write the names of a radial tree whose short leaf names lie at the top and the bottom', () => {
    const digits = { name: 'R', children: [{ name: '8', value: 3 }, { name: '1', value: 2 }, { name: '7', value: 1 }] };
    expect(names(layoutChart(tree(digits, { display: 'radialTree' })))).toEqual(['R', '8', '1', '7']);
  });

  it("write a parent's name on the root's side of its level in a tree running up", () => {
    const layout = layoutChart(tree(FAMILY, { direction: 'up' }));

    expect(topOf(layout, 'A')).toBeGreaterThan(bottomOf(layout, 'B'));
  });

  it("write the root's name of a quarter radial tree beside its centre on the plot's edge", () => {
    expect(names(layoutChart(tree(FAMILY, { display: 'radialTree', startAngle: 0, endAngle: 90 })))).toContain('root');
  });

  it.each([
    [0, 90],
    [90, 180],
    [180, 270],
    [270, 360],
  ])("write the root's name of a radial tree from %i to %i degrees on a square chart, its centre a corner of the plot", (startAngle, endAngle) => {
    expect(names(layoutChart(tree(FAMILY, { display: 'radialTree', startAngle, endAngle }, { width: 300, height: 300 })))).toContain('root');
  });

  it.each(NODE_LINK_EXAMPLES)('write no name of the example $name over another, or outside the chart', ({ spec }) => {
    const layout = layoutChart(spec as ChartSpec);

    expect([overlappingTexts(layout), labelsOutside(layout)]).toEqual([[], 0]);
  });
});

describe('hierarchy specs drawn as nodes and links', () => {
  it.each([
    ['a value on a parent', tree(one({ name: 'A', value: 1, children: [{ name: 'a' }] })), 'series[0].data.children[0].value must be left out: a node with children takes the sum of their values'],
    ['a colour on the root', tree({ ...one({ name: 'A' }), color: 'red' }), 'series[0].data.color must be left out: the root is drawn in ink, apart from its branches; give each branch below it a color'],
    ['a root alone', tree({ name: 'root' }), 'series[0].data.children is missing: a tree of one node has no links to draw'],
    ['a length the levels are not spaced by', tree(one({ name: 'A', length: 2 })), "series[0].data.children[0].length must be left out, or the series given distance: 'length': with distance: 'depth', lengths are not drawn"],
    ['a length on the root', tree({ ...one({ name: 'A', length: 1 }), length: 1 }, { distance: 'length' }), 'series[0].data.length must be left out: the root is where lengths start from'],
    ['a missing length', tree(one({ name: 'A' }), { distance: 'length' }), 'series[0].data.children[0].length is missing'],
    ['a length on an indented tree', tree(one({ name: 'A', length: 1 }), { display: 'indented' }), "series[0].data.children[0].length must be left out: only a tree or a radialTree given distance: 'length' draws lengths"],
    ['no length above 0', tree(one({ name: 'A', length: 0 }), { distance: 'length' }), 'series[0].data has no length above 0, so every node would lie on the root'],
    ['boxes on a radial tree', tree(one({ name: 'A' }), { display: 'radialTree', nodeShape: 'box' }), 'series[0] has an unknown key, "nodeShape"'],
    ['boxes spaced by length', tree(one({ name: 'A', length: 1 }), { nodeShape: 'box', distance: 'length' }), "series[0].nodeShape must be 'dot' with distance: 'length': boxes are spaced a level apart, so they cannot show lengths"],
    ['boxes spaced by length, before a missing length', tree(one({ name: 'A' }), { nodeShape: 'box', distance: 'length' }), "series[0].nodeShape must be 'dot' with distance: 'length': boxes are spaced a level apart, so they cannot show lengths"],
    ['a root alone, before a bad sort', tree({ name: 'root' }, { sort: 1 }), 'series[0].data.children is missing: a tree of one node has no links to draw'],
    ['a sunburst\'s bad startAngle, before a bad innerRadius', tree(one({ name: 'A', value: 1 }), { display: 'sunburst', startAngle: 500, innerRadius: 5 }), 'series[0].startAngle must be a number from -360 to 360, got 500'],
    ['a treemap\'s bad parents, before a bad tile', tree(one({ name: 'A', value: 1 }), { display: 'treemap', tile: 'bogus', parents: 'bogus' }), 'series[0].parents must be one of hidden, nested, cascaded, got "bogus"'],
    ['a length on a treemap', tree(one({ name: 'A', value: 1, length: 1 }), { display: 'treemap' }), 'series[0].data.children[0] has an unknown key, "length"'],
    ['a treemap leaf with no value', tree(one({ name: 'A' }), { display: 'treemap' }), 'series[0].data.children[0].value is missing'],
  ])('refuse %s', (_, spec, message) => {
    expect(laying(spec)).toThrow(`Invalid chart: ${message}`);
  });
});
