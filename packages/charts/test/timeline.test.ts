import { describe, expect, it } from 'vitest';
import '../../core/test/support/forbid-unportable-calls.js';
import { layoutChart, toSvgChart, type ChartSpec } from '@borrowdale/charts';
import { labelsOutside, laying, overlappingTexts, svgTitles } from './support/layout.js';

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
const names = events.map(({ label }) => label);
const svg = (spec: ChartSpec): string => toSvgChart(layoutChart(spec));
// Listed ticks with long labels, on a linear axis over the last 541 million years.
const eras = [{ value: 0, label: 'Now' }, { value: 66, label: 'End of the Cretaceous' }, { value: 252, label: 'End of the Permian' }, { value: 541, label: 'Start of the Cambrian' }];
const geologic = (path: object, size: [number, number]): ChartSpec =>
  ({ width: size[0], height: size[1], axes: { time: { type: 'linear', ticks: eras, path } }, series: [{ type: 'timeline', name: 'T', data: [{ at: 0 }, { at: 541 }] }] }) as ChartSpec;
// Twelve labels a year apart on a straight track, each wider than a cell of the grid that finds the
// labels near a new one.
const longLabels = Array.from({ length: 12 }, (_, i) => ({ at: 2000 + i, label: `A rather long label, number ${i + 1}` }));
const wideLabels = { width: 600, height: 240, axes: { time: { type: 'linear' } }, series: [{ type: 'timeline', name: 'T', dataLabels: true, data: longLabels }] } as ChartSpec;
// Where each text `text` is drawn, in a mark or not.
const placesOf = (spec: ChartSpec, text: string): [number, number][] =>
  layoutChart(spec)
    .nodes.flatMap((node) => (node.kind === 'mark' ? node.nodes : [node]))
    .flatMap((node) => (node.kind === 'text' && node.text.text === text ? [[node.text.x, node.text.y] as [number, number]] : []));
// A hidden straight axis with listed ticks labelled `first` and `last`, which are not drawn.
const hiddenTicks = (first: string, last: string): ChartSpec =>
  ({ width: 400, height: 200, axes: { time: { type: 'linear', hidden: true, ticks: [{ value: 0, label: first }, { value: 100, label: last }] } }, series: [{ type: 'timeline', name: 'T', data: [{ at: 0 }, { at: 100 }] }] }) as ChartSpec;
// Four labels at one moment on a hidden axis: three take the places on one side, the fourth the
// first on the other, as close to the track as there are no tick labels to clear.
const fourAtOnce = { width: 400, height: 240, axes: { time: { type: 'time', hidden: true } }, series: [{ type: 'timeline', name: 'T', dataLabels: true, data: [{ at: '2000-01-01' }, { at: '2010-01-01', label: 'A' }, { at: '2010-01-01', label: 'B' }, { at: '2010-01-01', label: 'C' }, { at: '2010-01-01', label: 'D' }, { at: '2020-01-01' }] }] } as ChartSpec;
// A straight linear timeline from `from` to `to`, whose ticks are wide numbers.
const wide = (from: number, to: number, size: [number, number]): ChartSpec =>
  ({ width: size[0], height: size[1], axes: { time: { type: 'linear' } }, series: [{ type: 'timeline', name: 'T', data: [{ at: from }, { at: to }] }] }) as ChartSpec;

describe('a timeline', () => {
  it.each<[string, object | undefined, [number, number], string[]]>([
    ['lays a straight track by default', undefined, [460, 160], ['1960', '1970', '1980', '1990', '2000', '2010', '2020', '2030', ...names]],
    ['lays a serpentine, with ticks about every 50 units of its length', { type: 'serpentine', rows: 3 }, [460, 260], ['1965', '1970', '1975', '1980', '1985', '1990', '1995', '2000', '2005', '2010', '2015', '2020', '2025', ...names]],
    ['lays a curve through its points', { type: 'curve', points: [[0, 1], [0.3, 0.2], [0.7, 0.8], [1, 0]] }, [460, 260], ['1965', '1970', '1975', '1980', '1985', '1990', '1995', '2000', '2005', '2010', '2015', '2020', '2025', ...names]],
    ['lays a spiral out from the centre', { type: 'spiral', turns: 3 }, [360, 360], ['1968', '1970', '1972', '1974', '1976', '1978', '1980', '1982', '1984', '1986', '1988', '1990', '1992', '1994', '1996', '1998', '2000', '2002', '2004', '2006', '2008', '2010', '2012', '2014', '2016', '2018', '2020', '2022', ...names]],
  ])('%s', (_case, path, size, expected) => {
    expect(labels(timeline(path, size))).toEqual(expected);
  });

  // Three events close together on the last row, whose labels go below it, near the chart's edge.
  it('moves crowded labels apart at the edge of the chart, where they are kept inside it', () => {
    const crowded = [{ at: '1960-01-01', label: 'Start' }, { at: '2019-01-01', label: 'Alpha' }, { at: '2019-03-01', label: 'Bravo' }, { at: '2019-05-01', label: 'Charlie' }, { at: '2030-01-01', label: 'End' }];
    expect(overlappingTexts(layoutChart(timeline({ type: 'serpentine', rows: 3 }, [460, 260], crowded)))).toEqual([]);
  });

  // Its track is about 35,000 units long, so one tick per 50 units over 0 to 2,100 would be 1,051.
  it('lays a long spiral out without asking for more ticks than an axis may have', () => {
    const long = { ...timeline(undefined, [1000, 1000], [{ at: 0 }, { at: 2100 }]), axes: { time: { type: 'linear', path: { type: 'spiral', turns: 20 } } } } as ChartSpec;
    expect(laying(long)).not.toThrow();
  });

  it.each<[string, ChartSpec]>([
    ['the age of the Earth', wide(-4.6e9, 0, [600, 200])],
    ['the largest values', wide(0, 1e15, [400, 200])],
  ])('keeps tick labels as wide as those of %s on the chart', (_case, spec) => {
    expect(labelsOutside(layoutChart(spec))).toBe(0);
  });

  it('lays out as many rows as have room for their turns across the chart', () => {
    expect(laying(timeline({ type: 'serpentine', rows: 6 }, [300, 1000]))).not.toThrow();
  });

  it.each<[string, object, object]>([
    ['a serpentine of 3 rows', { type: 'serpentine' }, { type: 'serpentine', rows: 3 }],
    ['a spiral of 3 turns from a fifth of the radius', { type: 'spiral' }, { type: 'spiral', turns: 3, innerRadius: 0.2 }],
  ])('lays out %s by default', (_case, given, full) => {
    expect(svg(timeline(given))).toBe(svg(timeline(full)));
  });

  // Turns of a spiral close together, whose tick labels near each other belong to different turns.
  it('keeps tick labels on neighbouring turns apart', () => {
    expect(overlappingTexts(layoutChart(timeline({ type: 'spiral', turns: 6 }, [300, 300], [{ at: '1900-01-01' }, { at: '2020-01-01' }])))).toEqual([]);
  });

  it('keeps an event label at the start of the track on the chart', () => {
    expect(labelsOutside(layoutChart(timeline(undefined, [300, 160], [{ at: '2000-01-01', label: 'A long label right at the very start' }, { at: '2020-01-01' }])))).toBe(0);
  });

  it('lays a hidden axis out whatever its tick labels', () => {
    expect(layoutChart(hiddenTicks('A very long label at the very start', 'And another at the end'))).toEqual(layoutChart(hiddenTicks('a', 'b')));
  });

  it('puts a label on the far side of a hidden axis as close to the track as on the near side', () => {
    expect([placesOf(fourAtOnce, 'A'), placesOf(fourAtOnce, 'D')]).toEqual([[[195.97, 139.63]], [[195.34, 106.51]]]);
  });

  // The sides of a straight track widen for its last tick label, so both end labels are centred on
  // their ticks, "Now" as far in from the left as the last one is from the right.
  it('centres the long end labels of a straight track on their ticks', () => {
    const straight = geologic({ type: 'line' }, [400, 120]);
    expect([placesOf(straight, 'Now'), placesOf(straight, 'Start of the Cambrian')]).toEqual([[[61.56, 44.51]], [[261.79, 44.51]]]);
  });

  it('draws no event labels unless its dataLabels say so', () => {
    expect(labels({ width: 400, height: 200, series: [{ type: 'timeline', name: 'T', data: [{ at: '2000-01-01', label: 'A' }, { at: '2010-01-01', label: 'B' }] }] } as ChartSpec)).toEqual(['2000', '2002', '2004', '2006', '2008', '2010']);
  });

  it('reaches the end of a period after the last moment', () => {
    expect(labels(timeline(undefined, [400, 200], [{ at: '2000-01-01', to: '2030-01-01' }, { at: '2010-01-01' }]))).toEqual(['2000', '2010', '2020', '2030']);
  });

  // Its free end moves one step out from the min, as on any time axis.
  it('starts at its min with no events', () => {
    expect(labels({ width: 400, height: 200, axes: { time: { type: 'time', min: '2000-01-01' } }, series: [{ type: 'timeline', name: 'T', data: [] }] } as ChartSpec)).toEqual(['2000', '06:00']);
  });

  it('keeps labels wider than the cells of its grid apart', () => {
    expect(overlappingTexts(layoutChart(wideLabels))).toEqual([]);
  });

  it('gives an empty label no room, so a label at the same moment stays beside it', () => {
    const empty = timeline(undefined, [400, 200], [{ at: '2000-01-01', label: '' }, { at: '2000-01-01', label: 'B' }, { at: '2010-01-01' }]);
    const unlabelled = timeline(undefined, [400, 200], [{ at: '2000-01-01' }, { at: '2000-01-01', label: 'B' }, { at: '2010-01-01' }]);
    expect(placesOf(empty, 'B')).toEqual(placesOf(unlabelled, 'B'));
  });

  it('moves crowded labels apart on a hidden axis as on a shown one', () => {
    const crowded = [{ at: '1960-01-01', label: 'Start' }, { at: '2019-01-01', label: 'Alpha' }, { at: '2019-03-01', label: 'Bravo' }, { at: '2019-05-01', label: 'Charlie' }, { at: '2030-01-01', label: 'End' }];
    const hidden = { ...timeline({ type: 'serpentine', rows: 3 }, [460, 260], crowded), axes: { time: { type: 'time', hidden: true, path: { type: 'serpentine', rows: 3 } } } } as ChartSpec;
    expect(overlappingTexts(layoutChart(hidden))).toEqual([]);
  });

  it('draws a curve with a turn at a point that shares only its x with the one before', () => {
    expect(svg(timeline({ type: 'curve', points: [[0, 0], [0, 1], [1, 1]] }))).not.toBe(svg(timeline({ type: 'curve', points: [[0, 0], [1, 1]] })));
  });

  it.each<[string, ChartSpec]>([
    ['a serpentine of 3 rows at 200 × 300', geologic({ type: 'serpentine', rows: 3 }, [200, 300])],
    ['a straight track at 120 × 120', geologic({ type: 'line' }, [120, 120])],
    ['a spiral at 600 × 600', geologic({ type: 'spiral' }, [600, 600])],
    ['a curve straight across at 400 × 160, whose sides do not widen', geologic({ type: 'curve', points: [[0, 0.5], [1, 0.5]] }, [400, 160])],
  ])('lays long listed tick labels out on %s, all on the chart', (_case, spec) => {
    expect(labelsOutside(layoutChart(spec))).toBe(0);
  });

  it('draws a curve with a repeated point as the curve without it', () => {
    expect(svg(timeline({ type: 'curve', points: [[0, 1], [0.5, 0.2], [1, 0], [1, 0]] }))).toBe(svg(timeline({ type: 'curve', points: [[0, 1], [0.5, 0.2], [1, 0]] })));
  });

  it('writes moments and periods in tooltips', () => {
    expect(svgTitles(timeline(undefined, [460, 160])).slice(0, 3)).toEqual([
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
    ['rows whose turns are wider than the chart', timeline({ type: 'serpentine', rows: 2 }, [300, 1000]), 'Invalid chart: axes.time.path.rows is 2, but a 300 × 1000 chart needs at least 6 for the turns between them to fit across it'],
    ['rows whose turns are up to twice as wide as the chart', timeline({ type: 'serpentine', rows: 4 }, [300, 1000]), 'Invalid chart: axes.time.path.rows is 4, but a 300 × 1000 chart needs at least 6 for the turns between them to fit across it'],
    ['one more row than fits', timeline({ type: 'serpentine', rows: 5 }), 'Invalid chart: axes.time.path.rows is 5, but a 460 × 260 chart has room for 4'],
    ['rows whose turns need more rows than fit', timeline({ type: 'serpentine', rows: 2 }, [100, 400]), 'Invalid chart: axes.time.path.rows is 2, but a 100 × 400 chart is too narrow for the turns between rows, so it takes 1'],
    ['rows whose turns need more than 20 rows', timeline({ type: 'serpentine', rows: 2 }, [300, 6000]), 'Invalid chart: axes.time.path.rows is 2, but a 300 × 6000 chart is too narrow for the turns between rows, so it takes 1'],
    ['a period that ends where it starts', timeline(undefined, [460, 160], [{ at: '2000-01-01', to: '2000-01-01' }]), 'Invalid chart: series[0].data[0].to must be after at; leave it out for a moment'],
    ['an event label over 100 characters', timeline(undefined, [460, 160], [{ at: '2000-01-01', label: 'x'.repeat(101) }]), 'Invalid chart: series[0].data[0].label must be a string of at most 100 characters, got a string of 101 characters'],
    ['more than 20 rows', timeline({ type: 'serpentine', rows: 21 }), 'Invalid chart: axes.time.path.rows must be an integer from 1 to 20, got 21'],
    ['more than 20 turns', timeline({ type: 'spiral', turns: 21 }), 'Invalid chart: axes.time.path.turns must be a number from 1 to 20, got 21'],
    ['a curve of one point', timeline({ type: 'curve', points: [[0, 0]] }), 'Invalid chart: axes.time.path.points must have 2 to 100 entries, got 1'],
    ['a curve with no length', timeline({ type: 'curve', points: [[0.5, 0.5], [0.5, 0.5]] }), 'Invalid chart: axes.time.path.points must be spread out: on a 460 × 260 chart they make a track shorter than 1'],
    ['a curve point off the chart', timeline({ type: 'curve', points: [[0, 0], [1.5, 1]] }), 'Invalid chart: axes.time.path.points[1][0] must be a number from 0 to 1, got 1.5'],
    ['a curve point below the chart', timeline({ type: 'curve', points: [[0, 0], [1, 1.5]] }), 'Invalid chart: axes.time.path.points[1][1] must be a number from 0 to 1, got 1.5'],
    ['an unknown track', timeline({ type: 'wave' }), 'Invalid chart: axes.time.path.type must be one of line, serpentine, spiral, curve, got "wave"'],
    ['a key of another track', timeline({ type: 'line', rows: 2 }), 'Invalid chart: axes.time.path has an unknown key, "rows"'],
    ['a period that ends before it starts', timeline(undefined, [460, 160], [{ at: '2000-01-01', to: '1999-01-01' }]), 'Invalid chart: series[0].data[0].to must be after at; leave it out for a moment'],
    ['an event without a time', timeline(undefined, [460, 160], [{ label: 'x' }]), 'Invalid chart: series[0].data[0].at is missing'],
    ['a min after the earliest event', { ...timeline(undefined), axes: { time: { type: 'time', min: '2000-01-01' } } } as ChartSpec, 'Invalid chart: axes.time.min is 2000-01-01, but the data reach 1969-07-20'],
    ['times on a linear axis', { ...timeline(undefined), axes: { time: { type: 'linear' } } } as ChartSpec, 'Invalid chart: series[0].data[0].at must be a number, since axes.time is not a time axis, got "1969-07-20"'],
    ['a band axis', { ...timeline(undefined), axes: { time: { type: 'band', categories: ['a'] } } } as unknown as ChartSpec, 'Invalid chart: axes.time.type must be "time" or "linear", got "band"'],
    ['a title on its axis', { ...timeline(undefined), axes: { time: { type: 'time', title: 'Year' } } } as ChartSpec, 'Invalid chart: axes.time has an unknown key, "title"'],
    ['a timeline beside a cartesian series', { ...timeline(undefined), series: [{ type: 'timeline', name: 'T', data: [] }, { type: 'scatter', name: 'S', data: [] }] } as ChartSpec, 'Invalid chart: series[1] is a scatter series, which cannot share a chart with series[0], a timeline series'],
  ])('rejects %s', (_case, spec, message) => {
    expect(laying(spec)).toThrow(message);
  });
});
