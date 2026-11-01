import { describe, expect, it } from 'vitest';
// Before the package, so the guard also reaches Math references it takes when it loads.
import '../../core/test/support/forbid-unportable-calls.js';
import { layoutChart, toSvgChart, type ChartSpec } from '@borrowdale/charts';
import corpus from './golden/corpus.json' with { type: 'json' };
import goldens from './golden/goldens.json' with { type: 'json' };

// Recorded from this package with `npm run goldens charts`, and reviewed, after each deliberate
// change to what a chart looks like.
const cases = corpus as unknown as { name: string; spec: ChartSpec }[];
const expected = goldens as unknown as Record<string, { svg: string; missing: string[] }>;
const names = cases.map((entry) => entry.name);

describe('golden charts', () => {
  it('has exactly one golden per corpus case, in corpus order', () => {
    expect(Object.keys(expected)).toEqual(names);
  });

  it.each(cases)('$name', ({ name, spec }) => {
    const layout = layoutChart(spec);

    expect({ svg: toSvgChart(layout), missing: layout.missing }).toEqual(expected[name]);
  });
});
