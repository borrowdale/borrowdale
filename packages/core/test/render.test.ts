import { describe, expect, it } from 'vitest';
import {
  escapeAttribute,
  svgElement,
  toSvgDocument,
  toSvgPaths,
  type Sketch,
} from '@borrowdale/core';

const plain: Sketch = { paths: [{ d: 'M0 0 L1 1', stroke: '#000', strokeWidth: 1, fill: 'none' }] };

const hostile: Sketch = {
  paths: [
    {
      d: 'M0 0"<x>',
      stroke: '"/><script>alert(1)</script>',
      strokeWidth: '1"<y>' as unknown as number,
      fill: "'&",
    },
  ],
};

describe('toSvgPaths', () => {
  it('renders each path as an SVG path element', () => {
    expect(toSvgPaths(plain)).toBe(
      '<path d="M0 0 L1 1" stroke="#000" stroke-width="1" fill="none"/>',
    );
  });

  it('escapes attribute values so caller colours cannot inject markup', () => {
    expect(toSvgPaths(hostile)).toBe(
      '<path d="M0 0&quot;&lt;x&gt;" stroke="&quot;/&gt;&lt;script&gt;alert(1)&lt;/script&gt;"' +
        ' stroke-width="1&quot;&lt;y&gt;" fill="&#39;&amp;"/>',
    );
  });

  it('renders an empty sketch as nothing', () => {
    expect(toSvgPaths({ paths: [] })).toBe('');
  });
});

describe('toSvgDocument', () => {
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
});
