import { describe, expect, it } from 'vitest';
import { layoutChart, type ChartSpec } from '@borrowdale/charts';
import { Drawing } from '../src/drawing.js';
import { legendEntries } from '../src/layout.js';
import { checkChart } from '../src/validate.js';
import { laying, placedTexts, placesOf, pointsOnCurves, pointsOutside, shapesOf, titles } from './support/layout.js';

// Every chart `hierarchy` makes is 400 by 300, its legend left out unless a test asks for it.
function hierarchy(data: object, options: object = {}, chart: object = {}): ChartSpec {
  return {
    width: 400, height: 300, legend: 'none', style: { roughness: 0 },
    series: [{ type: 'hierarchy', name: 'H', display: 'treemap', data, ...options }],
    ...chart,
  } as ChartSpec;
}
const TREE = {
  name: 'root',
  children: [
    { name: 'A', children: [{ name: 'A1', value: 30 }, { name: 'A2', value: 22 }, { name: 'A3', value: 31 }] },
    { name: 'B', children: [{ name: 'B1', value: 7 }, { name: 'B2', value: 4 }] },
    { name: 'C', value: 4 },
  ],
};
/** A chain of `levels` parents below the root, ending in one leaf. */
function chain(levels: number): object {
  return levels === 0 ? { name: 'leaf', value: 1 } : { name: `level ${levels}`, children: [chain(levels - 1)] };
}
/** A root, one branch, and `count` leaves below it: `count` + 2 nodes. */
const many = (count: number) => ({ name: 'root', children: [{ name: 'branch', children: Array.from({ length: count }, (_, i) => ({ name: `n${i}`, value: 1 })) }] });
// Four parents with room for their names, which a nested treemap writes in a strip along each top.
const PARENTS = ['Alpha', 'Beta', 'Gamma', 'Delta'];
const NESTED = { name: 'r', children: PARENTS.map((name) => ({ name, children: [1, 2, 3].map((i) => ({ name: `${name[0]}${i}`, value: 10 * i })) })) };
/** The parents' names a 600 by 400 nested treemap writes at `fontSize`. */
const writtenAt = (fontSize: number) =>
  layoutChart({ width: 600, height: 400, fontSize, legend: 'none', series: [{ type: 'hierarchy', name: 'H', display: 'treemap', parents: 'nested', data: NESTED }] } as ChartSpec)
    .labels.filter((label) => PARENTS.includes(label));
/** Every text drawn, in the order first drawn: with no legend, the names written in the marks. */
const written = (spec: ChartSpec) => layoutChart(spec).labels;
/** The stroke colour of the fill drawn for the mark titled `title`, and its number of paths. */
function fillOf(spec: ChartSpec, title: string): string {
  const [first] = shapesOf(layoutChart(spec), title);
  return first?.kind === 'sketch' ? `${first.sketch.paths[0]!.stroke} ${first.sketch.paths.length}` : '';
}
const legendColors = (spec: ChartSpec) => legendEntries(checkChart(spec)).map((entry) => entry.paint.color);
const displayOf = (spec: ChartSpec) => {
  const chart = checkChart(spec);
  return chart.system === 'hierarchy' ? chart.series[0]!.display : '';
};
/**
 * The direction of the hachure lines drawn for the mark titled `title`, in whole degrees from 0 to
 * 179: the direction of the longest stroke of its fill.
 */
function hatchOf(spec: ChartSpec, title: string): number {
  const [first] = shapesOf(layoutChart(spec), title);
  const d = first?.kind === 'sketch' ? first.sketch.paths[0]!.d : '';
  const strokes = d.split('M').filter(Boolean).map((part) => part.match(/-?\d+(?:\.\d+)?/g)!.map(Number));
  const [x0, y0, x1, y1] = strokes.map((n) => [n[0]!, n[1]!, n.at(-2)!, n.at(-1)!]).sort((a, b) => Math.hypot(b[2]! - b[0]!, b[3]! - b[1]!) - Math.hypot(a[2]! - a[0]!, a[3]! - a[1]!))[0]!;
  return (Math.round((Math.atan2(y1! - y0!, x1! - x0!) * 180) / Math.PI) + 360) % 180;
}
/** The angle between the hatching of two marks, 0 to 90 degrees. */
function turnBetween(spec: ChartSpec, first: string, second: string): number {
  const turn = Math.abs(hatchOf(spec, first) - hatchOf(spec, second)) % 180;
  return Math.min(turn, 180 - turn);
}
// Eight branches, so the eighth takes the palette's first colour at its second hatching angle. The
// first branch has a child, and the eighth a child with its own colour.
const EIGHT = {
  name: 'root',
  children: [
    { name: 'b0', children: [{ name: 'c0', value: 10 }] },
    ...[1, 2, 3, 4, 5, 6].map((i) => ({ name: `b${i}`, value: 10 })),
    { name: 'b7', children: [{ name: 'c7', color: '#e69f00', value: 10 }] },
  ],
};
// A branch of two small leaves beside a large one: padding of 50 leaves the branch no width.
const CRUSHED = { name: 'root', children: [{ name: 'A', children: [{ name: 'a1', value: 1 }, { name: 'a2', value: 1 }] }, { name: 'B', value: 30 }] };
/** A chain of `levels` nodes named `name`, ending in a leaf of 1. */
function named(name: string, levels: number): object {
  return levels === 1 ? { name, value: 1 } : { name, children: [named(name, levels - 1)] };
}
/**
 * How far, in units, any label of a sunburst of `count` equal branches, each a chain `levels` deep
 * named `name`, reaches outside its own segment. The chart is `size` square with no legend or title,
 * so the rings are centred, the outer radius half the size less the padding of 8 on each side, and
 * each level takes an equal ring.
 */
function overreach(count: number, levels: number, size: number, name: string, cornerRadius = 0): number {
  const spec = hierarchy({ name: 'r', children: Array.from({ length: count }, (_, i) => named(`${name}${i}`, levels)) }, { display: 'sunburst', cornerRadius }, { width: size, height: size });
  const [c, radius, step] = [size / 2, size / 2 - 8, 360 / count];
  const polar = ([x, y]: readonly [number, number]) => [Math.hypot(x - c, y - c), ((Math.atan2(x - c, c - y) * 180) / Math.PI + 360) % 360] as const;
  return Math.max(0, ...placedTexts(layoutChart(spec)).flatMap(({ at, box }) => {
    const [middle, middleAngle] = polar([at[0], at[1]]);
    const first = Math.floor(middleAngle / step) * step;
    const ring = Math.floor((middle / radius) * levels);
    // A rounded corner is cut where the edges are its radius from it: min(cornerRadius, half the depth,
    // the rim's length over half the segment), the tip of a pie left sharp.
    const [rim, depth, halfSweep] = [(ring * radius) / levels, radius / levels, (step * Math.PI) / 360];
    const cut = (r: number) => Math.min(cornerRadius, depth / 2, r * halfSweep);
    const [inner, outer] = [rim === 0 ? 0 : rim + cut(rim), rim + depth - cut(rim + depth)];
    const corners: [number, number][] = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]];
    return corners.map((corner) => {
      const [r, angle] = polar(corner);
      const off = Math.max(first - angle, angle - (first + step), 0);
      return Math.max(r - outer, inner - r, r * Math.sin((Math.min(off, 90) * Math.PI) / 180));
    });
  }));
}
/** The nearest any stroke comes to (x, y). */
const nearestTo = (spec: ChartSpec, x: number, y: number) => Math.min(...pointsOnCurves(layoutChart(spec)).map(([px, py]) => Math.hypot(px - x, py - y)));
/** The left, top, right and bottom of the strokes of the mark titled `title`. */
function boundsOf(spec: ChartSpec, title: string): number[] {
  const marks = layoutChart(spec).nodes.filter((node) => node.kind === 'mark' && node.title === title);
  const points = pointsOnCurves({ ...layoutChart(spec), nodes: marks });
  return [Math.min(...points.map(([x]) => x)), Math.min(...points.map(([, y]) => y)), Math.max(...points.map(([x]) => x)), Math.max(...points.map(([, y]) => y))];
}
/** What `layoutChart` draws for `spec`, to compare two specs. */
const drawn = (spec: ChartSpec) => layoutChart(spec).nodes;
/** The right edge of the drawn text that starts with `prefix`. */
function rightOfText(spec: ChartSpec, prefix: string): number {
  const placed = placedTexts(layoutChart(spec)).find(({ text }) => text.startsWith(prefix));
  return placed === undefined ? NaN : placed.box.x + placed.box.width;
}
// Leaves of 1 and 1e15 side by side, in an order for which d3's enclosing circle gives up.
const FAR_APART = hierarchy({ name: 'root', children: [{ name: 'B', children: [
  { name: 'l0', value: 1 }, { name: 'l1', value: 1e15 }, { name: 'l2', value: 1e15 }, { name: 'l3', value: 1 },
  { name: 'l4', value: 1e15 }, { name: 'l5', value: 1 }, { name: 'l6', value: 1 }, { name: 'l7', value: 1 },
] }] }, { display: 'pack', sort: false, padding: 0 });
// A leaf too small to have any size beside one of 1: its value is lost in rounding.
const SPECK = { name: 'root', children: [{ name: 'One', value: 1 }, { name: 'Speck', value: 1e-300 }] };
/** How far any stroke of a mark below `parent` reaches outside the parent's circle. */
function outsideParent(spec: ChartSpec, parent: string): number {
  const [left, top, right] = boundsOf(spec, parent);
  const [cx, cy, r] = [(left! + right!) / 2, top! + (right! - left!) / 2, (right! - left!) / 2];
  const children = layoutChart(spec).nodes.filter((node) => node.kind === 'mark' && node.title.startsWith(`${parent.split(':')[0]} › `));
  return Math.max(0, ...pointsOnCurves({ ...layoutChart(spec), nodes: children }).map(([x, y]) => Math.hypot(x - cx, y - cy) - r));
}
// Four equal branches, the first named at length.
const FOUR_FOLDERS = { name: 'r', children: [{ name: 'cartesian', value: 1 }, { name: 'polar', value: 1 }, { name: 'pie', value: 1 }, { name: 'units', value: 1 }] };
// A branch whose two leaves, 0 and 1e-306, add up to too little to divide a box by.
const TINY_BRANCH = { name: 'r', children: [{ name: 'a', value: 1 }, { name: 't', children: [{ name: 'z', value: 0 }, { name: 'u', value: 1e-306 }] }] };
const EIGHT_ICICLE = hierarchy(EIGHT, { display: 'icicle' }, { width: 800 });

describe('hierarchies', () => {
  it('read a nested tree, a parent taking the sum of its children', () => {
    const chart = checkChart(hierarchy(TREE));
    expect(chart.system === 'hierarchy' && chart.series[0]!.root.value).toBe(98);
  });

  it.each([
    ['a value on a node with children', { name: 'root', children: [{ name: 'A', value: 3, children: [{ name: 'A1', value: 1 }] }] },
      'series[0].data.children[0].value must be left out: a node with children takes the sum of their values'],
    ['a leaf with no value', { name: 'root', children: [{ name: 'A' }] }, 'series[0].data.children[0].value is missing'],
    ['an unknown key on a node', { name: 'root', children: [{ name: 'A', value: 1, size: 2 }] }, 'series[0].data.children[0] has an unknown key, "size"'],
    ['a root with no children', { name: 'root', value: 3 }, 'series[0].data.children is missing: the root is not drawn, so a tree of one node draws nothing'],
    ['a bare root', { name: 'root' }, 'series[0].data.children is missing: the root is not drawn, so a tree of one node draws nothing'],
    ['a colour on the root', { name: 'root', color: 'red', children: [{ name: 'A', value: 1 }] },
      'series[0].data.color must be left out: the root is not drawn; give each branch below it a color'],
    ['a tree whose values are all 0', { name: 'root', children: [{ name: 'A', value: 0 }] }, 'series[0].data has no value above 0, so there is nothing to draw'],
    ['a 2,001st node, before reading it', many(1999), 'series[0].data.children[0].children brings the tree to at least 2001 nodes, more than the 2000 a hierarchy draws'],
  ])('reject %s', (_, data, message) => {
    expect(laying(hierarchy(data))).toThrow(`Invalid chart: ${message}`);
  });

  it('reject values too small to add up to a drawable total', () => {
    expect(laying(hierarchy({ name: 'root', children: [{ name: 'A', value: 1e-306 }] }))).toThrow(
      'Invalid chart: series[0].data has values adding up to 1e-306, too little to draw: they must add up to at least 1e-300');
  });

  it('pack leaves of 1 and 1e15 side by side, where d3 finds no enclosing circle, inside their parent', () => {
    expect(titles(layoutChart(FAR_APART))).toHaveLength(9);
    // Touching circles, sketched, differ by under a unit; a wrong enclosing circle misses by a radius.
    expect(outsideParent(FAR_APART, 'B: 3,000,000,000,000,005')).toBeLessThan(1);
  });

  // A plain treemap draws its leaves only: 3 marks; an icicle every node: 4. Unsorted, the crushed
  // branch comes first, at the plot's edge, where d3 would put its line half the padding outside.
  it.each([['treemap', 3], ['icicle', 4]])('keep the tooltips of nodes padding leaves no room, drawn inside the plot, in a %s', (display, marks) => {
    expect(titles(layoutChart(hierarchy(CRUSHED, { display, padding: 50, sort: false }, { width: 200, height: 150 })))).toHaveLength(marks);
    expect(pointsOutside(layoutChart(hierarchy(CRUSHED, { display, padding: 50, sort: false }, { width: 200, height: 150 })))).toBe(0);
  });

  it.each([['sunburst', 'sunburst'], ['pack', 'pack']])('keep the tooltip of a leaf too small to draw, in a %s', (_, display) => {
    expect(titles(layoutChart(hierarchy(SPECK, { display })))).toContain('Speck: 0.00000000000000000000');
  });

  it.each([['slice-dice', { tile: 'sliceDice' }], ['cascaded', { parents: 'cascaded', padding: 50 }]])(
    'reject a branch whose values add up to too little to draw, in a %s treemap', (_, options) => {
      expect(laying(hierarchy(TINY_BRANCH, { sort: false, ...options }))).toThrow(
        'Invalid chart: series[0].data.children[1] has values adding up to 1e-306, too little to draw: they must add up to at least 1e-300');
    });

  it('reject a pack whose values are too small for its tolerance', () => {
    expect(laying(hierarchy({ name: 'r', children: [{ name: 'a', value: 2.4e-21 }, { name: 'b', value: 7.6e-78 }] }, { display: 'pack' }))).toThrow(
      'Invalid chart: series[0].data has no value of at least 1e-12, too small to pack: circles are packed to within 1e-9, so scale the values up');
  });

  it('reject a pack whose leaves are each too small, though they add up to enough', () => {
    expect(laying(hierarchy({ name: 'r', children: [{ name: 'a', value: 6e-13 }, { name: 'b', value: 6e-13 }] }, { display: 'pack' }))).toThrow(
      'Invalid chart: series[0].data has no value of at least 1e-12, too small to pack: circles are packed to within 1e-9, so scale the values up');
  });

  it('pack a tree whose largest value is 1e-12', () => {
    expect(titles(layoutChart(hierarchy({ name: 'r', children: [{ name: 'a', value: 1e-12 }, { name: 'b', value: 5e-13 }] }, { display: 'pack' })))).toHaveLength(2);
  });

  it('reject a negative value', () => {
    expect(laying(hierarchy({ name: 'root', children: [{ name: 'A', value: -1 }] }))).toThrow(/^Invalid chart: series\[0\]\.data\.children\[0\]\.value must be /);
  });

  it('reject two siblings of the same name', () => {
    expect(laying(hierarchy({ name: 'root', children: [{ name: 'A', value: 1 }, { name: 'A', value: 2 }] }))).toThrow(
      /^Invalid chart: series\[0\]\.data\.children\[1\]\.name /);
  });

  it('allow one name under two parents', () => {
    const tree = { name: 'root', children: [{ name: 'A', children: [{ name: 'Other', value: 1 }] }, { name: 'B', children: [{ name: 'Other', value: 2 }] }] };
    expect(laying(hierarchy(tree))).not.toThrow();
  });

  it('draw ten levels below the root', () => {
    expect(laying(hierarchy({ name: 'root', children: [chain(9)] }))).not.toThrow();
  });

  it('reject an eleventh level', () => {
    expect(laying(hierarchy({ name: 'root', children: [chain(10)] }))).toThrow(
      /^Invalid chart: series\[0\]\.data(\.children\[0\]){10}\.children would be level 11 below the root, deeper than the 10 levels a hierarchy draws$/);
  });

  it('draw 2,000 nodes', () => {
    expect(laying(hierarchy(many(1998)))).not.toThrow();
  });

  it('reject an option of another display', () => {
    expect(laying(hierarchy(TREE, { innerRadius: 0.5 }))).toThrow('Invalid chart: series[0] has an unknown key, "innerRadius"');
  });

  it('reject a treemap parents value it does not know', () => {
    expect(laying(hierarchy(TREE, { parents: 'shown' }))).toThrow(/^Invalid chart: series\[0\]\.parents must be one of /);
  });

  it.each([['nested', { nested: true }], ['cascade', { cascade: true }], ['orientation', { display: 'icicle', orientation: 'up' }]])(
    'reject %s, an unreleased name for parents or direction', (key, options) => {
      expect(laying(hierarchy(TREE, options))).toThrow(`Invalid chart: series[0] has an unknown key, "${key}"`);
    });

  it('reject a second series', () => {
    expect(laying({ ...hierarchy(TREE), series: [{ type: 'hierarchy', name: 'H', display: 'pack', data: TREE }, { type: 'hierarchy', name: 'I', display: 'pack', data: TREE }] })).toThrow(
      'Invalid chart: series of a hierarchy must be one hierarchy series, got 2');
  });

  it('reject axes', () => {
    expect(laying(hierarchy(TREE, {}, { axes: { x: { type: 'linear' } } }))).toThrow('Invalid chart: axes must be left out: a hierarchy has no axes');
  });

  it('pick the drawing by display', () => {
    expect(displayOf(hierarchy(TREE, { display: 'sunburst' }))).toBe('sunburst');
  });

  it('give each leaf of a treemap a tooltip with its path and value, largest first', () => {
    expect(titles(layoutChart(hierarchy(TREE)))).toEqual(['A › A3: 31', 'A › A1: 30', 'A › A2: 22', 'B › B1: 7', 'B › B2: 4', 'C: 4']);
  });

  it('keep the given order when not sorting', () => {
    expect(titles(layoutChart(hierarchy(TREE, { sort: false })))).toEqual(['A › A1: 30', 'A › A2: 22', 'A › A3: 31', 'B › B1: 7', 'B › B2: 4', 'C: 4']);
  });

  it('draw the parents of a nested treemap, each with its name', () => {
    expect(titles(layoutChart(hierarchy(TREE, { parents: 'nested' })))).toEqual(['A: 83', 'A › A3: 31', 'A › A1: 30', 'A › A2: 22', 'B: 11', 'B › B1: 7', 'B › B2: 4', 'C: 4']);
    expect(written(hierarchy(TREE, { parents: 'nested' }))).toContain('A');
  });

  it.each(['sunburst', 'icicle', 'pack'])('draw every node below the root of a %s', (display) => {
    expect(titles(layoutChart(hierarchy(TREE, { display })))).toHaveLength(8);
  });

  it('draw nothing for a leaf of 0', () => {
    const tree = { name: 'root', children: [{ name: 'A', value: 2 }, { name: 'Z', value: 0 }] };
    expect(titles(layoutChart(hierarchy(tree)))).toEqual(['A: 2']);
  });

  it('write each name inside its mark', () => {
    expect(written(hierarchy(TREE))).toEqual(['A3', 'A1', 'A2', 'B1', 'B2', 'C']);
  });

  it('write each value after its name with dataLabels', () => {
    expect(written(hierarchy(TREE, { dataLabels: true }))).toContain('A3: 31');
  });

  it.each([10, 12, 13, 14, 16])('write every name of a nested treemap whose parents have room, at font size %i', (fontSize) => {
    expect(writtenAt(fontSize)).toEqual(PARENTS);
  });

  it('leave out the name of a mark too small for it, keeping its tooltip', () => {
    const tree = { name: 'root', children: [{ name: 'Large', value: 10_000 }, { name: 'Tiny', value: 1 }] };
    expect(written(hierarchy(tree))).toEqual(['Large']);
    expect(titles(layoutChart(hierarchy(tree)))).toContain('Tiny: 1');
  });

  it.each([
    ['treemap', { tile: 'binary', parents: 'cascaded' }],
    ['sunburst', { startAngle: -90, endAngle: 90, cornerRadius: 4 }],
    ['icicle', { direction: 'left' }],
    ['pack', { padding: 6 }],
  ])('keep every stroke and label of a %s inside the chart', (display, options) => {
    expect(pointsOutside(layoutChart(hierarchy(TREE, { display, ...options })))).toBe(0);
  });

  it('put the first level of a flame graph at the bottom', () => {
    const layout = layoutChart(hierarchy(TREE, { display: 'icicle', direction: 'up' }));
    expect(placesOf(layout, 'A')[0]![1]).toBeGreaterThan(placesOf(layout, 'A3')[0]![1]);
  });

  it('put the first level of an icicle at the top', () => {
    const layout = layoutChart(hierarchy(TREE, { display: 'icicle' }));
    expect(placesOf(layout, 'A')[0]![1]).toBeLessThan(placesOf(layout, 'A3')[0]![1]);
  });

  it('put the first level of a leftward icicle on the right', () => {
    const layout = layoutChart(hierarchy(TREE, { display: 'icicle', direction: 'left' }));
    expect(placesOf(layout, 'A')[0]![0]).toBeGreaterThan(placesOf(layout, 'A3')[0]![0]);
  });

  it('write each value after the name of a parent too, with dataLabels', () => {
    expect(written(hierarchy(TREE, { display: 'icicle', dataLabels: true }))).toContain('A: 83');
  });

  it('leave a sunburst\'s hole empty', () => {
    // The plot is 384 by 284 inside the padding of 8, so the full circle has radius 142 about (200, 150).
    expect(nearestTo(hierarchy(TREE, { display: 'sunburst', innerRadius: 0.5 }), 200, 150)).toBeGreaterThan(70);
  });

  it('round a sunburst\'s corners with cornerRadius', () => {
    expect(drawn(hierarchy(TREE, { display: 'sunburst', cornerRadius: 4 }))).not.toEqual(drawn(hierarchy(TREE, { display: 'sunburst' })));
  });

  it.each([
    ['treemap', { padding: 2 }],
    ['icicle', { padding: 2 }],
    ['pack', { padding: 2 }],
    ['sunburst', { innerRadius: 0, startAngle: 0, endAngle: 360, cornerRadius: 0 }],
  ])('draw a %s as its defaults spelt out draw it', (display, options) => {
    expect(drawn(hierarchy(TREE, { display }))).toEqual(drawn(hierarchy(TREE, { display, ...options })));
  });

  it('outline a packed parent, filling its leaves', () => {
    expect(fillOf(hierarchy(TREE, { display: 'pack' }), 'A: 83')).toMatch(/ 1$/);
    expect(fillOf(hierarchy(TREE, { display: 'pack' }), 'A › A3: 31')).toMatch(/ 2$/);
  });

  it('write no name over a packed parent', () => {
    expect(written(hierarchy(TREE, { display: 'pack' }))).not.toContain('A');
  });

  // A sketched stroke lies within a few hundredths of a unit of its box, even with roughness 0.
  it('set a cascaded treemap\'s children 6 in from their parent\'s left, and flush with its right', () => {
    const cascaded = hierarchy(TREE, { parents: 'cascaded' });
    expect(Math.abs(boundsOf(cascaded, 'B › B1: 7')[0]! - boundsOf(cascaded, 'B: 11')[0]! - 6)).toBeLessThan(0.1);
    expect(Math.abs(boundsOf(cascaded, 'B: 11')[2]! - boundsOf(cascaded, 'B › B1: 7')[2]!)).toBeLessThan(0.1);
  });

  it('keep a nested parent\'s name 2 in from its right edge', () => {
    const narrow = { name: 'r', children: [{ name: 'A very long parent name indeed', children: [{ name: 'x', value: 1 }] }, { name: 'B', value: 4 }] };
    const spec = hierarchy(narrow, { parents: 'nested', padding: 0 });
    expect(rightOfText(spec, 'A very')).toBeLessThanOrEqual(boundsOf(spec, 'A very long parent name indeed: 1')[2]! - 2);
  });

  it('put the first level of a rightward icicle on the left', () => {
    const layout = layoutChart(hierarchy(TREE, { display: 'icicle', direction: 'right' }));
    expect(placesOf(layout, 'A')[0]![0]).toBeLessThan(placesOf(layout, 'A3')[0]![0]);
  });
});

// A drawing for the label helper, and the width its ellipsis takes in the chart's font.
const drawing = new Drawing(checkChart(hierarchy(TREE)));
const ELLIPSIS_WIDTH = drawing.width('…');
const LINE = drawing.lineHeight();
const inside = (text: string, width: number, height: number, start = false) => drawing.inside(text, { left: 0, top: 0, right: width, bottom: height }, start);
/** Where a text node was placed. */
const pivotOf = (node: ReturnType<typeof inside>) => (node?.kind === 'text' ? node.text.pivot : undefined);

describe('labels inside marks', () => {
  it('fit a name with room for it', () => {
    expect(inside('Groceries', 200, 40)).toBeDefined();
  });

  it('leave out a name in a box too short for a line', () => {
    expect(inside('Groceries', 200, LINE - 1)).toBeUndefined();
  });

  it('leave out a name in a box with room for its ellipsis only', () => {
    expect(inside('Groceries', ELLIPSIS_WIDTH + 0.5, 40)).toBeUndefined();
  });

  it('start a name at the left edge of its box with start, halfway down', () => {
    expect(pivotOf(inside('A', 200, 40, true))).toEqual([0, 20]);
  });

  it('centre a name in its box', () => {
    expect(pivotOf(inside('A', 200, 40))).toEqual([100, 20]);
  });

  it('leave out an empty name', () => {
    expect(inside('', 200, 40)).toBeUndefined();
  });
});

describe('hierarchy colours', () => {
  it('list the branches below the root in the legend', () => {
    expect(layoutChart(hierarchy(TREE, {}, { legend: 'top' })).labels.slice(0, 3)).toEqual(['A', 'B', 'C']);
  });

  it('give each branch the next palette colour', () => {
    expect(legendColors(hierarchy(TREE))).toEqual(['#e69f00', '#56b4e9', '#009e73']);
  });

  it('colour every node below a branch as the branch', () => {
    expect(fillOf(hierarchy(TREE), 'B › B2: 4')).toMatch(/^#56b4e9 /);
  });

  it('colour a node and those below it by its own colour', () => {
    const tree = { name: 'root', children: [{ name: 'A', children: [{ name: 'A1', color: 'red', children: [{ name: 'x', value: 1 }] }] }] };
    expect(fillOf(hierarchy(tree), 'A › A1 › x: 1')).toMatch(/^red /);
  });

  it('write a sunburst label that fits whole, at a diagonal', () => {
    expect(written(hierarchy(FOUR_FOLDERS, { display: 'sunburst' }, { width: 400, height: 400 }))).toContain('cartesian');
  });

  it.each([
    // Each of these crossed its segment by about a unit with a label square sized by arc length only.
    [8, 4, 420, 'Hello'],
    [10, 4, 512, 'Hello'],
    [20, 2, 512, 'a'],
    [16, 2, 420, 'a'],
    // Long names in wide segments, where the outer circle and the hole, not the edges, bound a label.
    [2, 2, 400, 'A rather long name'],
    [2, 3, 360, 'A rather long name'],
    [3, 2, 500, 'A rather long name'],
    [4, 4, 600, 'A rather long name'],
  ])('keep each label of a sunburst of %i branches %i levels deep, %i wide, inside its segment', (count, levels, size, name) => {
    expect(overreach(count, levels, size, name)).toBeLessThan(0.01);
  });

  it.each([
    // A long name in a segment rounded by the most a corner may be.
    [3, 2, 600, 'A rather long name', 1000],
    [8, 4, 420, 'Hello', 8],
    [4, 4, 600, 'A rather long name', 30],
  ])('keep each label of a sunburst of %i branches %i levels deep, %i wide, clear of corners rounded by %s', (count, levels, size, name, corner) => {
    expect(overreach(count, levels, size, name, corner)).toBeLessThan(0.01);
  });

  it('show a branch\'s own colour in the legend, the others taking the palette in turn', () => {
    expect(legendColors(hierarchy({ name: 'r', children: [{ name: 'A', color: 'red', value: 1 }, { name: 'B', value: 1 }] }))).toEqual(['red', '#e69f00']);
  });

  it('turn the hatching 45 degrees on every other level', () => {
    expect(turnBetween(hierarchy(TREE, { display: 'icicle' }), 'A › A3: 31', 'A: 83')).toBe(45);
  });

  it('never hatch a child with its own colour like its parent', () => {
    expect(turnBetween(EIGHT_ICICLE, 'b7 › c7: 10', 'b7: 10')).toBe(45);
  });

  it('never hatch a node below one branch like another branch of its colour', () => {
    expect(turnBetween(EIGHT_ICICLE, 'b0 › c0: 10', 'b7: 10')).not.toBe(0);
  });
});
