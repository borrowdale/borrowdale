import { beforeAll, describe, expect, it } from 'vitest';
import { fontFaceCss, type LayoutOptions, type TextLayout, type TextStyle } from '@borrowdale/text';
import { excalifontFiles } from '@borrowdale/text/excalifont-files';
import { evaluateInChromium } from '../../core/test/support/chromium.js';
import corpus from './golden/corpus.json' with { type: 'json' };
import goldens from './golden/goldens.json' with { type: 'json' };

// Lays out the golden corpus in headless Chromium, with Excalifont loaded, and checks two things:
// the layout and markup are byte for byte the goldens Node produces, and the text Chromium actually
// draws, through each of the three renderers, is as wide as measureText said. The second check is
// what proves the advance table matches the font, because Chromium measures with the font itself.
// The corpus page forbids fetching fonts, so its font can only come from loadFont's bytes; a second
// page loads the font through fontFaceCss instead.

type Case = { name: string; text: string; options: LayoutOptions; style?: TextStyle };
type Golden = TextLayout & { svg: string };
type Drawn = { golden: Golden; svgWidth: number; domWidth: number; canvasWidth: number; shapedWidth: number };
type Embedded = { faces: number; width: number };
type Text = typeof import('@borrowdale/text');

const cases = corpus as unknown as Case[];
const expected = goldens as unknown as Record<string, Golden>;
// Characters the font does not cover are drawn by Chromium in a fallback font, at its own width.
const covered = cases.filter(({ name }) => expected[name]?.missing.length === 0);
const uncovered = cases.filter((entry) => !covered.includes(entry)).map(({ name }) => name);
// The cases whose width kerning or ligatures would change, if the renderers left them on.
const shaped = cases.filter(({ name }) => name === 'kerning-pairs' || name === 'ligatures');
const shapedNames = shaped.map(({ name }) => name);

const SOURCE = new URL('../src/index.ts', import.meta.url);
const zurich = expected['category-zurich'] as Golden;

let drawn: Record<string, Drawn> = {};
let embedded: Embedded = { faces: NaN, width: NaN };

beforeAll(async () => {
  drawn = await evaluateInChromium(
    SOURCE,
    'borrowdaleText',
    `<meta http-equiv="Content-Security-Policy" content="font-src 'none'">` +
      '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"></svg><canvas width="1" height="1"></canvas>',
    async ({ entries, files }: { entries: Case[]; files: typeof excalifontFiles }) => {
      const { appendText, drawText, layoutText, loadFont, toSvgText } = (
        globalThis as unknown as { borrowdaleText: Text }
      ).borrowdaleText;
      await loadFont(document.fonts, files);
      const svg = document.querySelector('svg') as SVGSVGElement;
      const context = (document.querySelector('canvas') as HTMLCanvasElement).getContext('2d') as CanvasRenderingContext2D;
      const widthOf = (markup: string) => {
        svg.innerHTML = markup;
        return (svg.firstElementChild as SVGTextElement).getComputedTextLength();
      };
      // Measured at the moment drawText fills, so with exactly the settings it drew with.
      let canvasWidth = NaN;
      const fillText = context.fillText.bind(context);
      context.fillText = (text: string, x: number, y: number) => {
        canvasWidth = context.measureText(text).width;
        fillText(text, x, y);
      };
      return Object.fromEntries(
        entries.map(({ name, text, options, style }) => {
          const layout = layoutText(text, options);
          const markup = toSvgText(layout, style);
          const svgWidth = widthOf(markup);
          // The same markup with kerning and ligatures left on: the control that shows they matter.
          const shapedWidth = widthOf(markup.replace(/ style="[^"]*"/, ''));
          svg.replaceChildren();
          const domWidth = appendText(svg, layout, style).getComputedTextLength();
          canvasWidth = NaN;
          drawText(context, layout, style);
          return [name, { golden: { ...layout, svg: markup }, svgWidth, domWidth, canvasWidth, shapedWidth }];
        }),
      );
    },
    { entries: cases, files: excalifontFiles },
  );
  embedded = await evaluateInChromium(
    SOURCE,
    'borrowdaleText',
    `<style>${fontFaceCss(excalifontFiles, zurich.text)}</style>` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000">${zurich.svg}</svg>`,
    async (label: string) => {
      await document.fonts.load('16px "Excalifont"', label);
      const text = document.querySelector('text') as SVGTextElement;
      return { faces: document.fonts.size, width: text.getComputedTextLength() };
    },
    zurich.text,
  );
}, 120_000);

describe('Chromium parity', () => {
  it('lays out exactly the corpus in Chromium', () => {
    expect(Object.keys(drawn)).toEqual(Object.keys(expected));
  });

  it('checks the width of every case except the one with uncovered characters', () => {
    expect(uncovered).toEqual(['uncovered-characters']);
  });

  it.each(cases)('$name is laid out and rendered byte for byte the same in Chromium', ({ name }) => {
    expect(drawn[name]?.golden).toEqual(expected[name]);
  });

  it.each(covered)('$name is drawn by toSvgText as wide as it was measured', ({ name }) => {
    expect(drawn[name]?.svgWidth).toBeCloseTo(Number(expected[name]?.width), 1);
  });

  it.each(covered)('$name is drawn by appendText as wide as it was measured', ({ name }) => {
    expect(drawn[name]?.domWidth).toBeCloseTo(Number(expected[name]?.width), 1);
  });

  it.each(covered)('$name is drawn by drawText as wide as it was measured', ({ name }) => {
    expect(drawn[name]?.canvasWidth).toBeCloseTo(Number(expected[name]?.width), 1);
  });

  it('has the cases that kerning and ligatures would change', () => {
    expect(shapedNames).toEqual(['kerning-pairs', 'ligatures']);
  });

  it.each(shaped)('$name would be drawn at another width with kerning and ligatures left on', ({ name }) => {
    expect(drawn[name]?.shapedWidth).not.toBeCloseTo(Number(expected[name]?.width), 1);
  });

  it('embeds through fontFaceCss only the file a Latin label needs', () => {
    expect(embedded.faces).toBe(1);
  });

  it('draws text in the font fontFaceCss embeds, as wide as it was measured', () => {
    expect(embedded.width).toBeCloseTo(zurich.width, 1);
  });
});
