import type { Sketch } from './types.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface SvgDocumentOptions {
  width: number;
  height: number;
  /** Trusted markup placed inside `<defs>`, e.g. pattern definitions. Inserted verbatim. */
  defs?: readonly string[];
  /** Trusted markup placed in the document body, in order. Inserted verbatim. */
  body: readonly string[];
}

export type SvgAttributes = Readonly<Record<string, string | number>>;

/**
 * Builds an SVG element as a string. Every attribute value is escaped; the tag and attribute
 * names are not, so pass them as literals. `children` is trusted markup and is inserted verbatim:
 * never pass user text in it. Without `children` the element is self-closing.
 */
export function svgElement(tag: string, attributes: SvgAttributes, children?: string): string {
  const attributeText = Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${escapeAttribute(String(value))}"`)
    .join('');
  return children === undefined
    ? `<${tag}${attributeText}/>`
    : `<${tag}${attributeText}>${children}</${tag}>`;
}

/** Renders a sketch as `<path>` markup. Needs no DOM, so it works for SSR. */
export function toSvgPaths(sketch: Sketch): string {
  return sketch.paths
    .map((path) =>
      svgElement('path', {
        d: path.d,
        stroke: path.stroke,
        'stroke-width': path.strokeWidth,
        ...(path.strokeLineDash ? { 'stroke-dasharray': path.strokeLineDash.join(' ') } : {}),
        fill: path.fill,
        ...(path.fillRule ? { 'fill-rule': path.fillRule } : {}),
      }),
    )
    .join('');
}

export function toSvgDocument({ width, height, defs = [], body }: SvgDocumentOptions): string {
  const defsBlock = defs.length > 0 ? svgElement('defs', {}, defs.join('')) : '';
  return svgElement(
    'svg',
    { xmlns: SVG_NS, width, height, viewBox: `0 0 ${width} ${height}` },
    `${defsBlock}${body.join('')}`,
  );
}

/** Appends a sketch's paths to an SVG element and returns the created elements. */
export function appendSketch(parent: Element, sketch: Sketch): SVGPathElement[] {
  const document = parent.ownerDocument;
  return sketch.paths.map((path) => {
    const element = document.createElementNS(SVG_NS, 'path');
    element.setAttribute('d', path.d);
    element.setAttribute('stroke', path.stroke);
    element.setAttribute('stroke-width', String(path.strokeWidth));
    if (path.strokeLineDash) {
      element.setAttribute('stroke-dasharray', path.strokeLineDash.join(' '));
    }
    element.setAttribute('fill', path.fill);
    if (path.fillRule) {
      element.setAttribute('fill-rule', path.fillRule);
    }
    parent.appendChild(element);
    return element;
  });
}

/** Draws a sketch into a 2D canvas context. Requires `Path2D`. */
export function drawSketch(
  context: CanvasRenderingContext2D, sketch: Sketch,
  paint: { stroke?: string | CanvasGradient | CanvasPattern; fill?: string | CanvasGradient | CanvasPattern } = {},
): void {
  for (const path of sketch.paths) {
    const outline = new Path2D(path.d);
    context.save();
    try {
      if (path.fill !== 'none') {
        context.fillStyle = paint.fill ?? path.fill;
        context.fill(outline, path.fillRule ?? 'nonzero');
      }
      if (path.stroke !== 'none' && path.strokeWidth !== 0) {
        context.strokeStyle = paint.stroke ?? path.stroke;
        context.lineWidth = path.strokeWidth;
        context.lineCap = 'butt';
        context.lineJoin = 'miter';
        context.miterLimit = 4;
        // Canvas ignores malformed numeric dash lists. Start solid so none can inherit a dash.
        context.setLineDash([]);
        if (path.strokeLineDash) {
          context.setLineDash(path.strokeLineDash);
        }
        context.lineDashOffset = 0;
        context.stroke(outline);
      }
    } finally {
      context.restore();
    }
  }
}

export function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
