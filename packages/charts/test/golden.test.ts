import { describe, expect, it } from 'vitest';
// Before the package, so the guard also reaches Math references it takes when it loads.
import '../../core/test/support/forbid-unportable-calls.js';
import { layoutChart, toSvgChart, type ChartSpec } from '@borrowdale/charts';
import corpus from './golden/corpus.json' with { type: 'json' };
import goldens from './golden/goldens.json' with { type: 'json' };
import cartesianExamples from '../../../apps/examples/cartesian-cases.json' with { type: 'json' };
import statisticalExamples from '../../../apps/examples/statistical-cases.json' with { type: 'json' };
import timeExamples from '../../../apps/examples/time-cases.json' with { type: 'json' };
import gridExamples from '../../../apps/examples/grid-cases.json' with { type: 'json' };
import proportionExamples from '../../../apps/examples/proportion-cases.json' with { type: 'json' };
import hierarchyExamples from '../../../apps/examples/hierarchy-cases.json' with { type: 'json' };

// Recorded from this package with `npm run goldens charts`, and reviewed, after each deliberate
// change to what a chart looks like.
const cases = [...corpus, ...statisticalExamples] as unknown as { name: string; spec: ChartSpec }[];
const expected = goldens as unknown as Record<string, { svg: string; missing: string[] }>;
const names = cases.map((entry) => entry.name);

describe('golden charts', () => {
  it('has exactly one golden per corpus case, in corpus order', () => {
    expect(Object.keys(expected)).toEqual(names);
  });

  // The example scripts render these, so they are recorded and reviewed here too.
  it.each([...cartesianExamples, ...timeExamples, ...gridExamples, ...proportionExamples, ...hierarchyExamples])('holds the example $name', (example) => {
    expect(corpus).toContainEqual(example);
  });

  it.each(cases)('$name', ({ name, spec }) => {
    const layout = layoutChart(spec);

    expect({ svg: toSvgChart(layout), missing: layout.missing }).toEqual(expected[name]);
  });
});
