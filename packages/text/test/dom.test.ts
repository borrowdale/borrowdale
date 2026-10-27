// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendText, drawText, layoutText, loadFont, type TextStyle } from '@borrowdale/text';
import { at, handFiles } from './support/hand-font.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgRoot(): SVGSVGElement {
  return document.createElementNS(SVG_NS, 'svg');
}

type Face = { family: string; status: string };

// A FontFaceSet holding these faces, reporting `check()` as given.
function fontSet(checks: boolean, ...faces: Face[]) {
  return {
    forEach: (visit: (face: Face) => void) => faces.forEach((face) => visit(face)),
    check: vi.fn(() => checks),
  };
}

function loadedFace(family: string): Face {
  return { family, status: 'loaded' };
}

const STYLE_PROPERTIES = [
  'font',
  'fillStyle',
  'fontKerning',
  'textRendering',
  'textAlign',
  'textBaseline',
  'letterSpacing',
  'wordSpacing',
  'direction',
] as const;

// A 2D context that records its calls, and every style property write in `write`, in order.
function fakeContext(fonts: unknown) {
  const context = {
    canvas: { ownerDocument: { fonts } },
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillText: vi.fn(),
    write: vi.fn(),
    font: '',
    fillStyle: '',
    fontKerning: '',
    textRendering: '',
    textAlign: '',
    textBaseline: '',
    letterSpacing: '',
    wordSpacing: '',
    direction: '',
  };
  const values = new Map<string, string>();
  for (const name of STYLE_PROPERTIES) {
    Object.defineProperty(context, name, {
      enumerable: true,
      get: () => values.get(name) ?? '',
      set: (value: string) => {
        values.set(name, value);
        context.write(name, value);
      },
    });
  }
  return context;
}

function loadedContext() {
  return fakeContext(fontSet(true, loadedFace('Hand Test')));
}

// Each returns the call, unmade, for `expect(...).toThrow`.
function drawing(context: unknown, style?: unknown) {
  return () => drawText(context as CanvasRenderingContext2D, layoutText('AB', at), style as TextStyle);
}

function appending(parent: Element, style: unknown) {
  return () => appendText(parent, layoutText('AB', at), style as TextStyle);
}

class RecordingFontFace {
  static made: RecordingFontFace[] = [];
  readonly load = vi.fn(async () => this);
  constructor(
    readonly family: string,
    readonly source: Uint8Array,
    readonly descriptors: FontFaceDescriptors,
  ) {
    RecordingFontFace.made.push(this);
  }
}

// A face whose file the browser cannot decode.
class BrokenFontFace extends RecordingFontFace {
  override readonly load = vi.fn(async () => {
    throw new Error('the font file is broken');
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  RecordingFontFace.made = [];
});

describe('appendText', () => {
  it('appends a text element in the SVG namespace and returns it', () => {
    const svg = svgRoot();

    const element = appendText(svg, layoutText('AB', at));

    expect(element.namespaceURI).toBe(SVG_NS);
    expect(svg.lastChild).toBe(element);
  });

  it('sets the same attributes as toSvgText', () => {
    const element = appendText(svgRoot(), layoutText('AB', { ...at, anchor: 'end', rotate: 30 }), { fill: 'red' });

    expect(element.getAttribute('x')).toBe('76');
    expect(element.getAttribute('y')).toBe('50');
    expect(element.getAttribute('font-family')).toBe('"Hand Test"');
    expect(element.getAttribute('font-size')).toBe('20');
    expect(element.getAttribute('fill')).toBe('red');
    expect(element.getAttribute('transform')).toBe('rotate(30 100 50)');
  });

  it('leaves out the transform when the text is not rotated', () => {
    expect(appendText(svgRoot(), layoutText('AB', at)).hasAttribute('transform')).toBe(false);
  });

  it('turns kerning and ligatures off through the CSSOM', () => {
    const element = appendText(svgRoot(), layoutText('AB', at));

    expect(element.style.getPropertyValue('font-kerning')).toBe('none');
    expect(element.style.getPropertyValue('font-variant-ligatures')).toBe('none');
    expect(element.getAttribute('direction')).toBe('ltr');
  });

  it('rejects a style it cannot draw, and appends nothing', () => {
    const svg = svgRoot();

    expect(appending(svg, { fill: 1 })).toThrow('fill must be a string, got 1');
    expect(svg.childElementCount).toBe(0);
  });

  it('sets the text as text, never as markup', () => {
    const element = appendText(svgRoot(), layoutText('<b>A</b>', at));

    expect(element.textContent).toBe('<b>A</b>');
    expect(element.childElementCount).toBe(0);
  });
});

describe('drawText', () => {
  it('fills the text at the layout position, in the layout font', () => {
    const context = loadedContext();

    drawText(context as unknown as CanvasRenderingContext2D, layoutText('AB', at));

    expect(context.fillText).toHaveBeenCalledWith('AB', 100, 50);
    expect(context.font).toBe('20px "Hand Test"');
    expect(context.fillStyle).toBe('#000');
  });

  it('turns kerning, ligatures and extra spacing off, and aligns the text by its left end on the baseline', () => {
    const context = loadedContext();

    drawText(context as unknown as CanvasRenderingContext2D, layoutText('AB', at));

    expect(context).toMatchObject({
      fontKerning: 'none',
      textRendering: 'optimizeSpeed',
      letterSpacing: '0px',
      wordSpacing: '0px',
      direction: 'ltr',
      textAlign: 'left',
      textBaseline: 'alphabetic',
    });
  });

  it('fills with the style colour', () => {
    const context = loadedContext();

    drawText(context as unknown as CanvasRenderingContext2D, layoutText('AB', at), { fill: 'red' });

    expect(context.fillStyle).toBe('red');
  });

  it('rotates around the pivot', () => {
    const context = loadedContext();

    drawText(context as unknown as CanvasRenderingContext2D, layoutText('AB', { ...at, rotate: -90 }));

    expect(context.translate).toHaveBeenNthCalledWith(1, 100, 50);
    expect(context.rotate).toHaveBeenCalledWith(-Math.PI / 2);
    expect(context.translate).toHaveBeenNthCalledWith(2, -100, -50);
  });

  it('does not rotate unrotated text', () => {
    const context = loadedContext();

    drawText(context as unknown as CanvasRenderingContext2D, layoutText('AB', at));

    expect(context.rotate).not.toHaveBeenCalled();
    expect(context.translate).not.toHaveBeenCalled();
  });

  it('saves the context before changing any of its properties', () => {
    const context = loadedContext();

    drawText(context as unknown as CanvasRenderingContext2D, layoutText('AB', at));

    expect(context.save).toHaveBeenCalledTimes(1);
    expect(Number(context.save.mock.invocationCallOrder[0])).toBeLessThan(Number(context.write.mock.invocationCallOrder[0]));
  });

  it('restores the context after drawing', () => {
    const context = loadedContext();

    drawText(context as unknown as CanvasRenderingContext2D, layoutText('AB', at));

    expect(context.restore).toHaveBeenCalledTimes(1);
    expect(Number(context.restore.mock.invocationCallOrder[0])).toBeGreaterThan(Number(context.fillText.mock.invocationCallOrder[0]));
  });

  it('asks the page whether the faces for this text and size have loaded', () => {
    const fonts = fontSet(true, loadedFace('Hand Test'));

    drawText(fakeContext(fonts) as unknown as CanvasRenderingContext2D, layoutText('AB', at));

    expect(fonts.check).toHaveBeenCalledWith('20px "Hand Test"', 'AB');
  });

  it('throws when the faces for the text have not loaded', () => {
    expect(drawing(fakeContext(fontSet(false, loadedFace('Hand Test'))))).toThrow(
      'Font not loaded: Hand Test. Load it with loadFont() before drawing on a canvas.',
    );
  });

  it('throws when the page never had the font, even though check() passes', () => {
    expect(drawing(fakeContext(fontSet(true, loadedFace('Other Font'))))).toThrow('Font not loaded: Hand Test.');
  });

  it('throws when the face is still loading', () => {
    expect(drawing(fakeContext(fontSet(true, { family: 'Hand Test', status: 'loading' })))).toThrow(
      'Font not loaded: Hand Test.',
    );
  });

  it('finds the loaded face among faces of other families', () => {
    const context = fakeContext(fontSet(true, loadedFace('Hand Test'), loadedFace('Other Font')));

    drawText(context as unknown as CanvasRenderingContext2D, layoutText('AB', at));

    expect(context.fillText).toHaveBeenCalledTimes(1);
  });

  it('accepts a face whose family differs only in letter case, as CSS does', () => {
    const context = fakeContext(fontSet(true, loadedFace('hand test')));

    drawText(context as unknown as CanvasRenderingContext2D, layoutText('AB', at));

    expect(context.fillText).toHaveBeenCalledTimes(1);
  });

  it('accepts a face whose family the page reports in quotes', () => {
    const context = fakeContext(fontSet(true, loadedFace('"Hand Test"')));

    drawText(context as unknown as CanvasRenderingContext2D, layoutText('AB', at));

    expect(context.fillText).toHaveBeenCalledTimes(1);
  });

  it('draws without checking when there is no FontFaceSet to ask', () => {
    const context = { ...loadedContext(), canvas: {} };

    drawText(context as unknown as CanvasRenderingContext2D, layoutText('AB', at));

    expect(context.fillText).toHaveBeenCalledTimes(1);
  });

  it("asks the page's fonts when the canvas has no document, as an OffscreenCanvas has none", () => {
    vi.stubGlobal('document', { fonts: fontSet(true, loadedFace('Other Font')) });

    expect(drawing({ ...loadedContext(), canvas: {} })).toThrow('Font not loaded: Hand Test.');
  });

  it("asks the canvas's own document before the page", () => {
    vi.stubGlobal('document', { fonts: fontSet(true, loadedFace('Hand Test')) });

    expect(drawing(fakeContext(fontSet(true, loadedFace('Other Font'))))).toThrow('Font not loaded: Hand Test.');
  });

  it("asks the page's fonts before a worker's", () => {
    vi.stubGlobal('document', { fonts: fontSet(true, loadedFace('Other Font')) });
    vi.stubGlobal('fonts', fontSet(true, loadedFace('Hand Test')));

    expect(drawing({ ...loadedContext(), canvas: {} })).toThrow('Font not loaded: Hand Test.');
  });

  it("asks a worker's fonts when there is no document at all", () => {
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('fonts', fontSet(true, loadedFace('Other Font')));

    expect(drawing({ ...loadedContext(), canvas: {} })).toThrow('Font not loaded: Hand Test.');
  });

  it('rejects a style it cannot draw, and draws nothing', () => {
    const context = loadedContext();

    expect(drawing(context, { stroke: 'red' })).toThrow('Unknown option: stroke');
    expect(context.fillText).not.toHaveBeenCalled();
  });

  it('draws nothing when the font has not loaded', () => {
    const context = fakeContext(fontSet(false, loadedFace('Hand Test')));

    expect(drawing(context)).toThrow('Font not loaded');
    expect(context.fillText).not.toHaveBeenCalled();
    expect(context.save).not.toHaveBeenCalled();
  });
});

describe('loadFont', () => {
  it('adds a face for every file, each with its unicode-range', async () => {
    vi.stubGlobal('FontFace', RecordingFontFace);
    const fonts = { add: vi.fn() };

    await loadFont(fonts as unknown as FontFaceSet, handFiles);

    expect(RecordingFontFace.made).toEqual([
      expect.objectContaining({
        family: 'Hand Test',
        source: Uint8Array.from([0x41, 0x42, 0x43]),
        descriptors: { unicodeRange: 'U+0041-0042,U+0044' },
      }),
      expect.objectContaining({
        family: 'Hand Test',
        source: Uint8Array.from([0x44, 0x45, 0x46]),
        descriptors: { unicodeRange: 'U+0400-045F' },
      }),
    ]);
    expect(fonts.add).toHaveBeenNthCalledWith(1, RecordingFontFace.made[0]);
    expect(fonts.add).toHaveBeenNthCalledWith(2, RecordingFontFace.made[1]);
  });

  it('waits for the faces to load, so a file that fails to load fails the call', async () => {
    vi.stubGlobal('FontFace', BrokenFontFace);

    await expect(loadFont({ add: vi.fn() } as unknown as FontFaceSet, handFiles)).rejects.toThrow(
      'the font file is broken',
    );
  });

  it('decodes each file to its bytes', async () => {
    vi.stubGlobal('FontFace', RecordingFontFace);

    await loadFont({ add: vi.fn() } as unknown as FontFaceSet, { ...handFiles, files: [{ ranges: [[0x41, 0x41]], woff2: '/w==' }] });

    expect(RecordingFontFace.made[0]?.source).toEqual(Uint8Array.from([0xff]));
  });

  it('rejects font files it cannot use', async () => {
    await expect(loadFont({ add: vi.fn() } as unknown as FontFaceSet, { ...handFiles, family: 'a;b' })).rejects.toThrow(
      'Invalid font files: family must be',
    );
  });
});
