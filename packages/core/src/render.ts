import { COLOR_RULE, isPaintForm, notXml } from './paint.js';
import { show } from './show.js';
import type { Sketch, SketchPath } from './types.js';

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
    .map((path) => svgElement('path', pathAttributes(path)))
    .join('');
}

// One mapping from a sketch path to its SVG attributes, in output order, for both renderers.
function pathAttributes(path: SketchPath): SvgAttributes {
  return {
    d: path.d,
    stroke: paintOf(path, 'stroke'),
    'stroke-width': path.strokeWidth,
    ...(path.strokeLineDash ? { 'stroke-dasharray': path.strokeLineDash.join(' ') } : {}),
    fill: paintOf(path, 'fill'),
    ...(path.fillRule ? { 'fill-rule': path.fillRule } : {}),
  };
}

// A sketch can be built by hand or stored, so its paints are checked as `sketch` checks their form:
// a `url(…)` naming another file would have the SVG fetch it.
function paintOf(path: SketchPath, name: 'stroke' | 'fill'): string {
  const paint = path[name];
  if (!isPaintForm(paint)) {
    throw new Error(`Invalid sketch: ${name} must be ${COLOR_RULE} or url(#id), got ${show(paint)}`);
  }
  return paint;
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
  // Every path is checked before any is appended, so a bad one leaves nothing behind.
  return sketch.paths.map(pathAttributes).map((attributes) => {
    const element = document.createElementNS(SVG_NS, 'path');
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, String(value));
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
  // Every path's paints are checked before any is drawn, so a bad one leaves nothing behind.
  const paints = sketch.paths.map((path) => ({ stroke: paintOf(path, 'stroke'), fill: paintOf(path, 'fill') }));
  for (const [index, path] of sketch.paths.entries()) {
    const { stroke, fill } = paints[index]!;
    const outline = new Path2D(path.d);
    context.save();
    try {
      if (fill !== 'none') {
        context.fillStyle = paint.fill ?? fill;
        context.fill(outline, path.fillRule ?? 'nonzero');
      }
      if (stroke !== 'none' && path.strokeWidth !== 0) {
        context.strokeStyle = paint.stroke ?? stroke;
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
  // Escaping cannot make these characters fit: a document holding one does not parse as XML, so a
  // standalone SVG would fail to draw at all.
  const problem = notXml(value);
  if (problem !== undefined) {
    throw new Error(`An attribute value contains ${problem}, which SVG cannot hold`);
  }
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
