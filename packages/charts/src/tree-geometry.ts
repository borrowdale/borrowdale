// The node-link hierarchy layouts: the tidy tree and the cluster (dendrogram). A port of d3-hierarchy
// 3.1.3 (Copyright 2010-2026 Mike Bostock, ISC; see THIRD_PARTY_NOTICES.md): the tidy tree, Buchheim
// et al.'s linear-time Reingold–Tilford algorithm, from src/tree.js, and the cluster from
// src/cluster.js, each fitted to a size as d3's `size` fits it. They use + − × ÷ and max only, in
// d3's order, so every JavaScript engine places the same nodes, at the same positions as d3.
import { eachAfter, eachBefore, largestFirst } from './hierarchy-walk.js';

/**
 * A node being laid out: `x` across the levels, `y` along them from the root, in the units of the
 * size given; a caller turns them to a direction or a circle.
 */
export interface PlacedNode<T> {
  item: T;
  depth: number;
  parent: PlacedNode<T> | undefined;
  children: PlacedNode<T>[];
  x: number;
  y: number;
}

/** The room between two neighbouring nodes, in units of the space between siblings. */
export type Separation = (a: PlacedNode<unknown>, b: PlacedNode<unknown>) => number;

/** d3's spacing: one unit between siblings, two between cousins. */
export const separation: Separation = (a, b) => (a.parent === b.parent ? 1 : 2);

/** d3's spacing for a radial tree: as `separation`, over the depth, so outer rings stay as dense. */
export const radialSeparation: Separation = (a, b) => (a.parent === b.parent ? 1 : 2) / a.depth;

/**
 * `tree` as nodes to lay out; siblings largest first, a missing value after every value and a tie
 * in the given order, unless `sort` is false.
 */
export function placedTree<T extends { value: number | undefined; children: readonly T[] }>(
  tree: T,
  sort: boolean,
  parent?: PlacedNode<T>,
): PlacedNode<T> {
  const node: PlacedNode<T> = { item: tree, depth: parent === undefined ? 0 : parent.depth + 1, parent, children: [], x: 0, y: 0 };
  const items = sort ? [...tree.children].sort(largestFirst) : tree.children;
  node.children = items.map((child) => placedTree(child, sort, node));
  return node;
}

/**
 * What the algorithm reads of a walker's parent. Every walker has one: the root's is a sentinel, as
 * d3's is, so the root has siblings to look at like any other node.
 */
interface Parent<T> {
  children: Walker<T>[];
  /** Modifier. */
  m: number;
  /** Default ancestor. */
  A: Walker<T> | undefined;
}

/** A node as Buchheim's algorithm walks it, with d3's names for its working values. */
class Walker<T> implements Parent<T> {
  readonly node: PlacedNode<T>;
  readonly parent: Parent<T>;
  /** Position among its siblings. */
  readonly i: number;
  readonly children: Walker<T>[];
  A: Walker<T> | undefined = undefined;
  /** Ancestor. */
  a: Walker<T> = this;
  /** Preliminary x. */
  z = 0;
  m = 0;
  /** Change. */
  c = 0;
  /** Shift. */
  s = 0;
  /** Thread. */
  t: Walker<T> | undefined = undefined;

  constructor(node: PlacedNode<T>, i: number, parent: Parent<T>) {
    this.node = node;
    this.i = i;
    this.parent = parent;
    this.children = node.children.map((child, j) => new Walker(child, j, this));
  }
}

/**
 * Lays out a tidy tree in `width` by `height`: each level a line, `height` from the root's to the
 * deepest's, and each node across them `separate` from its neighbours, the outermost half a step in
 * from the edges.
 */
export function tidy<T>(root: PlacedNode<T>, separate: Separation, width: number, height: number): void {
  const top: Parent<T> = { children: [], m: 0, A: undefined };
  const t = new Walker(root, 0, top);
  top.children.push(t);

  const firstWalk = (v: Walker<T>): void => {
    const children = v.children;
    const siblings = v.parent.children;
    const w = v.i ? siblings[v.i - 1]! : undefined;
    if (children.length > 0) {
      executeShifts(v);
      const midpoint = (children[0]!.z + children[children.length - 1]!.z) / 2;
      if (w) {
        v.z = w.z + separate(v.node, w.node);
        v.m = v.z - midpoint;
      } else {
        v.z = midpoint;
      }
    } else if (w) {
      v.z = w.z + separate(v.node, w.node);
    }
    v.parent.A = apportion(v, w, v.parent.A ?? siblings[0]!);
  };

  // The core of the algorithm: a new subtree is combined with the subtrees to its left, following
  // threads along the inside and outside contours of each, and moved apart where they conflict.
  const apportion = (v: Walker<T>, w: Walker<T> | undefined, ancestor: Walker<T>): Walker<T> => {
    if (w) {
      let vop: Walker<T> = v;
      let vom: Walker<T> = v.parent.children[0]!;
      let sip = v.m;
      let sop = vop.m;
      let sim = w.m;
      let som = vom.m;
      let vim = nextRight(w);
      let vip = nextLeft(v);
      for (; vim && vip; vim = nextRight(vim), vip = nextLeft(vip)) {
        vom = nextLeft(vom)!;
        vop = nextRight(vop)!;
        vop.a = v;
        const shift = vim.z + sim - vip.z - sip + separate(vim.node, vip.node);
        if (shift > 0) {
          moveSubtree(nextAncestor(vim, v, ancestor), v, shift);
          sip += shift;
          sop += shift;
        }
        sim += vim.m;
        sip += vip.m;
        som += vom.m;
        sop += vop.m;
      }
      if (vim && !nextRight(vop)) {
        vop.t = vim;
        vop.m += sim - sop;
      }
      if (vip && !nextLeft(vom)) {
        vom.t = vip;
        vom.m += sip - som;
        ancestor = v;
      }
    }
    return ancestor;
  };

  const secondWalk = (v: Walker<T>): void => {
    v.node.x = v.z + v.parent.m;
    v.m += v.parent.m;
  };

  eachAfter(t, firstWalk);
  top.m = -t.z;
  eachBefore(t, secondWalk);

  let [left, right, bottom] = [root, root, root];
  eachBefore(root, (node) => {
    if (node.x < left.x) left = node;
    if (node.x > right.x) right = node;
    if (node.depth > bottom.depth) bottom = node;
  });
  const s = left === right ? 1 : separate(left, right) / 2;
  const tx = s - left.x;
  const kx = width / (right.x + s + tx);
  const ky = height / (bottom.depth || 1);
  eachBefore(root, (node) => {
    node.x = (node.x + tx) * kx;
    node.y = node.depth * ky;
  });
}

/** The next node on the left contour of `v`'s subtree: its first child, else its thread. */
function nextLeft<T>(v: Walker<T>): Walker<T> | undefined {
  return v.children.length > 0 ? v.children[0] : v.t;
}

/** The next node on the right contour of `v`'s subtree: its last child, else its thread. */
function nextRight<T>(v: Walker<T>): Walker<T> | undefined {
  return v.children.length > 0 ? v.children[v.children.length - 1] : v.t;
}

/** Moves the subtree at `wp` by `shift`, and spreads the shift over the subtrees between it and `wm`. */
function moveSubtree<T>(wm: Walker<T>, wp: Walker<T>, shift: number): void {
  const change = shift / (wp.i - wm.i);
  wp.c -= change;
  wp.s += shift;
  wm.c += change;
  wp.z += shift;
  wp.m += shift;
}

/** Applies the shifts `moveSubtree` spread over `v`'s children. */
function executeShifts<T>(v: Walker<T>): void {
  let shift = 0;
  let change = 0;
  for (let i = v.children.length - 1; i >= 0; i--) {
    const w = v.children[i]!;
    w.z += shift;
    w.m += shift;
    change += w.c;
    shift += w.s + change;
  }
}

/** `vim`'s ancestor if it is a sibling of `v`, else `ancestor`. */
function nextAncestor<T>(vim: Walker<T>, v: Walker<T>, ancestor: Walker<T>): Walker<T> {
  return vim.a.parent === v.parent ? vim.a : ancestor;
}

/**
 * Lays out a cluster (a dendrogram) in `width` by `height`: every leaf on one line, `height` from the
 * root, each parent over the middle of its children and a level above the highest of them, and the
 * leaves across `separate` apart, the outermost half a step in from the edges.
 */
export function cluster<T>(root: PlacedNode<T>, separate: Separation, width: number, height: number): void {
  let previous: PlacedNode<T> | undefined;
  let x = 0;
  eachAfter(root, (node) => {
    const children = node.children;
    if (children.length > 0) {
      node.x = children.reduce((sum, c) => sum + c.x, 0) / children.length;
      node.y = 1 + children.reduce((y, c) => Math.max(y, c.y), 0);
    } else {
      node.x = previous ? (x += separate(node, previous)) : 0;
      node.y = 0;
      previous = node;
    }
  });
  const left = leafLeft(root);
  const right = leafRight(root);
  const x0 = left.x - separate(left, right) / 2;
  const x1 = right.x + separate(right, left) / 2;
  eachAfter(root, (node) => {
    node.x = ((node.x - x0) / (x1 - x0)) * width;
    node.y = (1 - (root.y ? node.y / root.y : 1)) * height;
  });
}

function leafLeft<T>(node: PlacedNode<T>): PlacedNode<T> {
  while (node.children.length > 0) node = node.children[0]!;
  return node;
}

function leafRight<T>(node: PlacedNode<T>): PlacedNode<T> {
  while (node.children.length > 0) node = node.children[node.children.length - 1]!;
  return node;
}
