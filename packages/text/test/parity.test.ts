import { beforeAll, describe, expect, it } from 'vitest';
import {
  fontFaceCss,
  layoutText,
  toSvgText,
  type LayoutOptions,
  type TextLayout,
  type TextStyle,
} from '@borrowdale/text';
import { excalifontFiles } from '@borrowdale/text/excalifont-files';
import { ENGINES, evaluateIn, type Engine } from '../../core/test/support/browsers.js';
import corpus from './golden/corpus.json' with { type: 'json' };
import goldens from './golden/goldens.json' with { type: 'json' };

// Lays out the golden corpus in headless Chromium, Firefox and WebKit, with Excalifont loaded, and
// checks two things: the layout and markup are byte for byte the goldens Node produces, and the text
// each browser actually draws, through each of the three renderers, is as wide as measureText said.
// The second check is what proves the advance table matches the font, because a browser measures
// with the font itself.
// The corpus page forbids fetching fonts, so its font can only come from loadFont's bytes; two more
// pages load the font through fontFaceCss instead, each with only the files its label needs. Two
// right-to-left pages check that the renderers keep text left to right: one whose own stylesheet
// embeds the font with fontFaceCss and turns text right to left, where loadFont must also load the
// rules' faces before drawText can draw, and one whose Content-Security-Policy blocks style
// attributes. Each group of checks opens its own pages, so a page that fails to load fails only the
// checks of its group.

type Case = { name: string; text: string; options: LayoutOptions; style?: TextStyle };
type Golden = TextLayout & { svg: string };
type Drawn = { golden: Golden; svgWidth: number; domWidth: number; canvasWidth: number; shapedWidth: number };
type Embedded = { faces: number; width: number };
// What the right-to-left pages measure: whether drawText threw and how wide it drew, and where
// the browser starts the first character of each renderer's text. Not the bounding box, which
// Firefox starts 2 units before the text (measured).
type Ruled = { drawError: string; canvasWidth: number; svgX: number; attributeX: number; domX: number };
type Strict = { svgX: number; domX: number; domRuleX: number; svgRuleX: number };
type Text = typeof import('@borrowdale/text');

const cases = corpus as unknown as Case[];
const expected = goldens as unknown as Record<string, Golden>;
// What `missing` lists is drawn by the browser in a fallback font, at its own width.
const covered = cases.filter(({ name }) => expected[name]?.missing.length === 0);
const uncovered = cases.filter((entry) => !covered.includes(entry)).map(({ name }) => name);
// The cases whose width kerning or ligatures would change, if the renderers left them on.
const shaped = cases.filter(({ name }) => name === 'kerning-pairs' || name === 'ligatures');
const shapedNames = shaped.map(({ name }) => name);
// Measured: Firefox draws the stressed letter's mark from a fallback font without an advance of its
// own, so the width does not show the fallback there; WebKit neither kerns SVG text nor forms these
// ligatures unless asked, so leaving them on changes nothing there.
const FALLBACK_CHANGES_WIDTH: Record<Engine, boolean> = { chromium: true, firefox: false, webkit: true };
const SVG_SHAPES_BY_DEFAULT: Record<Engine, boolean> = { chromium: true, firefox: true, webkit: false };

const SOURCE = new URL('../src/index.ts', import.meta.url);
const zurich = expected['category-zurich'] as Golden;
// A soft hyphen is drawn as nothing, so the label needs the Greek file only, not the Latin one that
// holds the hyphen.
const hyphenatedLayout = layoutText('Ελ\u00ADλάδα', { x: 10, y: 40 });
const hyphenated: Golden = { ...hyphenatedLayout, svg: toSvgText(hyphenatedLayout) };
const stressed = expected['cyrillic-stress-mark'] as Golden;
// Anchored at its end, so its left edge also depends on its width.
const tick = cases.find(({ name }) => name === 'tick-ten-thousands') as Case;
const tickLayout = expected[tick.name] as Golden;
// A stylesheet rule that selects the text elements themselves, which outranks a direction attribute.
const RIGHT_TO_LEFT = 'text{direction:rtl}';

// Draws a label on a page that embeds only the files fontFaceCss picks for it.
function embed(engine: Engine, label: Golden): Promise<Embedded> {
  return evaluateIn(
    engine,
    SOURCE,
    'borrowdaleText',
    `<style>${fontFaceCss(excalifontFiles, [label.text])}</style>` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000">${label.svg}</svg>`,
    async (text: string) => {
      await document.fonts.load('16px "Excalifont"', text);
      const element = document.querySelector('text') as SVGTextElement;
      return { faces: document.fonts.size, width: element.getComputedTextLength() };
    },
    label.text,
  );
}

describe.each(ENGINES)('%s parity', (engine) => {
  let drawn: Record<string, Drawn> = {};
  let corpusFaces = NaN;

  beforeAll(async () => {
    ({ drawn, faces: corpusFaces } = await evaluateIn(
      engine,
      SOURCE,
      'borrowdaleText',
      `<meta http-equiv="Content-Security-Policy" content="font-src 'none'">` +
        '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"></svg><canvas width="1" height="1"></canvas>',
      async ({ entries, files }: { entries: Case[]; files: typeof excalifontFiles }) => {
        const { appendText, drawText, layoutText, loadFont, toSvgText } = (
          globalThis as unknown as { borrowdaleText: Text }
        ).borrowdaleText;
        await loadFont(document.fonts, files);
        // Again, as a page might: it adds nothing the first call added.
        await loadFont(document.fonts, files);
        const faces = document.fonts.size;
        const svg = document.querySelector('svg') as SVGSVGElement;
        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        const context = canvas.getContext('2d') as CanvasRenderingContext2D;
        const widthOf = (markup: string) => {
          svg.innerHTML = markup;
          return (svg.firstElementChild as SVGTextElement).getComputedTextLength();
        };
        // Where drawText's last fill ends, measured at the moment it fills, so with exactly the
        // settings it drew with. Empty text fills nothing and ends where it starts.
        let drawnTo = NaN;
        const fillText = context.fillText.bind(context);
        context.fillText = (text: string, x: number, y: number) => {
          drawnTo = x + context.measureText(text).width;
          fillText(text, x, y);
        };
        const drawn = Object.fromEntries(
          entries.map(({ name, text, options, style }) => {
            const layout = layoutText(text, options);
            const markup = toSvgText(layout, style);
            const svgWidth = widthOf(markup);
            // The same markup with kerning and ligatures left on: the control that shows they matter.
            const shapedWidth = widthOf(markup.replace(/ style="[^"]*"/, ''));
            svg.replaceChildren();
            const domWidth = appendText(svg, layout, style).getComputedTextLength();
            drawnTo = layout.x;
            drawText(context, layout, style);
            const canvasWidth = drawnTo - layout.x;
            return [name, { golden: { ...layout, svg: markup }, svgWidth, domWidth, canvasWidth, shapedWidth }];
          }),
        );
        return { drawn, faces };
      },
      { entries: cases, files: excalifontFiles },
    ));
  }, 120_000);

  it(`lays out exactly the corpus in ${engine}`, () => {
    expect(Object.keys(drawn)).toEqual(Object.keys(expected));
  });

  it('checks the width of every case except those with text drawn in a fallback font', () => {
    expect(uncovered).toEqual(['uncovered-characters', 'cyrillic-stress-mark']);
  });

  it('draws a letter whose mark is in another Excalifont file in a fallback font, which is why it is listed', () => {
    expect(Math.abs(Number(drawn['cyrillic-stress-mark']?.svgWidth) - stressed.width) > 0.05).toBe(
      FALLBACK_CHANGES_WIDTH[engine],
    );
  });

  it('adds no file a second time when loadFont is called again', () => {
    expect(corpusFaces).toBe(7);
  });

  it.each(cases)(`$name is laid out and rendered byte for byte the same in ${engine}`, ({ name }) => {
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
    expect(Math.abs(Number(drawn[name]?.shapedWidth) - Number(expected[name]?.width)) > 0.05).toBe(
      SVG_SHAPES_BY_DEFAULT[engine],
    );
  });
});

describe.each(ENGINES)('%s, with only the files fontFaceCss picks for a label', (engine) => {
  let embedded: Embedded = { faces: NaN, width: NaN };
  let embeddedGreek: Embedded = { faces: NaN, width: NaN };

  beforeAll(async () => {
    embedded = await embed(engine, zurich);
    embeddedGreek = await embed(engine, hyphenated);
  }, 120_000);

  it('embeds through fontFaceCss only the file a Latin label needs', () => {
    expect(embedded.faces).toBe(1);
  });

  it('draws text in the font fontFaceCss embeds, as wide as it was measured', () => {
    expect(embedded.width).toBeCloseTo(zurich.width, 1);
  });

  it('embeds through fontFaceCss only the Greek file for a Greek label with a soft hyphen', () => {
    expect(embeddedGreek.faces).toBe(1);
  });

  it('draws the Greek label with a soft hyphen as wide as it was measured, without the file that holds the hyphen', () => {
    expect(embeddedGreek.width).toBeCloseTo(hyphenated.width, 1);
  });
});

describe.each(ENGINES)('%s, with fontFaceCss rules and a right-to-left rule in the page stylesheet', (engine) => {
  let ruled: Ruled = { drawError: '', canvasWidth: NaN, svgX: NaN, attributeX: NaN, domX: NaN };

  beforeAll(async () => {
    ruled = await evaluateIn(
      engine,
      SOURCE,
      'borrowdaleText',
      `<html dir="rtl"><head><style>${fontFaceCss(excalifontFiles, [tickLayout.text])}${RIGHT_TO_LEFT}</style></head>` +
        '<body><svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"></svg><canvas width="1" height="1"></canvas></body></html>',
      async ({ entry, files }: { entry: Case; files: typeof excalifontFiles }) => {
        const { appendText, drawText, layoutText, loadFont, toSvgText } = (
          globalThis as unknown as { borrowdaleText: Text }
        ).borrowdaleText;
        await loadFont(document.fonts, files);
        const layout = layoutText(entry.text, entry.options);
        // Drawn first, before laying out SVG text could load the rules' faces by itself.
        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        const context = canvas.getContext('2d') as CanvasRenderingContext2D;
        let drawnTo = layout.x;
        const fillText = context.fillText.bind(context);
        context.fillText = (text: string, x: number, y: number) => {
          drawnTo = x + context.measureText(text).width;
          fillText(text, x, y);
        };
        let drawError = '';
        try {
          drawText(context, layout);
        } catch (error) {
          drawError = String(error);
        }
        const svg = document.querySelector('svg') as SVGSVGElement;
        const startOf = (markup: string) => {
          svg.innerHTML = markup;
          return (svg.firstElementChild as SVGTextElement).getStartPositionOfChar(0).x;
        };
        const markup = toSvgText(layout);
        const svgX = startOf(markup);
        // The same markup with only the direction attribute: the control that shows the rule applies.
        const attributeX = startOf(markup.replace(/ style="[^"]*"/, ''));
        svg.replaceChildren();
        const domX = appendText(svg, layout).getStartPositionOfChar(0).x;
        return { drawError, canvasWidth: drawnTo - layout.x, svgX, attributeX, domX };
      },
      { entry: tick, files: excalifontFiles },
    );
  }, 120_000);

  it('draws on a canvas once loadFont has also loaded the faces of the rules', () => {
    expect(ruled.drawError).toBe('');
  });

  it('draws on the canvas as wide as it was measured', () => {
    expect(ruled.canvasWidth).toBeCloseTo(tickLayout.width, 1);
  });

  it('keeps toSvgText text left to right, starting where it was laid out', () => {
    expect(ruled.svgX).toBeCloseTo(tickLayout.x, 1);
  });

  it('keeps appendText text left to right, starting where it was laid out', () => {
    expect(ruled.domX).toBeCloseTo(tickLayout.x, 1);
  });

  it('would let the rule turn the text right to left with only the direction attribute', () => {
    expect(ruled.attributeX).toBeLessThan(tickLayout.x - 1);
  });
});

describe.each(ENGINES)('%s, right to left under a Content-Security-Policy that blocks style attributes', (engine) => {
  let strict: Strict = { svgX: NaN, domX: NaN, domRuleX: NaN, svgRuleX: NaN };

  beforeAll(async () => {
    strict = await evaluateIn(
      engine,
      SOURCE,
      'borrowdaleText',
      `<html dir="rtl"><head><meta http-equiv="Content-Security-Policy" content="style-src 'none'; font-src 'none'"></head>` +
        '<body><svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"></svg></body></html>',
      async ({ entry, files, rule }: { entry: Case; files: typeof excalifontFiles; rule: string }) => {
        const { appendText, layoutText, loadFont, toSvgText } = (
          globalThis as unknown as { borrowdaleText: Text }
        ).borrowdaleText;
        await loadFont(document.fonts, files);
        const layout = layoutText(entry.text, entry.options);
        const svg = document.querySelector('svg') as SVGSVGElement;
        // The policy blocks the markup's style attribute, so only its direction attribute applies.
        svg.innerHTML = toSvgText(layout);
        const svgX = (svg.firstElementChild as SVGTextElement).getStartPositionOfChar(0).x;
        svg.replaceChildren();
        const element = appendText(svg, layout);
        const domX = element.getStartPositionOfChar(0).x;
        // A stylesheet rule, which the policy still allows from script.
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(rule);
        document.adoptedStyleSheets = [sheet];
        const domRuleX = element.getStartPositionOfChar(0).x;
        svg.insertAdjacentHTML('beforeend', toSvgText(layout));
        const svgRuleX = (svg.lastElementChild as SVGTextElement).getStartPositionOfChar(0).x;
        return { svgX, domX, domRuleX, svgRuleX };
      },
      { entry: tick, files: excalifontFiles, rule: RIGHT_TO_LEFT },
    );
  }, 120_000);

  it('keeps toSvgText text left to right by its direction attribute', () => {
    expect(strict.svgX).toBeCloseTo(tickLayout.x, 1);
  });

  it('keeps appendText text left to right', () => {
    expect(strict.domX).toBeCloseTo(tickLayout.x, 1);
  });

  it('keeps appendText text left to right against a stylesheet rule, through the CSSOM', () => {
    expect(strict.domRuleX).toBeCloseTo(tickLayout.x, 1);
  });

  it('lets a stylesheet rule turn toSvgText text right to left, since its style is blocked', () => {
    expect(strict.svgRuleX).toBeLessThan(tickLayout.x - 1);
  });
});
