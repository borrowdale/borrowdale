import { escapeAttribute, svgElement } from '@borrowdale/core';
import type { SvgAttributes } from '@borrowdale/core';
import { facesOf } from './embed.js';
import { clustersOf } from './measure.js';
import type { TextLayout, TextStyle } from './types.js';
import { checkStyle, cssFamily } from './validate.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Set as the element's own style, which a stylesheet rule overrides only with `!important`. A
// right-to-left page or rule would anchor the text at its right end. Browsers also kern and form
// ligatures by default, which would make the drawn text narrower than its measurement. Measured in
// Chromium: `font-kerning` and `font-variant-ligatures` are the only switch SVG text honours; the
// `font-kerning` and `text-rendering` attributes are ignored.
const OWN_STYLE = [
  ['direction', 'ltr'],
  ['font-kerning', 'none'],
  ['font-variant-ligatures', 'none'],
] as const;

/**
 * Renders laid-out text as a `<text>` element string. Needs no DOM. The text and every attribute
 * are escaped. The font must reach the viewer, for example through `fontFaceCss`.
 */
export function toSvgText(layout: TextLayout, style?: TextStyle): string {
  return svgElement(
    'text',
    { ...textAttributes(layout, style), style: OWN_STYLE.map(([name, value]) => `${name}:${value}`).join(';') },
    // Escapes &, < and > (and quotes, which is harmless here), so text cannot become markup.
    escapeAttribute(layout.text),
  );
}

/** Appends laid-out text to an SVG element and returns the created `<text>` element. */
export function appendText(parent: Element, layout: TextLayout, style?: TextStyle): SVGTextElement {
  const element = parent.ownerDocument.createElementNS(SVG_NS, 'text');
  for (const [name, value] of Object.entries(textAttributes(layout, style))) {
    element.setAttribute(name, String(value));
  }
  // Through the CSSOM rather than a style attribute, which a strict Content-Security-Policy blocks.
  for (const [name, value] of OWN_STYLE) {
    element.style.setProperty(name, value);
  }
  element.textContent = layout.text;
  parent.appendChild(element);
  return element;
}

/**
 * Draws laid-out text into a 2D canvas context. A canvas never redraws, so text drawn before its
 * font has loaded would keep a fallback font: this throws instead. Load the font with `loadFont`.
 */
export function drawText(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: TextLayout,
  style?: TextStyle,
): void {
  const { fill } = checkStyle(style);
  const font = `${layout.fontSize}px ${cssFamily(layout.family)}`;
  assertFontLoaded(context, layout.family, font, layout.text);
  context.save();
  context.font = font;
  context.fillStyle = fill;
  context.direction = 'ltr';
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  // A caller's spacing survives a change of `font`, and would widen the text past its measurement.
  context.letterSpacing = '0px';
  context.wordSpacing = '0px';
  if (layout.rotate !== 0) {
    const [pivotX, pivotY] = layout.pivot;
    context.translate(pivotX, pivotY);
    context.rotate((layout.rotate * Math.PI) / 180);
    context.translate(-pivotX, -pivotY);
  }
  // Each cluster where the one before it ends, by the canvas's own measure of it. Drawn whole, the
  // text would be kerned by WebKit's canvas, which cannot turn kerning off, and form ligatures in
  // Firefox's, and come out narrower than its layout. Measured in Chromium, Firefox and WebKit: the
  // advances of the clusters add up to the measured width in all three.
  let x = layout.x;
  for (const cluster of clustersOf(layout.text)) {
    context.fillText(cluster, x, layout.y);
    x += context.measureText(cluster).width;
  }
  context.restore();
}

function textAttributes(layout: TextLayout, style: TextStyle | undefined): SvgAttributes {
  const { fill } = checkStyle(style);
  const [pivotX, pivotY] = layout.pivot;
  return {
    x: layout.x,
    y: layout.y,
    'font-family': cssFamily(layout.family),
    'font-size': layout.fontSize,
    fill,
    ...(layout.rotate === 0 ? {} : { transform: `rotate(${layout.rotate} ${pivotX} ${pivotY})` }),
    // Also set as an attribute, which a Content-Security-Policy that blocks style attributes cannot
    // remove. Against a stylesheet rule only the style holds.
    direction: 'ltr',
  };
}

function assertFontLoaded(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  family: string,
  font: string,
  text: string,
): void {
  // The fonts of the canvas's document, else of the page (an OffscreenCanvas on the main thread),
  // else of the worker. A canvas library in Node has none of these: fonts are registered there
  // another way.
  const { canvas } = context;
  const fonts =
    ('ownerDocument' in canvas ? canvas.ownerDocument?.fonts : undefined) ??
    globalThis.document?.fonts ??
    (globalThis as { fonts?: FontFaceSet }).fonts;
  if (!fonts) {
    return;
  }
  // check() alone passes for a family that was never added: it only reports on faces in the set.
  const loaded = facesOf(fonts, family).some((face) => face.status === 'loaded');
  if (!loaded || !fonts.check(font, text)) {
    throw new Error(`Font not loaded: ${family}. Load it with loadFont() before drawing on a canvas.`);
  }
}
