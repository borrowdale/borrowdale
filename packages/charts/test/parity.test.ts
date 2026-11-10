import statisticalExamples from '../../../apps/examples/statistical-cases.json' with { type: 'json' };
import { beforeAll, describe, expect, it } from 'vitest';
import type { ChartLayout, ChartSpec } from '@borrowdale/charts';
import corpus from './golden/corpus.json' with { type: 'json' };
import goldens from './golden/goldens.json' with { type: 'json' };
import { ENGINES, evaluateIn } from '../../core/test/support/browsers.js';

// Lays out the whole golden corpus in headless Chromium, Firefox and WebKit and compares it with the
// goldens, which golden.test.ts checks against Node: every scale, tick, label position and stroke
// must match.

type Case = { name: string; spec: ChartSpec };
type Golden = { svg: string; missing: string[] };
type Charts = { layoutChart: (spec: ChartSpec) => ChartLayout; toSvgChart: (layout: ChartLayout) => string };

const cases = [...corpus, ...statisticalExamples] as unknown as Case[];
const expected = goldens as unknown as Record<string, Golden>;

describe.each(ENGINES)('%s parity', (engine) => {
  let rendered: Record<string, Golden> = {};

  beforeAll(async () => {
    rendered = await evaluateIn(
      engine,
      new URL('../src/index.ts', import.meta.url),
      'borrowdaleCharts',
      '',
      (entries: Case[]) => {
        const { layoutChart, toSvgChart } = (globalThis as unknown as { borrowdaleCharts: Charts }).borrowdaleCharts;
        return Object.fromEntries(
          entries.map((entry) => {
            const layout = layoutChart(entry.spec);
            return [entry.name, { svg: toSvgChart(layout), missing: layout.missing }];
          }),
        );
      },
      cases,
    );
  }, 120_000);

  it(`lays out exactly the corpus in ${engine}`, () => {
    expect(Object.keys(rendered)).toEqual(Object.keys(expected));
  });

  it.each(cases)(`$name is byte for byte the same in ${engine}`, ({ name }) => {
    expect(rendered[name]).toEqual(expected[name]);
  });
});
