import { describe, expect, it } from 'vitest';
import { layoutChart, type ChartSpec } from '@borrowdale/charts';

const slices = [{ name: 'Americas', value: 400 }, { name: 'Europe', value: 300 }, { name: 'Asia', value: 200 }, { name: 'Africa', value: 100 }];
const parts = [{ name: 'France', value: 120 }, { name: 'Germany', value: 100 }, { name: 'Other', value: 80 }];

function pie(breakout: object, options: object = {}, legend = 'none'): ChartSpec {
  return {
    width: 520, height: 300, legend, style: { roughness: 0, fillStyle: 'solid' },
    series: [{ type: 'pie', name: 'Sales', data: slices, breakout, ...options }],
  } as ChartSpec;
}

const europe = pie({ slice: 'Europe', data: parts });
const titles = (spec: ChartSpec) => layoutChart(spec).nodes.flatMap((node) => (node.kind === 'mark' ? [node.title] : []));
/** The lines drawn outside any mark: the connectors between the pies. */
const connectors = (spec: ChartSpec) =>
  layoutChart(spec).nodes.flatMap((node) => (node.kind === 'sketch' ? [node.sketch.paths[0]!.d] : []));

/** The outline of the slice whose tooltip starts `name: `. */
const sliceOutline = (spec: ChartSpec, name: string) =>
  layoutChart(spec).nodes.flatMap((node) =>
    (node.kind === 'mark' && node.title.startsWith(`${name}: `) && node.nodes[0]!.kind === 'sketch' ? [node.nodes[0]!.sketch.paths[0]!.d] : []));

/** Laying the chart out, run later, so that an error it throws can be expected. */
function layingOut(spec: ChartSpec) {
  return () => layoutChart(spec);
}

describe('pie of pie', () => {
  it('draws the slice broken out as a second pie of its parts, their shares of the slice', () => {
    expect(titles(europe)).toEqual([
      'Americas: 400 (40.0%)', 'Europe: 300 (30.0%)', 'Asia: 200 (20.0%)', 'Africa: 100 (10.0%)',
      'Europe, France: 120 (40.0%)', 'Europe, Germany: 100 (33.3%)', 'Europe, Other: 80 (26.7%)',
    ]);
  });

  it('turns the pie so the slice faces the second pie, joined to its top and foot', () => {
    // A radius of 142 centred at 153.5, 150: Europe's edges at 36 and 144 degrees. The second pie, of
    // radius 71, is centred at 437.5, 150.
    const [top, foot] = connectors(europe);

    expect(top).toMatch(/^M236\.97 35\.12 .*, 437\.5 79$/);
    expect(foot).toMatch(/^M236\.97 264\.88 .*, 437\.5 221$/);
  });

  it('draws the slice itself between the connectors, its middle facing the second pie', () => {
    // From the centre, out to the top connector's start, round through 295.5 150 (90 degrees), to
    // the foot connector's start.
    expect(sliceOutline(europe, 'Europe')[0])
      .toMatch(/^M153\.5 150 C[^C]*, 236\.97 35\.12 C[^C]*, 295\.5 150 C[^C]*, 236\.97 264\.88 /);
  });

  it('lists the parts in the legend after the slices', () => {
    expect(layoutChart(pie({ slice: 'Europe', data: parts }, {}, 'top')).labels)
      .toEqual(['Americas', 'Europe', 'Asia', 'Africa', 'France', 'Germany', 'Other']);
  });

  it('needs parts that add up to the slice', () => {
    expect(layingOut(pie({ slice: 'Europe', data: [...parts, { name: 'Spain', value: 1 }] })))
      .toThrow('series[0].breakout.data adds up to 301, but the slice it breaks out, "Europe", is 300');
  });

  it('needs the slice to be one of the pie, and its parts named apart from the slices', () => {
    expect(layingOut(pie({ slice: 'Oceania', data: parts })))
      .toThrow('series[0].breakout.slice is "Oceania", which names no slice of the pie');
    expect(layingOut(pie({ slice: 'Europe', data: [{ name: 'Asia', value: 300 }] })))
      .toThrow('series[0].breakout.data[0].name is "Asia", the name of a slice of the pie: parts are named apart from the slices');
  });

  it('turns the pie itself, so it takes no angles', () => {
    expect(layingOut(pie({ slice: 'Europe', data: parts }, { startAngle: 0 })))
      .toThrow('series[0].startAngle must be left out with breakout: the pie turns so that the slice it breaks out faces its parts');
  });

  it('breaks out of a pie of one ring only', () => {
    const rings = { ...europe, series: [europe.series[0]!, { type: 'pie', name: 'Inner', data: slices }] } as ChartSpec;

    expect(layingOut(rings)).toThrow('series[0].breakout needs a pie of one ring: nested rings cannot break a slice out');
  });
});
