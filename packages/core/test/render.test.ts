import { describe, expect, it } from 'vitest';
import {
  escapeAttribute,
  sketch,
  svgElement,
  toSvgDocument,
  toSvgSketch,
  type Shape,
  type Sketch,
  type SvgDocumentOptions,
} from '@borrowdale/core';

const square: Shape = { kind: 'rectangle', x: 0, y: 0, width: 10, height: 10 };

const plain: Sketch = { paths: [{ d: 'M0 0 L1 1', stroke: '#000', strokeWidth: 1, fill: 'none' }] };

const hostile: Sketch = {
  paths: [{ d: 'M0 0"<x>&\'', stroke: '#000', strokeWidth: '1"<y>' as unknown as number, fill: 'none' }],
};
// What a renderer requires of the paints of a sketch: their form, at any length.
const FORM_RULE = 'a colour (a hex code, a name, rgb() or hsl()) or url(#id)';
// A sketch built by hand rather than by `sketch()`, with the given paints.
const painted = (stroke: string, fill: string): Sketch => ({ paths: [{ d: 'M0 0 L1 1', stroke, strokeWidth: 1, fill }] });

describe('toSvgSketch', () => {
  it('renders each path as an SVG path element', () => {
    expect(toSvgSketch(plain)).toBe(
      '<path d="M0 0 L1 1" stroke="#000" stroke-width="1" fill="none"/>',
    );
  });

  it('escapes attribute values so path data from untyped code cannot inject markup', () => {
    expect(toSvgSketch(hostile)).toBe(
      '<path d="M0 0&quot;&lt;x&gt;&amp;&#39;" stroke="#000" stroke-width="1&quot;&lt;y&gt;" fill="none"/>',
    );
  });

  it.each<[string, Sketch, string]>([
    ['markup as the stroke', painted('"/><script>', 'none'), `stroke must be ${FORM_RULE}, got "\\"/><script>"`],
    ['a stroke naming another file', painted('url(https://example.com/a.svg#p)', 'none'), `stroke must be ${FORM_RULE}, got "url(https://example.com/a.svg#p)"`],
    ['a fill reading a value of the page', painted('#000', 'var(--x)'), `fill must be ${FORM_RULE}, got "var(--x)"`],
    ['none in capitals, which a canvas would paint', painted('None', 'none'), `stroke must be ${FORM_RULE}, got "None"`],
  ])('rejects %s in a sketch built by hand', (_case, built, message) => {
    expect(() => toSvgSketch(built)).toThrow(`Invalid sketch: ${message}`);
  });

  it('rejects a paint longer than 1,000 characters in a sketch built by hand', () => {
    expect(() => toSvgSketch(painted(`rgb(${'1'.repeat(1_000)} 2 3)`, 'none'))).toThrow('Invalid sketch: stroke must be');
  });

  it('writes a pattern in the same document as the fill of a sketch built by hand', () => {
    expect(toSvgSketch(painted('none', 'url(#p)'))).toBe('<path d="M0 0 L1 1" stroke="none" stroke-width="1" fill="url(#p)"/>');
  });

  it('writes a paint of any length, such as a gradient named with a long id prefix', () => {
    expect(toSvgSketch(painted('none', `url(#${'p'.repeat(120)})`))).toContain(`fill="url(#${'p'.repeat(120)})"`);
  });

  it('writes the fill rule when a path has one', () => {
    expect(toSvgSketch({ paths: [{ d: 'M0 0', stroke: 'none', strokeWidth: 0, fill: 'red', fillRule: 'evenodd' }] })).toBe(
      '<path d="M0 0" stroke="none" stroke-width="0" fill="red" fill-rule="evenodd"/>',
    );
  });

  it('writes the dash pattern when a path has one', () => {
    expect(toSvgSketch({ paths: [{ d: 'M0 0', stroke: '#000', strokeWidth: 1, strokeLineDash: [4, 2.5], fill: 'none' }] })).toBe(
      '<path d="M0 0" stroke="#000" stroke-width="1" stroke-dasharray="4 2.5" fill="none"/>',
    );
  });

  it('renders an empty sketch as nothing', () => {
    expect(toSvgSketch({ paths: [] })).toBe('');
  });
});

describe('toSvgDocument', () => {
  it('names a body that was not given as an own property', () => {
    expect(() => toSvgDocument(Object.create({ body: [] }) as SvgDocumentOptions)).toThrow('body must be an array of markup strings, got undefined');
  });

  it('rejects an unknown option rather than ignoring it', () => {
    expect(() => toSvgDocument({ width: 1, height: 1, body: [], def: ['<pattern/>'] } as unknown as SvgDocumentOptions)).toThrow(
      'Unknown option: "def"',
    );
  });

  it('wraps the body in a sized svg element', () => {
    expect(toSvgDocument({ width: 20, height: 10, body: ['<g/>'] })).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10" viewBox="0 0 20 10"><g/></svg>',
    );
  });

  it('escapes the size so a string from untyped code cannot inject markup', () => {
    expect(
      toSvgDocument({ width: '1" onload="x' as unknown as number, height: 1, body: [] }),
    ).not.toContain('onload="');
  });

  it('puts defs before the body', () => {
    expect(toSvgDocument({ width: 1, height: 1, defs: ['<pattern/>'], body: ['<g/>'] })).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1">' +
        '<defs><pattern/></defs><g/></svg>',
    );
  });
});

describe('svgElement', () => {
  it('self-closes an element without children', () => {
    expect(svgElement('rect', { width: 10, fill: 'red' })).toBe('<rect width="10" fill="red"/>');
  });

  it('wraps children, even empty ones', () => {
    expect(svgElement('g', {}, '')).toBe('<g></g>');
  });

  it('escapes every attribute value', () => {
    expect(svgElement('rect', { fill: '"/><script>' })).toBe('<rect fill="&quot;/&gt;&lt;script&gt;"/>');
  });
});

describe('escapeAttribute', () => {
  it('escapes ampersand first so entities are not double-escaped', () => {
    expect(escapeAttribute('&lt;')).toBe('&amp;lt;');
  });

  it.each<[string, string, string]>([
    ['a control character', 'red\u0001', 'U+0001'],
    ['a NUL', '\u0000', 'U+0000'],
    ['a vertical tab', 'a\u000Bb', 'U+000B'],
    ['U+FFFE', 'a\uFFFE', 'U+FFFE'],
    ['an unpaired surrogate', 'a\uD800', 'U+D800'],
  ])('rejects %s, which no escape can make fit', (_case, value, codePoint) => {
    expect(() => escapeAttribute(value)).toThrow(`An attribute value contains ${codePoint}, which SVG cannot hold`);
  });

  it('keeps tab, line breaks and characters past U+FFFF, which XML can hold', () => {
    expect(escapeAttribute('a\tb\nc\rd\u{1F600}')).toBe('a\tb\nc\rd\u{1F600}');
  });

  it('rejects such a character in any attribute svgElement writes', () => {
    expect(() => svgElement('rect', { fill: 'red\u0001' })).toThrow('An attribute value contains U+0001');
  });
});

describe('paint', () => {
  it('draws with a pattern or gradient in the same document', () => {
    expect(toSvgSketch(sketch(square, { fill: 'url(#borrowdale-lines-1)', fillStyle: 'solid', seed: 1 }))).toContain(
      'fill="url(#borrowdale-lines-1)"',
    );
  });

  it.each(['#fdf8ef', '#FFF', 'rebeccapurple', 'currentColor', 'rgb(230 57 70 / 0.5)', 'hsl(120, 50%, 50%)', 'hsl(120deg 50% 50%)', 'hsl(0.5turn 50% 50%)'])(
    'accepts the colour %s',
    (colour) => {
      expect(toSvgSketch(sketch(square, { stroke: colour, seed: 1 }))).toContain(`stroke="${colour}"`);
    },
  );

  it('accepts none, which draws no stroke', () => {
    expect(toSvgSketch(sketch(square, { stroke: 'none', seed: 1 }))).toBe('');
  });
});
