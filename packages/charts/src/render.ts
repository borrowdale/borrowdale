import { appendSketch, drawSketch, escapeAttribute, svgElement, toSvgPaths } from '@borrowdale/core';
import { appendText, drawText, fontFaceCss, toSvgText, type FontFiles } from '@borrowdale/text';
import type { ChartLayout, ChartNode } from './types.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface SvgChartOptions {
  /**
   * The files of the font the chart was laid out with. The SVG then embeds the ones its labels
   * need, so it shows them in that font wherever it is opened. Without them the font must reach
   * the viewer some other way, or labels fall back to another font and no longer fit their space.
   */
  fontFiles?: FontFiles | undefined;
}

/** Renders a chart as a complete `<svg>` document string. Needs no DOM. */
export function toSvgChart(layout: ChartLayout, options: SvgChartOptions = {}): string {
  const { fontFiles } = options;
  if (fontFiles !== undefined && fontFiles.family !== layout.family) {
    throw new Error(`Font files are for ${fontFiles.family}, but the chart was laid out in ${layout.family}`);
  }
  const title = layout.title === undefined ? '' : svgElement('title', {}, escapeAttribute(layout.title));
  // The rules hold no caller text, so they are safe as markup.
  const fonts = fontFiles ? svgElement('defs', {}, svgElement('style', {}, fontFaceCss(fontFiles, layout.labels))) : '';
  return svgElement(
    'svg',
    {
      xmlns: SVG_NS,
      width: layout.width,
      height: layout.height,
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      role: 'img',
    },
    `${title}${fonts}${layout.nodes.map(nodeToSvg).join('')}`,
  );
}

function nodeToSvg(node: ChartNode): string {
  switch (node.kind) {
    case 'sketch':
      return toSvgPaths(node.sketch);
    case 'text':
      return toSvgText(node.text, { fill: node.fill });
    case 'mark': {
      const title = svgElement('title', {}, escapeAttribute(node.title));
      return svgElement('g', {}, `${title}${node.nodes.map(nodeToSvg).join('')}`);
    }
    default:
      return unknownNode(node);
  }
}

/**
 * Builds the chart as an `<svg>` element, appends it to `parent` and returns it. The font must reach
 * the page, for example through `loadFont` or `fontFaceCss`.
 */
export function appendChart(parent: Element, layout: ChartLayout): SVGSVGElement {
  const document = parent.ownerDocument;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(layout.width));
  svg.setAttribute('height', String(layout.height));
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  svg.setAttribute('role', 'img');
  if (layout.title !== undefined) {
    svg.appendChild(titleElement(document, layout.title));
  }
  appendNodes(svg, layout.nodes);
  parent.appendChild(svg);
  return svg;
}

function appendNodes(parent: Element, nodes: readonly ChartNode[]): void {
  for (const node of nodes) {
    switch (node.kind) {
      case 'sketch':
        appendSketch(parent, node.sketch);
        break;
      case 'text':
        appendText(parent, node.text, { fill: node.fill });
        break;
      case 'mark': {
        const group = parent.ownerDocument.createElementNS(SVG_NS, 'g');
        group.appendChild(titleElement(parent.ownerDocument, node.title));
        appendNodes(group, node.nodes);
        parent.appendChild(group);
        break;
      }
      default:
        unknownNode(node);
    }
  }
}

function titleElement(document: Document, text: string): SVGTitleElement {
  const title = document.createElementNS(SVG_NS, 'title');
  title.textContent = text;
  return title;
}

/**
 * Draws the chart into a 2D canvas context. A canvas has no tooltips. Throws, as `drawText` does,
 * when the font has not loaded: load it with `loadFont` first.
 */
export function drawChart(context: CanvasRenderingContext2D, layout: ChartLayout): void {
  drawNodes(context, layout.nodes);
}

function drawNodes(context: CanvasRenderingContext2D, nodes: readonly ChartNode[]): void {
  for (const node of nodes) {
    switch (node.kind) {
      case 'sketch':
        drawSketch(context, node.sketch);
        break;
      case 'text':
        drawText(context, node.text, { fill: node.fill });
        break;
      case 'mark':
        drawNodes(context, node.nodes);
        break;
      default:
        unknownNode(node);
    }
  }
}

function unknownNode(node: never): never {
  throw new Error(`Unknown chart node: ${String((node as { kind?: unknown }).kind)}`);
}
