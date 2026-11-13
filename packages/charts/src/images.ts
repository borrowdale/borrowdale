import { eachNode } from './nodes.js';
import { show } from './read.js';
import type { ChartNode } from './types.js';

/** Trusted raster bytes for SVG export and an already loaded source for Canvas. */
export interface ChartImage {
  /** A base64 PNG, JPEG, GIF or WebP data URL. Never fetched by this package. */
  dataUrl: string;
  /** Required by drawChart. The caller loads/decodes it before rendering. */
  source?: CanvasImageSource | undefined;
}

export interface ChartRenderOptions {
  /** Unique prefix when combining SVG documents. appendChart chooses an unused prefix by default. */
  idPrefix?: string | undefined;
  /** Assets referenced by name in the spec; never read from the spec itself. */
  images?: ReadonlyMap<string, ChartImage> | undefined;
}

/** Resolve once before rendering, so a missing resource cannot leave a partial drawing. */
export function resolveImages(nodes: readonly ChartNode[], options: ChartRenderOptions, canvas = false): Map<string, ChartImage> {
  const resolved = new Map<string, ChartImage>();
  eachNode(nodes, (node) => {
    if (node.kind !== 'image' || resolved.has(node.asset)) return;
    const image = options.images?.get(node.asset);
    if (!image) throw new Error(`Missing chart image: ${show(node.asset)}`);
    const { dataUrl, source } = image;
    if (!/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) {
      throw new Error(`Chart image ${show(node.asset)} must contain a raster data URL`);
    }
    if (canvas && !source) throw new Error(`Chart image ${show(node.asset)} has no preloaded Canvas source`);
    resolved.set(node.asset, { dataUrl, source });
  });
  return resolved;
}

export function imageAttributes(node: Extract<ChartNode, { kind: 'image' }>, ids: ReadonlyMap<string, string>) {
  return { href: `#${ids.get(node.asset)!}`, x: node.x, y: node.y, width: node.width,
    height: node.height };
}
