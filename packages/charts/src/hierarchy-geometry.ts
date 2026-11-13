// The space-filling hierarchy layouts: treemap tilings, partition and circle packing. A port of
// d3-hierarchy 3.1.3 (Copyright 2010-2026 Mike Bostock, ISC; see THIRD_PARTY_NOTICES.md): treemap,
// squarify, binary, dice, slice and slice-dice from src/treemap/, partition from src/partition.js, and
// pack, siblings and enclose from src/pack/, with its seeded linear congruential generator from
// src/lcg.js. They use + − × ÷, sqrt, min, max and abs only, so every JavaScript engine places the
// same nodes. Positions are in the units of the size given; a caller scales and moves them.

/** A node being laid out: its value, the sum of its leaves', and where a layout puts it. */
export interface LaidOut<T> {
  item: T;
  value: number;
  depth: number;
  /** The most levels below it: 0 for a leaf. */
  height: number;
  children: LaidOut<T>[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  x: number;
  y: number;
  r: number;
}

/**
 * `tree` as nodes to lay out, each with its value; siblings largest first, a tie in the given order,
 * unless `sort` is false.
 */
export function placed<T extends { value: number; children: readonly T[] }>(tree: T, sort: boolean, depth = 0): LaidOut<T> {
  const children = tree.children.map((child) => placed(child, sort, depth + 1));
  if (sort) children.sort((a, b) => b.value - a.value);
  return {
    item: tree,
    value: tree.value,
    depth,
    height: children.length === 0 ? 0 : 1 + Math.max(...children.map((child) => child.height)),
    children,
    x0: 0, y0: 0, x1: 0, y1: 0, x: 0, y: 0, r: 0,
  };
}

/** Every node, each before its children. */
function eachBefore<T>(root: LaidOut<T>, visit: (node: LaidOut<T>) => void): void {
  const stack = [root];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    visit(node);
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]!);
  }
}

/**
 * Every node, each after its children, in d3's order: packing draws from one generator as it goes,
 * so the order decides which numbers each enclosing circle shuffles by.
 */
function eachAfter<T>(root: LaidOut<T>, visit: (node: LaidOut<T>) => void): void {
  const nodes = [root];
  const next: LaidOut<T>[] = [];
  for (let node = nodes.pop(); node !== undefined; node = nodes.pop()) {
    next.push(node);
    nodes.push(...node.children);
  }
  for (let node = next.pop(); node !== undefined; node = next.pop()) visit(node);
}

/** How a treemap splits a parent's rectangle among its children. */
export type Tiling = (parent: LaidOut<unknown>, x0: number, y0: number, x1: number, y1: number) => void;

/** Children side by side across the rectangle, each as wide as its share of the parent's value. */
export const dice: Tiling = (parent, x0, y0, x1, y1) => {
  const k = parent.value && (x1 - x0) / parent.value;
  for (const node of parent.children) {
    node.y0 = y0;
    node.y1 = y1;
    node.x0 = x0;
    node.x1 = x0 += node.value * k;
  }
};

/** Children stacked down the rectangle, each as tall as its share of the parent's value. */
export const slice: Tiling = (parent, x0, y0, x1, y1) => {
  const k = parent.value && (y1 - y0) / parent.value;
  for (const node of parent.children) {
    node.x0 = x0;
    node.x1 = x1;
    node.y0 = y0;
    node.y1 = y0 += node.value * k;
  }
};

/** Slice at odd depths, dice at even ones. */
export const sliceDice: Tiling = (parent, x0, y0, x1, y1) => {
  (parent.depth & 1 ? slice : dice)(parent, x0, y0, x1, y1);
};

/** The golden ratio, the aspect ratio squarify aims for. */
const PHI = (1 + Math.sqrt(5)) / 2;

/**
 * Bruls, Huizing and van Wijk's squarified treemap: rows of children, each row kept while adding a
 * child brings its worst aspect ratio nearer to `PHI`.
 */
export const squarify: Tiling = (parent, x0, y0, x1, y1) => {
  const nodes = parent.children;
  const n = nodes.length;
  let value = parent.value;
  let i0 = 0;
  let i1 = 0;
  while (i0 < n) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    // The next non-empty node.
    let sumValue: number;
    do sumValue = nodes[i1++]!.value;
    while (!sumValue && i1 < n);
    let minValue = sumValue;
    let maxValue = sumValue;
    const alpha = Math.max(dy / dx, dx / dy) / (value * PHI);
    let beta = sumValue * sumValue * alpha;
    let minRatio = Math.max(maxValue / beta, beta / minValue);
    // Nodes join the row while its aspect ratio holds or improves.
    for (; i1 < n; ++i1) {
      const nodeValue = nodes[i1]!.value;
      sumValue += nodeValue;
      if (nodeValue < minValue) minValue = nodeValue;
      if (nodeValue > maxValue) maxValue = nodeValue;
      beta = sumValue * sumValue * alpha;
      const newRatio = Math.max(maxValue / beta, beta / minValue);
      if (newRatio > minRatio) {
        sumValue -= nodeValue;
        break;
      }
      minRatio = newRatio;
    }
    const row = { ...parent, value: sumValue, children: nodes.slice(i0, i1) };
    if (dx < dy) dice(row, x0, y0, x1, value ? (y0 += (dy * sumValue) / value) : y1);
    else slice(row, x0, y0, value ? (x0 += (dx * sumValue) / value) : x1, y1);
    value -= sumValue;
    i0 = i1;
  }
};

/** Children split in two halves of nearly equal value, again and again, across the longer side. */
export const binary: Tiling = (parent, x0, y0, x1, y1) => {
  const nodes = parent.children;
  const n = nodes.length;
  const sums = [0];
  for (const node of nodes) sums.push(sums.at(-1)! + node.value);
  const split = (i: number, j: number, value: number, x0: number, y0: number, x1: number, y1: number): void => {
    if (i >= j - 1) {
      const node = nodes[i]!;
      node.x0 = x0;
      node.y0 = y0;
      node.x1 = x1;
      node.y1 = y1;
      return;
    }
    const valueOffset = sums[i]!;
    const valueTarget = value / 2 + valueOffset;
    let k = i + 1;
    let hi = j - 1;
    while (k < hi) {
      const mid = (k + hi) >>> 1;
      if (sums[mid]! < valueTarget) k = mid + 1;
      else hi = mid;
    }
    if (valueTarget - sums[k - 1]! < sums[k]! - valueTarget && i + 1 < k) --k;
    const valueLeft = sums[k]! - valueOffset;
    const valueRight = value - valueLeft;
    if (x1 - x0 > y1 - y0) {
      const xk = value ? (x0 * valueRight + x1 * valueLeft) / value : x1;
      split(i, k, valueLeft, x0, y0, xk, y1);
      split(k, j, valueRight, xk, y0, x1, y1);
    } else {
      const yk = value ? (y0 * valueRight + y1 * valueLeft) / value : y1;
      split(i, k, valueLeft, x0, y0, x1, yk);
      split(k, j, valueRight, x0, yk, x1, y1);
    }
  };
  split(0, n, parent.value, x0, y0, x1, y1);
};

/**
 * The room a treemap leaves between siblings (`inner`), and inside each parent below the root around
 * its children; the root keeps none, so the treemap reaches the edges.
 */
export interface Padding {
  inner: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** A treemap of `root` in a `dx` by `dy` rectangle at the origin. */
export function treemap<T>(root: LaidOut<T>, tile: Tiling, dx: number, dy: number, padding: Padding): void {
  const half = padding.inner / 2;
  root.x0 = 0;
  root.y0 = 0;
  root.x1 = dx;
  root.y1 = dy;
  eachBefore(root, (node) => {
    // Each node gives up half the room between siblings on every side: d3's inner padding.
    let p = node === root ? 0 : half;
    let x0 = node.x0 + p;
    let y0 = node.y0 + p;
    let x1 = node.x1 - p;
    let y1 = node.y1 - p;
    if (x1 < x0) x0 = x1 = (x0 + x1) / 2;
    if (y1 < y0) y0 = y1 = (y0 + y1) / 2;
    node.x0 = x0;
    node.y0 = y0;
    node.x1 = x1;
    node.y1 = y1;
    if (node.children.length > 0) {
      p = half;
      const outer = node === root ? { top: 0, right: 0, bottom: 0, left: 0 } : padding;
      x0 += outer.left - p;
      y0 += outer.top - p;
      x1 -= outer.right - p;
      y1 -= outer.bottom - p;
      if (x1 < x0) x0 = x1 = (x0 + x1) / 2;
      if (y1 < y0) y0 = y1 = (y0 + y1) / 2;
      tile(node, x0, y0, x1, y1);
    }
  });
}

/**
 * An icicle of `root` in a `dx` by `dy` rectangle at the origin: `dy` split into one equal band for
 * each level below the root, which is not drawn, and each node as wide across its band as its share
 * of its parent. Each node then gives up `padding` on its far sides.
 */
export function partition<T>(root: LaidOut<T>, dx: number, dy: number, padding: number): void {
  const n = root.height;
  root.x0 = 0;
  root.x1 = dx;
  eachBefore(root, (node) => {
    if (node.children.length > 0) dice(node, node.x0, (dy * node.depth) / n, node.x1, (dy * (node.depth + 1)) / n);
    if (node === root) return;
    let x0 = node.x0;
    let y0 = node.y0;
    let x1 = node.x1 - padding;
    let y1 = node.y1 - padding;
    if (x1 < x0) x0 = x1 = (x0 + x1) / 2;
    if (y1 < y0) y0 = y1 = (y0 + y1) / 2;
    node.x0 = x0;
    node.y0 = y0;
    node.x1 = x1;
    node.y1 = y1;
  });
}

/** A circle. */
interface Disc {
  x: number;
  y: number;
  r: number;
}

/** d3's linear congruential generator: exact in doubles, as a × s + c stays below 2^53. */
function lcg(): () => number {
  let s = 1;
  return () => (s = (1664525 * s + 1013904223) % 4294967296) / 4294967296;
}

/**
 * Circle packing of `root` in a `dx` by `dy` rectangle at the origin: each leaf a circle of radius
 * √value, siblings packed around each other and enclosed, `padding` between siblings, the whole
 * scaled to fit.
 */
export function pack<T>(root: LaidOut<T>, dx: number, dy: number, padding: number): void {
  const random = lcg();
  root.x = dx / 2;
  root.y = dy / 2;
  eachBefore(root, (node) => {
    if (node.children.length === 0) node.r = Math.max(0, Math.sqrt(node.value));
  });
  eachAfter(root, packChildren(0, 1, random));
  eachAfter(root, packChildren(padding, root.r / Math.min(dx, dy), random));
  const k = Math.min(dx, dy) / (2 * root.r);
  eachBefore(root, (node) => {
    node.r *= k;
    for (const child of node.children) {
      child.x = node.x + k * child.x;
      child.y = node.y + k * child.y;
    }
  });
}

/** Packs a node's children, `padding` × `k` apart, and gives the node the radius enclosing them. */
function packChildren<T>(padding: number, k: number, random: () => number) {
  return (node: LaidOut<T>): void => {
    const children = node.children;
    if (children.length === 0) return;
    const r = padding * k || 0;
    if (r) for (const child of children) child.r += r;
    const e = packSiblings(children, random);
    if (r) for (const child of children) child.r -= r;
    node.r = e + r;
  };
}

/** A circle on the front chain, between its neighbours. */
interface Link {
  disc: Disc;
  next: Link;
  previous: Link;
}

/** A circle on its own, before it joins the front chain. */
function link(disc: Disc): Link {
  const node = { disc } as Link;
  node.next = node;
  node.previous = node;
  return node;
}

/** Places `circles` around each other, front chain first, and centres their enclosing circle on the origin; its radius. */
function packSiblings(circles: readonly Disc[], random: () => number): number {
  const n = circles.length;
  if (n === 0) return 0;
  const first = circles[0]!;
  first.x = 0;
  first.y = 0;
  if (n === 1) return first.r;
  const second = circles[1]!;
  first.x = -second.r;
  second.x = first.r;
  second.y = 0;
  if (n === 2) return first.r + second.r;
  place(second, first, circles[2]!);
  let a = link(first);
  let b = link(second);
  let c = link(circles[2]!);
  a.next = c.previous = b;
  b.next = a.previous = c;
  c.next = b.previous = a;
  pack: for (let i = 3; i < n; ++i) {
    place(a.disc, b.disc, circles[i]!);
    c = link(circles[i]!);
    // The closest intersecting circle on the front chain, by distance along the chain.
    let j = b.next;
    let k = a.previous;
    let sj = b.disc.r;
    let sk = a.disc.r;
    do {
      if (sj <= sk) {
        if (intersects(j.disc, c.disc)) {
          b = j;
          a.next = b;
          b.previous = a;
          --i;
          continue pack;
        }
        sj += j.disc.r;
        j = j.next;
      } else {
        if (intersects(k.disc, c.disc)) {
          a = k;
          a.next = b;
          b.previous = a;
          --i;
          continue pack;
        }
        sk += k.disc.r;
        k = k.previous;
      }
    } while (j !== k.next);
    // c goes between a and b.
    c.previous = a;
    c.next = b;
    a.next = b.previous = b = c;
    // The pair nearest the centroid.
    let aa = score(a);
    while ((c = c.next) !== b) {
      const ca = score(c);
      if (ca < aa) {
        a = c;
        aa = ca;
      }
    }
    b = a.next;
  }
  const chain = [b.disc];
  for (c = b.next; c !== b; c = c.next) chain.push(c.disc);
  const e = enclose(chain, random);
  for (const circle of circles) {
    circle.x -= e.x;
    circle.y -= e.y;
  }
  return e.r;
}

/** Puts `c` touching both `a` and `b`. */
function place(b: Disc, a: Disc, c: Disc): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  if (d2) {
    let a2 = a.r + c.r;
    a2 *= a2;
    let b2 = b.r + c.r;
    b2 *= b2;
    if (a2 > b2) {
      const x = (d2 + b2 - a2) / (2 * d2);
      const y = Math.sqrt(Math.max(0, b2 / d2 - x * x));
      c.x = b.x - x * dx - y * dy;
      c.y = b.y - x * dy + y * dx;
    } else {
      const x = (d2 + a2 - b2) / (2 * d2);
      const y = Math.sqrt(Math.max(0, a2 / d2 - x * x));
      c.x = a.x + x * dx - y * dy;
      c.y = a.y + x * dy + y * dx;
    }
  } else {
    c.x = a.x + c.r;
    c.y = a.y;
  }
}

/** Whether `a` and `b` overlap by more than 1e-6. */
function intersects(a: Disc, b: Disc): boolean {
  const dr = a.r + b.r - 1e-6;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dr > 0 && dr * dr > dx * dx + dy * dy;
}

/** How far from the origin the weighted middle of a circle and the next on the chain lies, squared. */
function score(node: Link): number {
  const a = node.disc;
  const b = node.next.disc;
  const ab = a.r + b.r;
  const dx = (a.x * b.r + b.x * a.r) / ab;
  const dy = (a.y * b.r + b.y * a.r) / ab;
  return dx * dx + dy * dy;
}

/** The smallest circle enclosing `circles`: Welzl's algorithm, the circles shuffled by `random`. */
function enclose(circles: readonly Disc[], random: () => number): Disc {
  const shuffled = [...circles];
  for (let m = shuffled.length; m; ) {
    const i = (random() * m--) | 0;
    const t = shuffled[m]!;
    shuffled[m] = shuffled[i]!;
    shuffled[i] = t;
  }
  let basis: Disc[] = [];
  let e: Disc | undefined;
  for (let i = 0; i < shuffled.length; ) {
    const p = shuffled[i]!;
    if (e && enclosesWeak(e, p)) ++i;
    else {
      const next = extendBasis(basis, p);
      // Where rounding leaves no consistent basis, d3 throws: radii far apart in size, such as those
      // of values 1 and 1e15, can do it. A circle round the circles' middle still encloses them all.
      if (next === undefined) return around(circles);
      basis = next;
      e = encloseBasis(basis);
      i = 0;
    }
  }
  return e!;
}

/** A circle enclosing `circles`, centred on the mean of their centres: not the smallest, but always one. */
function around(circles: readonly Disc[]): Disc {
  const x = circles.reduce((sum, c) => sum + c.x, 0) / circles.length;
  const y = circles.reduce((sum, c) => sum + c.y, 0) / circles.length;
  const r = Math.max(...circles.map((c) => Math.sqrt((c.x - x) * (c.x - x) + (c.y - y) * (c.y - y)) + c.r));
  return { x, y, r };
}

/**
 * The smallest set of circles from `basis` and `p` whose enclosing circle encloses them all, or
 * undefined where rounding leaves none.
 */
function extendBasis(basis: readonly Disc[], p: Disc): Disc[] | undefined {
  if (enclosesWeakAll(p, basis)) return [p];
  for (const b of basis) {
    if (enclosesNot(p, b) && enclosesWeakAll(encloseBasis2(b, p), basis)) return [b, p];
  }
  for (let i = 0; i < basis.length - 1; ++i) {
    for (let j = i + 1; j < basis.length; ++j) {
      const [bi, bj] = [basis[i]!, basis[j]!];
      if (
        enclosesNot(encloseBasis2(bi, bj), p) &&
        enclosesNot(encloseBasis2(bi, p), bj) &&
        enclosesNot(encloseBasis2(bj, p), bi) &&
        enclosesWeakAll(encloseBasis3(bi, bj, p), basis)
      ) {
        return [bi, bj, p];
      }
    }
  }
  return undefined;
}

/** Whether `a` fails to enclose `b`. */
function enclosesNot(a: Disc, b: Disc): boolean {
  const dr = a.r - b.r;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dr < 0 || dr * dr < dx * dx + dy * dy;
}

/** Whether `a` encloses `b`, within 1e-9 of the larger radius. */
function enclosesWeak(a: Disc, b: Disc): boolean {
  const dr = a.r - b.r + Math.max(a.r, b.r, 1) * 1e-9;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dr > 0 && dr * dr > dx * dx + dy * dy;
}

/** Whether `a` encloses every circle of `basis`, within 1e-9. */
function enclosesWeakAll(a: Disc, basis: readonly Disc[]): boolean {
  return basis.every((b) => enclosesWeak(a, b));
}

/** The smallest circle enclosing 1 to 3 circles. */
function encloseBasis(basis: readonly Disc[]): Disc {
  const [a, b, c] = basis;
  if (c) return encloseBasis3(a!, b!, c);
  if (b) return encloseBasis2(a!, b);
  return { x: a!.x, y: a!.y, r: a!.r };
}

/** The smallest circle enclosing two circles. */
function encloseBasis2(a: Disc, b: Disc): Disc {
  const x21 = b.x - a.x;
  const y21 = b.y - a.y;
  const r21 = b.r - a.r;
  const l = Math.sqrt(x21 * x21 + y21 * y21);
  return { x: (a.x + b.x + (x21 / l) * r21) / 2, y: (a.y + b.y + (y21 / l) * r21) / 2, r: (l + a.r + b.r) / 2 };
}

/** The smallest circle enclosing three circles, the one touching all of them. */
function encloseBasis3(a: Disc, b: Disc, c: Disc): Disc {
  const { x: x1, y: y1, r: r1 } = a;
  const a2 = x1 - b.x;
  const a3 = x1 - c.x;
  const b2 = y1 - b.y;
  const b3 = y1 - c.y;
  const c2 = b.r - r1;
  const c3 = c.r - r1;
  const d1 = x1 * x1 + y1 * y1 - r1 * r1;
  const d2 = d1 - b.x * b.x - b.y * b.y + b.r * b.r;
  const d3 = d1 - c.x * c.x - c.y * c.y + c.r * c.r;
  const ab = a3 * b2 - a2 * b3;
  const xa = (b2 * d3 - b3 * d2) / (ab * 2) - x1;
  const xb = (b3 * c2 - b2 * c3) / ab;
  const ya = (a3 * d2 - a2 * d3) / (ab * 2) - y1;
  const yb = (a2 * c3 - a3 * c2) / ab;
  const qa = xb * xb + yb * yb - 1;
  const qb = 2 * (r1 + xa * xb + ya * yb);
  const qc = xa * xa + ya * ya - r1 * r1;
  const r = -(Math.abs(qa) > 1e-6 ? (qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa) : qc / qb);
  return { x: x1 + xa + xb * r, y: y1 + ya + yb * r, r };
}
