import { describe, expect, it } from 'vitest';
import { fontFaceCss, layoutText, toSvgText } from '@borrowdale/text';
import { excalifontFiles } from '@borrowdale/text/excalifont-files';
import { at, handFiles } from './support/hand-font.js';

const NO_SHAPING = 'direction="ltr" style="font-kerning:none;font-variant-ligatures:none"';
// The start tag of every element laid out `at` with the default anchor, up to its fill.
const START_TAG = '<text x="100" y="50" font-family="&quot;Hand Test&quot;" font-size="20"';
const LATIN_RULE =
  '@font-face{font-family:"Hand Test";src:url(data:font/woff2;base64,QUJD) format("woff2");unicode-range:U+0041-0042,U+0044}';
const CYRILLIC_RULE =
  '@font-face{font-family:"Hand Test";src:url(data:font/woff2;base64,REVG) format("woff2");unicode-range:U+0400-045F}';

describe('toSvgText', () => {
  it('draws the text where the layout put it, in the layout font, with kerning and ligatures off', () => {
    expect(toSvgText(layoutText('AB', { ...at, anchor: 'end' }))).toBe(
      `<text x="76" y="50" font-family="&quot;Hand Test&quot;" font-size="20" fill="#000" ${NO_SHAPING}>AB</text>`,
    );
  });

  it('rotates around the layout pivot', () => {
    expect(toSvgText(layoutText('AB', { ...at, anchor: 'middle', rotate: -45 }))).toBe(
      `<text x="88" y="50" font-family="&quot;Hand Test&quot;" font-size="20" fill="#000" transform="rotate(-45 100 50)" ${NO_SHAPING}>AB</text>`,
    );
  });

  it('fills with the style colour', () => {
    expect(toSvgText(layoutText('A', at), { fill: '#e76f51' })).toBe(`${START_TAG} fill="#e76f51" ${NO_SHAPING}>A</text>`);
  });

  it('draws the collapsed text that was measured', () => {
    expect(toSvgText(layoutText('  A   B ', at))).toBe(`${START_TAG} fill="#000" ${NO_SHAPING}>A B</text>`);
  });

  it('escapes the text so it cannot become markup', () => {
    expect(toSvgText(layoutText('</text><script>&\'"', at))).toBe(
      `${START_TAG} fill="#000" ${NO_SHAPING}>&lt;/text&gt;&lt;script&gt;&amp;&#39;&quot;</text>`,
    );
  });

  it('escapes the fill so it cannot become markup', () => {
    expect(toSvgText(layoutText('A', at), { fill: '"/><script>' })).toBe(
      `${START_TAG} fill="&quot;/&gt;&lt;script&gt;" ${NO_SHAPING}>A</text>`,
    );
  });
});

describe('fontFaceCss', () => {
  it('embeds every file when no text is given', () => {
    expect(fontFaceCss(handFiles)).toBe(LATIN_RULE + CYRILLIC_RULE);
  });

  it('embeds only the files that serve the text', () => {
    expect(fontFaceCss(handFiles, 'BA')).toBe(LATIN_RULE);
  });

  it('embeds a file when the text uses the single code point of a range', () => {
    expect(fontFaceCss(handFiles, 'D')).toBe(LATIN_RULE);
  });

  it('embeds a file when the text uses the last code point of a range', () => {
    expect(fontFaceCss(handFiles, 'џ')).toBe(CYRILLIC_RULE);
  });

  it('embeds each file once, in file order, whatever the text order', () => {
    expect(fontFaceCss(handFiles, 'ЖAЖB')).toBe(LATIN_RULE + CYRILLIC_RULE);
  });

  it('embeds nothing for empty text', () => {
    expect(fontFaceCss(handFiles, '')).toBe('');
  });

  it('embeds nothing for text no file serves', () => {
    expect(fontFaceCss(handFiles, 'C東')).toBe('');
  });

  it('picks exactly the files the composed text needs', () => {
    expect(fontFaceCss(excalifontFiles, 'Gyo\u030Br')).toBe(fontFaceCss(excalifontFiles, 'Gy\u0151r'));
  });

  it('picks the files for the text with its presentation controls removed, as it is drawn', () => {
    expect(fontFaceCss(excalifontFiles, 'Gyo\u200E\u030Br')).toBe(fontFaceCss(excalifontFiles, 'Gy\u0151r'));
  });

  it('picks the files for the text as it will be drawn, with its accents composed', () => {
    expect(fontFaceCss(excalifontFiles, 'Gyo\u030Br').match(/unicode-range:U\+0100-0130,/g)).toHaveLength(1);
  });

  it('embeds only the Latin file of Excalifont for a Latin label', () => {
    expect(fontFaceCss(excalifontFiles, 'Zürich').match(/@font-face/g)).toHaveLength(1);
    expect(fontFaceCss(excalifontFiles, 'Zürich')).toContain('unicode-range:U+0020-007E,');
  });

  it('adds the Latin Extended file of Excalifont for a Polish label', () => {
    expect(fontFaceCss(excalifontFiles, 'Łódź').match(/unicode-range:U\+0020-007E,|unicode-range:U\+0100-0130,/g)).toEqual([
      'unicode-range:U+0020-007E,',
      'unicode-range:U+0100-0130,',
    ]);
  });

  it('embeds all seven Excalifont files without text', () => {
    expect(fontFaceCss(excalifontFiles).match(/@font-face/g)).toHaveLength(7);
  });
});
