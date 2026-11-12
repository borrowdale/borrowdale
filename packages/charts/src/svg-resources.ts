import { svgElement } from '@borrowdale/core';
import { gradientAttributes, gradientKey, gradientSvg, type GradientNode } from './gradients.js';
import type { ChartImage, ChartRenderOptions } from './images.js';
import { eachNode } from './nodes.js';
import type { ChartNode } from './types.js';

type ClipNode = Extract<ChartNode, { kind: 'clip' }>;

const SVG_NS = 'http://www.w3.org/2000/svg';
// Reserve prefixes when charts are constructed, including before they enter the document.
let nextPrefix = 0n;
const reservedPrefixes = new Set<string>();
// One sequence across documents also covers charts built in template contents before adoption.
const automaticIndex = (prefix: string) => /^chart(?:-(0|[1-9]\d*))?$/.test(prefix)
  ? BigInt(prefix === 'chart' ? 0 : prefix.slice(6)) : undefined;

export interface SvgResources {
  gradients: Map<GradientNode, string>;
  images: Map<string, string>;
  clips: Map<ClipNode, string>;
}

/** Clips with the same box cut alike, so they share one definition. */
const clipKey = ({ box }: ClipNode): string => JSON.stringify([box.x, box.y, box.width, box.height]);

/**
 * The nodes `is` picks, in painting order, each with an index it shares with the nodes of the same
 * `key`: one definition serves them all.
 */
function sharedIndexes<N extends ChartNode>(nodes: readonly ChartNode[], is: (node: ChartNode) => node is N, key: (node: N) => string): Map<N, number> {
  const indexes = new Map<N, number>();
  const byKey = new Map<string, number>();
  eachNode(nodes, (node) => {
    if (!is(node) || indexes.has(node)) return;
    const index = byKey.get(key(node)) ?? byKey.size;
    byKey.set(key(node), index);
    indexes.set(node, index);
  });
  return indexes;
}

export function svgResources(
  nodes: readonly ChartNode[], images: ReadonlyMap<string, ChartImage>, options: ChartRenderOptions, parent?: Element,
): SvgResources {
  // Read once: the loop below must not see a prefix that changes between passes.
  const { idPrefix } = options;
  if (idPrefix !== undefined && !/^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(idPrefix)) {
    throw new Error('Chart idPrefix must be 1 to 100 letters, digits, underscores or hyphens, starting with a letter');
  }
  // Which nodes share a definition does not depend on the prefix, so it is found once.
  const gradients = sharedIndexes(nodes, (node): node is GradientNode => node.kind === 'gradient', gradientKey);
  const clips = sharedIndexes(nodes, (node): node is ClipNode => node.kind === 'clip', clipKey);
  const automatic = parent !== undefined && idPrefix === undefined;
  let index = automatic ? nextPrefix : 0n;
  const root = parent?.getRootNode();
  // The ids under the root, read once: a search per id would cost the whole page for each of a
  // chart's ids, and a chart can define thousands.
  const rootIds = new Set<string>();
  if (automatic && root) {
    if (root.nodeType === 1) rootIds.add((root as Element).id);
    if ('querySelectorAll' in root) for (const node of (root as ParentNode).querySelectorAll('[id]')) rootIds.add(node.id);
  }
  const occupied = (id: string) => parent?.ownerDocument.getElementById(id) || rootIds.has(id);
  for (;;) {
    const prefix = idPrefix ?? (index === 0n ? 'chart' : `chart-${index}`);
    const named = <N>(indexes: ReadonlyMap<N, number>, family: string) =>
      new Map([...indexes].map(([node, i]) => [node, `${prefix}-${family}-${i}`]));
    const result = { gradients: named(gradients, 'gradient'),
      images: new Map([...images.keys()].map((name, i) => [name, `${prefix}-image-${i}`])), clips: named(clips, 'clip') };
    const ids = [...result.gradients.values(), ...result.images.values(), ...result.clips.values()];
    if (!automatic || ids.length === 0 || (!reservedPrefixes.has(prefix) && ids.every((id) => !occupied(id)))) {
      if (parent && ids.length > 0) {
        if (automatic) nextPrefix = index + 1n;
        else {
          const reserved = automaticIndex(prefix);
          if (reserved !== undefined && reserved >= nextPrefix) reservedPrefixes.add(prefix);
        }
      }
      return result;
    }
    reservedPrefixes.delete(prefix);
    index++;
  }
}

const symbolAttributes = (id: string) => ({ id, viewBox: '0 0 1 1', preserveAspectRatio: 'none' });
const rasterAttributes = (image: ChartImage) => ({ href: image.dataUrl, width: 1, height: 1, preserveAspectRatio: 'none' });

/** One definition per id: nodes that draw alike share it. */
const byId = <N>(ids: ReadonlyMap<N, string>) => new Map([...ids].map(([node, id]) => [id, node]));
const clipRect = ({ box }: ClipNode) => ({ x: box.x, y: box.y, width: box.width, height: box.height });

/** What a group cut to `node`'s clip carries, in either SVG output. */
export function clipAttributes(node: ClipNode, resources: SvgResources): { 'clip-path': string } {
  return { 'clip-path': `url(#${resources.clips.get(node)!})` };
}

export function resourceSvg(resources: SvgResources, images: ReadonlyMap<string, ChartImage>): string {
  const gradients = [...byId(resources.gradients)].map(([id, node]) => gradientSvg(node, id)).join('');
  const rasters = [...resources.images].map(([name, id]) =>
    svgElement('symbol', symbolAttributes(id), svgElement('image', rasterAttributes(images.get(name)!)))).join('');
  const clips = [...byId(resources.clips)].map(([id, node]) => svgElement('clipPath', { id }, svgElement('rect', clipRect(node)))).join('');
  return gradients || rasters || clips ? svgElement('defs', {}, gradients + rasters + clips) : '';
}

export function appendResources(parent: Element, resources: SvgResources, images: ReadonlyMap<string, ChartImage>): void {
  if (resources.gradients.size + resources.images.size + resources.clips.size === 0) return;
  const document = parent.ownerDocument;
  const element = (tag: string, attributes: Record<string, string | number>): SVGElement => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  };
  const defs = element('defs', {});
  for (const [id, node] of byId(resources.gradients)) {
    const gradient = element('linearGradient', gradientAttributes(node, id));
    for (const stop of node.stops) gradient.appendChild(element('stop', { offset: stop.offset, 'stop-color': stop.color }));
    defs.appendChild(gradient);
  }
  for (const [name, id] of resources.images) {
    const symbol = element('symbol', symbolAttributes(id));
    symbol.appendChild(element('image', rasterAttributes(images.get(name)!)));
    defs.appendChild(symbol);
  }
  for (const [id, node] of byId(resources.clips)) {
    const clip = element('clipPath', { id });
    clip.appendChild(element('rect', clipRect(node)));
    defs.appendChild(clip);
  }
  parent.appendChild(defs);
}
