import { svgElement } from '@borrowdale/core';
import { gradientAttributes, gradientIds, gradientSvg } from './gradients.js';
import type { ChartImage, ChartRenderOptions } from './images.js';
import type { ChartNode } from './types.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
// Reserve prefixes when charts are constructed, including before they enter the document.
const nextPrefix = new WeakMap<Document, number>();

export interface SvgResources {
  gradients: ReturnType<typeof gradientIds>;
  images: Map<string, string>;
}

export function svgResources(
  nodes: readonly ChartNode[], images: ReadonlyMap<string, ChartImage>, options: ChartRenderOptions, document?: Document,
): SvgResources {
  const automatic = document !== undefined && options.idPrefix === undefined;
  let index = automatic ? nextPrefix.get(document) ?? 0 : 0;
  for (;;) {
    const prefix = options.idPrefix ?? (index === 0 ? 'chart' : `chart-${index}`);
    const result = { gradients: gradientIds(nodes, prefix),
      images: new Map([...images.keys()].map((name, i) => [name, `${prefix}-image-${i}`])) };
    const ids = [...result.gradients.values(), ...result.images.values()];
    if (!automatic || ids.every((id) => !document.getElementById(id))) {
      if (automatic && ids.length > 0) nextPrefix.set(document, index + 1);
      return result;
    }
    index++;
  }
}

const symbolAttributes = (id: string) => ({ id, viewBox: '0 0 1 1', preserveAspectRatio: 'none' });
const rasterAttributes = (image: ChartImage) => ({ href: image.dataUrl, width: 1, height: 1, preserveAspectRatio: 'none' });

/** One definition per id: nodes that paint alike share it. */
const uniqueGradients = (resources: SvgResources) => new Map([...resources.gradients].map(([node, id]) => [id, node]));

export function resourceSvg(resources: SvgResources, images: ReadonlyMap<string, ChartImage>): string {
  const gradients = [...uniqueGradients(resources)].map(([id, node]) => gradientSvg(node, id)).join('');
  const rasters = [...resources.images].map(([name, id]) =>
    svgElement('symbol', symbolAttributes(id), svgElement('image', rasterAttributes(images.get(name)!)))).join('');
  return gradients || rasters ? svgElement('defs', {}, gradients + rasters) : '';
}

export function appendResources(parent: Element, resources: SvgResources, images: ReadonlyMap<string, ChartImage>): void {
  if (resources.gradients.size + resources.images.size === 0) return;
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
  parent.appendChild(defs);
}
