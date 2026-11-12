import { svgElement } from '@borrowdale/core';
import { gradientAttributes, gradientIds, gradientSvg } from './gradients.js';
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
  gradients: ReturnType<typeof gradientIds>;
  images: Map<string, string>;
  clips: Map<ClipNode, string>;
}

/** Clips with the same box cut alike, so they share one id. */
function clipIds(nodes: readonly ChartNode[], prefix: string): Map<ClipNode, string> {
  const ids = new Map<ClipNode, string>();
  const byBox = new Map<string, string>();
  eachNode(nodes, (node) => {
    if (node.kind !== 'clip' || ids.has(node)) return;
    const box = JSON.stringify([node.box.x, node.box.y, node.box.width, node.box.height]);
    if (!byBox.has(box)) byBox.set(box, `${prefix}-clip-${byBox.size}`);
    ids.set(node, byBox.get(box)!);
  });
  return ids;
}

export function svgResources(
  nodes: readonly ChartNode[], images: ReadonlyMap<string, ChartImage>, options: ChartRenderOptions, parent?: Element,
): SvgResources {
  // Read once: the loop below must not see a prefix that changes between passes.
  const { idPrefix } = options;
  const automatic = parent !== undefined && idPrefix === undefined;
  let index = automatic ? nextPrefix : 0n;
  const root = parent?.getRootNode();
  const occupied = (id: string) => parent?.ownerDocument.getElementById(id)
    || (root?.nodeType === 1 && (root as Element).id === id)
    || (root && 'querySelector' in root && (root as ParentNode).querySelector(`[id="${id}"]`));
  for (;;) {
    const prefix = idPrefix ?? (index === 0n ? 'chart' : `chart-${index}`);
    const result = { gradients: gradientIds(nodes, prefix),
      images: new Map([...images.keys()].map((name, i) => [name, `${prefix}-image-${i}`])), clips: clipIds(nodes, prefix) };
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

/** One definition per id: nodes that paint alike share it. */
const uniqueGradients = (resources: SvgResources) => new Map([...resources.gradients].map(([node, id]) => [id, node]));
const uniqueClips = (resources: SvgResources) => new Map([...resources.clips].map(([node, id]) => [id, node]));
const clipRect = ({ box }: ClipNode) => ({ x: box.x, y: box.y, width: box.width, height: box.height });

export function resourceSvg(resources: SvgResources, images: ReadonlyMap<string, ChartImage>): string {
  const gradients = [...uniqueGradients(resources)].map(([id, node]) => gradientSvg(node, id)).join('');
  const rasters = [...resources.images].map(([name, id]) =>
    svgElement('symbol', symbolAttributes(id), svgElement('image', rasterAttributes(images.get(name)!)))).join('');
  const clips = [...uniqueClips(resources)].map(([id, node]) => svgElement('clipPath', { id }, svgElement('rect', clipRect(node)))).join('');
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
  for (const [id, node] of uniqueGradients(resources)) {
    const gradient = element('linearGradient', gradientAttributes(node, id));
    for (const stop of node.stops) gradient.appendChild(element('stop', { offset: stop.offset, 'stop-color': stop.color }));
    defs.appendChild(gradient);
  }
  for (const [name, id] of resources.images) {
    const symbol = element('symbol', symbolAttributes(id));
    symbol.appendChild(element('image', rasterAttributes(images.get(name)!)));
    defs.appendChild(symbol);
  }
  for (const [id, node] of uniqueClips(resources)) {
    const clip = element('clipPath', { id });
    clip.appendChild(element('rect', clipRect(node)));
    defs.appendChild(clip);
  }
  parent.appendChild(defs);
}
