import { describe, expect, it } from 'vitest';
import '../../core/test/support/forbid-unportable-calls.js';
import { layoutChart, toSvgChart, type ChartSpec } from '@borrowdale/charts';

const events = [
  { at: '1969-07-20', label: 'Moon landing' },
  { at: '1977-09-05', label: 'Voyager 1' },
  { at: '1981-04-12', to: '2011-07-21', label: 'Space Shuttle' },
  { at: '1990-04-24', label: 'Hubble' },
  { at: '1998-11-20', label: 'ISS' },
  { at: '2021-12-25', label: 'Webb' },
];
const timeline = (path: object | undefined, size: [number, number] = [460, 260], data: object[] = events): ChartSpec =>
  ({
    width: size[0],
    height: size[1],
    ...(path === undefined ? {} : { axes: { time: { type: 'time', path } } }),
    series: [{ type: 'timeline', name: 'Missions', dataLabels: true, data }],
  }) as ChartSpec;
const labels = (spec: ChartSpec): string[] => layoutChart(spec).labels;
const titles = (spec: ChartSpec): string[] => [...toSvgChart(layoutChart(spec)).matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]!);
const laying = (spec: ChartSpec) => () => layoutChart(spec);
const names = events.map(({ label }) => label);

describe('a timeline', () => {
  it.each<[string, object | undefined, [number, number], string[]]>([
    ['lays a straight track by default', undefined, [460, 160], ['1960', '1970', '1980', '1990', '2000', '2010', '2020', '2030', ...names]],
    ['lays a serpentine, with ticks about every 50 units of its length', { type: 'serpentine', rows: 3 }, [460, 260], ['1965', '1970', '1975', '1980', '1985', '1990', '1995', '2000', '2005', '2010', '2015', '2020', '2025', ...names]],
    ['lays a curve through its points', { type: 'curve', points: [[0, 1], [0.3, 0.2], [0.7, 0.8], [1, 0]] }, [460, 260], ['1965', '1970', '1975', '1980', '1985', '1990', '1995', '2000', '2005', '2010', '2015', '2020', '2025', ...names]],
    ['lays a spiral out from the centre', { type: 'spiral', turns: 3 }, [360, 360], ['1968', '1970', '1972', '1974', '1976', '1978', '1980', '1982', '1984', '1986', '1988', '1990', '1992', '1994', '1996', '1998', '2000', '2002', '2004', '2006', '2008', '2010', '2012', '2014', '2016', '2018', '2020', '2022', ...names]],
  ])('%s', (_case, path, size, expected) => {
    expect(labels(timeline(path, size))).toEqual(expected);
  });

  it('writes moments and periods in tooltips', () => {
    expect(titles(timeline(undefined, [460, 160])).slice(0, 3)).toEqual([
      'Missions: Moon landing, 1969-07-20',
      'Missions: Voyager 1, 1977-09-05',
      'Missions: Space Shuttle, 1981-04-12 to 2011-07-21',
    ]);
  });

  it('lays numbers along a linear track', () => {
    const distances = { width: 400, height: 140, axes: { time: { type: 'linear' } }, series: [{ type: 'timeline', name: 'Km', data: [{ at: 0 }, { at: 42, to: 96 }, { at: 150 }] }] } as ChartSpec;
    expect(labels(distances)).toEqual(['0', '20', '40', '60', '80', '100', '120', '140', '160']);
  });

  it('draws the same twice', () => {
    expect(toSvgChart(layoutChart(timeline({ type: 'spiral' }, [360, 360])))).toBe(toSvgChart(layoutChart(timeline({ type: 'spiral' }, [360, 360]))));
  });

  it.each<[string, ChartSpec, string]>([
    ['more rows than fit', timeline({ type: 'serpentine', rows: 12 }), 'Invalid chart: axes.time.path.rows is 12, but a 460 × 260 chart has room for 4'],
    ['more than 20 rows', timeline({ type: 'serpentine', rows: 21 }), 'Invalid chart: axes.time.path.rows must be an integer from 1 to 20, got 21'],
    ['more than 20 turns', timeline({ type: 'spiral', turns: 21 }), 'Invalid chart: axes.time.path.turns must be a number from 1 to 20, got 21'],
    ['a curve of one point', timeline({ type: 'curve', points: [[0, 0]] }), 'Invalid chart: axes.time.path.points must have 2 to 100 entries, got 1'],
    ['a curve with no length', timeline({ type: 'curve', points: [[0.5, 0.5], [0.5, 0.5]] }), 'Invalid chart: axes.time.path.points must be spread out: on a 460 × 260 chart they make a track shorter than 1'],
    ['a curve point off the chart', timeline({ type: 'curve', points: [[0, 0], [1.5, 1]] }), 'Invalid chart: axes.time.path.points[1][0] must be a number from 0 to 1, got 1.5'],
    ['an unknown track', timeline({ type: 'wave' }), 'Invalid chart: axes.time.path.type must be one of line, serpentine, spiral, curve, got "wave"'],
    ['a key of another track', timeline({ type: 'line', rows: 2 }), 'Invalid chart: axes.time.path has an unknown key, "rows"'],
    ['a period that ends before it starts', timeline(undefined, [460, 160], [{ at: '2000-01-01', to: '1999-01-01' }]), 'Invalid chart: series[0].data[0].to must be after at; leave it out for a moment'],
    ['an event without a time', timeline(undefined, [460, 160], [{ label: 'x' }]), 'Invalid chart: series[0].data[0].at is missing'],
    ['a band axis', { ...timeline(undefined), axes: { time: { type: 'band', categories: ['a'] } } } as unknown as ChartSpec, 'Invalid chart: axes.time.type must be "time" or "linear", got "band"'],
    ['a title on its axis', { ...timeline(undefined), axes: { time: { type: 'time', title: 'Year' } } } as ChartSpec, 'Invalid chart: axes.time has an unknown key, "title"'],
    ['a timeline beside a cartesian series', { ...timeline(undefined), series: [{ type: 'timeline', name: 'T', data: [] }, { type: 'scatter', name: 'S', data: [] }] } as ChartSpec, 'Invalid chart: series[1] is a scatter series, which cannot share a chart with series[0], a timeline series'],
  ])('rejects %s', (_case, spec, message) => {
    expect(laying(spec)).toThrow(message);
  });
});
