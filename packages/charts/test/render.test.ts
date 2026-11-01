import { describe, expect, it } from 'vitest';
import { toSvgChart, type ChartLayout } from '@borrowdale/charts';
import { excalifontFiles } from '@borrowdale/text/excalifont-files';

const label = {
  text: 'Hi',
  width: 10,
  ascent: 8,
  descent: 3,
  missing: [],
  family: 'Excalifont',
  fontSize: 12,
  x: 1,
  y: 2,
  box: { x: 1, y: -6, width: 10, height: 11 },
  rotate: 0,
  pivot: [1, 2] as const,
};
const stroke = { d: 'M0 0 L1 1', stroke: '#000', strokeWidth: 1, fill: 'none' };
const layout: ChartLayout = {
  width: 100,
  height: 50,
  title: 'A & <B>',
  family: 'Excalifont',
  nodes: [
    { kind: 'sketch', sketch: { paths: [stroke] } },
    { kind: 'mark', title: 'Bar "1" <x>', nodes: [{ kind: 'sketch', sketch: { paths: [stroke] } }] },
    { kind: 'text', text: label, fill: '#333' },
  ],
  labels: ['Hi'],
  missing: [],
};
const untitled: ChartLayout = { ...layout, title: undefined as unknown as string, nodes: [] };
const otherFont: ChartLayout = { ...layout, family: 'Virgil' };
const rendering = (chart: ChartLayout, options: Parameters<typeof toSvgChart>[1]) => () => toSvgChart(chart, options);
// Latin and Cyrillic come from two different Excalifont files.
const twoScripts: ChartLayout = { ...layout, labels: ['Hi', 'Москва'] };

describe('toSvgChart', () => {
  it('draws every node in order inside a sized, titled svg', () => {
    expect(toSvgChart(layout)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50" role="img">' +
        '<title>A &amp; &lt;B&gt;</title>' +
        '<path d="M0 0 L1 1" stroke="#000" stroke-width="1" fill="none"/>' +
        '<g><title>Bar &quot;1&quot; &lt;x&gt;</title><path d="M0 0 L1 1" stroke="#000" stroke-width="1" fill="none"/></g>' +
        '<text x="1" y="2" font-family="&quot;Excalifont&quot;" font-size="12" fill="#333" direction="ltr"' +
        ' style="direction:ltr;font-kerning:none;font-variant-ligatures:none">Hi</text>' +
        '</svg>',
    );
  });

  it('leaves out the title element for a chart without a title', () => {
    expect(toSvgChart(untitled)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50" role="img"></svg>',
    );
  });

  it('embeds the font files its labels need when given them', () => {
    expect(toSvgChart(layout, { fontFiles: excalifontFiles })).toContain('<defs><style>@font-face{font-family:"Excalifont";');
  });

  it('embeds one font file for labels in one script', () => {
    expect(toSvgChart(layout, { fontFiles: excalifontFiles }).match(/@font-face/g)).toHaveLength(1);
  });

  it('embeds a font file for each script its labels use', () => {
    expect(toSvgChart(twoScripts, { fontFiles: excalifontFiles }).match(/@font-face/g)).toHaveLength(2);
  });

  it('embeds no font without font files', () => {
    expect(toSvgChart(layout)).not.toContain('@font-face');
  });

  it('rejects font files of another family than the chart was laid out in', () => {
    expect(rendering(otherFont, { fontFiles: excalifontFiles })).toThrow(
      'Font files are for "Excalifont", but the chart was laid out in "Virgil"',
    );
  });
});
