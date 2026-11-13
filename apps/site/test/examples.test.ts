import statisticalCases from '../../examples/statistical-cases.json';
import { afterEach, describe, it, expect } from 'vitest';
import { examples, categories, gallery, galleryState, chartExamples } from '../src/gallery';
import { editorCode } from '../src/editor';
import { pageHtml } from '../src/pages';
import { executeExample } from '../src/playground-runtime';
import { worldAt, countryValue, world, climate, quakes, median, dailyCounts } from '../src/data';
import { dashboardState, worldDashboard, climateDashboard, quakeDashboard, boxChart } from '../src/dashboards';
import { dataRows } from '../src/data-table';
import { chart, chartSpec, reseed } from '../src/drawing';
import cartesianCases from '../../examples/cartesian-cases.json';
import timeCases from '../../examples/time-cases.json';
import gridCases from '../../examples/grid-cases.json';
import proportionCases from '../../examples/proportion-cases.json';
import hierarchyCases from '../../examples/hierarchy-cases.json';
import type { ChartSpec } from '@borrowdale/charts';

// The gallery's chart examples with a name, and the spec the gallery holds under it.
const galleryCharts = (name: string) =>
  examples.filter((example) => example.category === 'charts' && example.name === name);
const gallerySpec = (name: string) => chartExamples.find((example) => example.name === name)?.spec;
// The tag the gallery gives the chart example of this name.
const galleryTag = (name: string) => galleryCharts(name)[0]?.tag;

// Tests change the shared dashboard and gallery state; each starts from the state the site loads with.
const initialDashboard = { ...dashboardState };
const initialGallery = { ...galleryState };
afterEach(() => {
  Object.assign(dashboardState, initialDashboard);
  Object.assign(galleryState, initialGallery);
});

describe('gallery coverage and actual rendering', () => {
  it.each([['shapes', 'rectangle/outline/a'], ['patterns', 'lines/a']])('re-sketches %s fixtures and keeps their editable code in sync', (category, name) => {
    const shape = examples.find((example) => example.category === category && example.name === name)!;
    const beforePreview = shape.render('svg');
    const beforeCode = executeExample(editorCode(shape));
    reseed();
    const afterPreview = shape.render('svg');
    const afterCode = executeExample(editorCode(shape));
    const paths = (svg: string) => [...svg.matchAll(/<path[^>]* d="([^"]+)"/g)].map((match) => match[1]);
    expect(paths(beforePreview).length).toBeGreaterThan(0);
    expect(paths(afterPreview)).not.toEqual(paths(beforePreview));
    expect(paths(afterCode)).not.toEqual(paths(beforeCode));
    expect(paths(afterCode)).toEqual(paths(afterPreview));
  });

  it('hides Re-sketch for fixed text glyphs but offers it for shapes', () => {
    galleryState.category = 'text';
    expect(pageHtml('/playground/')).toMatch(/<button hidden id="resketch"/);
    galleryState.category = 'shapes';
    expect(pageHtml('/playground/')).not.toMatch(/<button hidden id="resketch"/);
  });

  it('includes every Cartesian composition in the editable gallery', () => {
    for (const entry of cartesianCases) {
      const matches = examples.filter((example) => example.category === 'charts' && example.name === entry.name);
      expect(matches).toHaveLength(1);
      expect(chartExamples.find((example) => example.name === entry.name)!.spec).toEqual(entry.spec);
      expect(executeExample(editorCode(matches[0]!))).toContain('<svg');
    }
  });

  // A heatmap is tagged by the shape of its cells, and as a correlation when it is one, so the hexagon and
  // correlation views can be found by name. A unit or funnel chart is tagged by its display, and a
  // pictorial bar and a pie of pie by name. A hierarchy is tagged by its display, except that a pack is
  // circle packing and an upward icicle a flame graph.
  it.each([
    ['heatmap', 'heatmap'],
    ['punch-card', 'circle heatmap'],
    ['hexagon-heatmap', 'hex heatmap'],
    ['correlation-matrix', 'correlation heatmap'],
    ['calendar-heatmap', 'calendar'],
    ['radar-heatmap', 'polarHeatmap'],
    ['horizon', 'horizon'],
    ['waffle', 'waffle'],
    ['pictorial-stacked', 'pictorialStacked'],
    ['pictorial-bar', 'pictorial bar'],
    ['pie-of-pie', 'pie of pie'],
    ['confusion-matrix', 'heatmap'],
    ['tile-map', 'hex heatmap'],
    ['image-units', 'rows'],
    ['image-pictorial-bar', 'pictorial bar'],
    ['treemap-nested', 'treemap'],
    ['icicle-right', 'icicle'],
    ['flame-graph', 'flame graph'],
    ['circle-packing', 'circle packing'],
  ])('tags the example %s as %s', (name, tag) => {
    expect(galleryTag(name)).toBe(tag);
  });

  it('has time examples to check', () => {
    expect(timeCases.length).toBeGreaterThan(0);
  });

  it.each([...timeCases, ...statisticalCases, ...gridCases, ...proportionCases, ...hierarchyCases])('includes the $name composition in the editable gallery', ({ name, spec }) => {
    expect(galleryCharts(name)).toHaveLength(1);
    expect(gallerySpec(name)).toEqual(spec);
    expect(executeExample(editorCode(galleryCharts(name)[0]!))).toContain('<svg');
  });

  it('ships image markers with embedded raster assets in gallery and editable code', () => {
    const example = examples.find((e) => e.name === 'image-markers')!;
    for (const svg of [example.render('svg'), executeExample(editorCode(example))]) {
      expect(svg).toContain('data:image/png;base64,');
      expect(svg.match(/<use /g)).toHaveLength(3);
    }
    expect(pageHtml('/playground/charts/image-markers/')).toContain('image markers');
  });

  // 6 + 9 + 4 units, and a legend entry for each of the 3 teams, each drawn as the badge.
  it('draws every unit of the image unit chart as the badge, in the gallery and in its editable code', () => {
    expect(galleryCharts('image-units')[0]!.render('svg').match(/<use /g)).toHaveLength(22);
    expect(executeExample(editorCode(galleryCharts('image-units')[0]!)).match(/<use /g)).toHaveLength(22);
    expect(editorCode(galleryCharts('image-units')[0]!)).toContain('data:image/png;base64,');
    expect(pageHtml('/playground/charts/image-units/')).toContain('image units');
  });

  it('repeats the badge along the pictorial bars, in the gallery and in its editable code', () => {
    expect(galleryCharts('image-pictorial-bar')[0]!.render('svg')).toContain('data:image/png;base64,');
    expect(executeExample(editorCode(galleryCharts('image-pictorial-bar')[0]!))).toContain('<use ');
    expect(pageHtml('/playground/charts/image-pictorial-bar/')).toContain('image pictorial bar');
  });

  it('renders data labels beyond the axis tick labels', () => {
    const example = examples.find((e) => e.name === 'data-labels')!;
    for (const svg of [example.render('svg'), executeExample(editorCode(example))]) {
      for (const value of [12, 24, 18, 9]) expect(svg).toContain(`>${value}</text>`);
    }
    expect(pageHtml('/playground/charts/data-labels/')).toContain('data labels');
  });

  it('isolates gradient references when multiple chart previews share a document', () => {
    const spec = cartesianCases.find((entry) => entry.name === 'gradient-line')!.spec as ChartSpec;
    const first = chart(spec), second = chart(spec);
    const ids = [first, second].map((svg) => [...svg.matchAll(/<linearGradient id="([^"]+)"/g)].map((match) => match[1]!));
    expect(ids[0]!.length).toBeGreaterThan(0);
    expect(ids[1]!.length).toBeGreaterThan(0);
    expect(new Set(ids.flat()).size).toBe(ids.flat().length);
    for (const [index, svg] of [first, second].entries()) {
      for (const id of ids[index]!) expect(svg).toContain(`url(#${id})`);
    }
  });

  it.each(examples)('$category: $name renders and has copyable code', (example) => {
    const output = example.render('svg');
    expect(output).not.toMatch(/NaN|Infinity|undefined/);
    expect(output.length).toBeGreaterThan(20);
    expect(editorCode(example)).toContain('import ');
  });
  it('covers every supported drawing, chart and tile family', () => {
    expect(
      [
        ...new Set(examples.filter((x) => x.category === 'charts').flatMap((x) => x.families ?? [x.tag])),
      ].sort(),
    ).toEqual(
      [
        'area',
        'bar',
        'bubble',
        'calendar',
        'gauge',
        'heatmap',
        'horizon',
        'histogram',
        'distribution',
        'relationship',
        'market',
        'line',
        'interval',
        'xyLine',
        'xyArea',
        'pie',
        'polarArea',
        'polarHeatmap',
        'polarLine',
        'polarScatter',
        'radar',
        'radialBar',
        'rangeArea',
        'rose',
        'scatter',
        'timeline',
        'xRange',
        'units',
        'funnel',
        'liquid',
        'venn',
        'hierarchy',
      ].sort(),
    );
    expect([...new Set(examples.filter((x) => x.category === 'shapes').map((x) => x.tag))].sort()).toEqual(
      ['arc', 'circle', 'curve', 'ellipse', 'line', 'linearPath', 'path', 'polygon', 'rectangle'].sort(),
    );
    expect([...new Set(examples.filter((x) => x.category === 'patterns').map((x) => x.tag))].sort()).toEqual([
      'circles',
      'cross-hatch',
      'lines',
    ]);
    expect(categories.every((c) => examples.some((x) => x.category === c))).toBe(true);
  });
});
describe('data integrity and derived views', () => {
  it('retains source attribution and null observations', () => {
    for (const data of [world, climate, quakes]) {
      expect(data.sourceUrl).toMatch(/^https:/);
      expect(data.retrieved).toBe('2026-10-29');
      expect(data.rows.length).toBeGreaterThan(0);
    }
    expect(countryValue('ZZZ', 2023, 'missing')).toBeNull();
    expect(worldAt(2023)).toHaveLength(12);
  });
  it('calculates even and odd medians without changing inputs', () => {
    const values = [8, 1, 4, 2];
    expect(median(values)).toBe(3);
    expect(values).toEqual([8, 1, 4, 2]);
    expect(median([7, 3, 1])).toBe(3);
    expect(median([])).toBeNull();
  });
  it('accounts for every event and keeps zero-count days after filtering', () => {
    const rows = dailyCounts(quakes.rows);
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(quakes.rows.length);
    const empty = dailyCounts([]);
    expect(empty.map((r) => r.date)).toEqual(rows.map((r) => r.date));
    expect(empty.every((r) => r.count === 0)).toBe(true);
  });
  it.each([2010, 2023, 2024])('world dashboard handles year %s with honest missing-data values', (year) => {
    dashboardState.year = year;
    expect(worldDashboard()).not.toMatch(/NaN|Infinity|render-error/);
  });
  it.each([1880, 1950, 1970, 2000])('climate dashboard renders since %s', (since) => {
    dashboardState.since = since;
    expect(climateDashboard()).not.toMatch(/NaN|Infinity|render-error/);
  });
  it.each([4.5, 5, 6, 7, 10])(
    'earthquake dashboard handles magnitude %s including no events',
    (magnitude) => {
      dashboardState.magnitude = magnitude;
      expect(quakeDashboard()).not.toMatch(/NaN|Infinity|render-error/);
    },
  );
});

describe('statistical charts in the notebooks', () => {
  it('lists the magnitude histogram by bin, with each tenth of magnitude in its own bin', () => {
    const html = quakeDashboard();
    expect(html).toContain('<td>4.45–4.55</td><td>143</td>');
    expect(html).toContain('<td>7.65–7.75</td><td>1</td>');
  });
  it('counts the events in each depth layer the box chart shares with the depth chart', () => {
    const html = quakeDashboard();
    expect(html).toContain('<th scope="row">Events</th><td>Below 70 km</td><td>588</td>');
    expect(html).toContain('<th scope="row">Events</th><td>70–299 km</td><td>118</td>');
    expect(html).toContain('<th scope="row">Events</th><td>300 km or deeper</td><td>31</td>');
  });
  it.each([
    [4.5, '4.45–4.55', 33],
    [5, '4.95–5.05', 28],
    [6, '5.95–6.05', 18],
    [7, '6.95–7.05', 8],
  ])('starts the histogram half a tenth below magnitude %s, in bin %s, with %s bins', (magnitude, first, bins) => {
    dashboardState.magnitude = magnitude;
    const html = quakeDashboard();
    expect(html).toContain(`<td>${first}</td>`);
    expect(html.match(/<td>\d\.\d5–\d\.\d5<\/td>/g)).toHaveLength(bins);
  });
  it('draws the magnitudes of every depth layer that holds events', () => {
    dashboardState.magnitude = 6;
    const html = quakeDashboard();
    expect(html).toContain('<th scope="row">Below 70 km</th><td>Sample 1</td>');
    expect(html).toContain('<th scope="row">70–299 km</th><td>Sample 1</td>');
    expect(html).toContain('<th scope="row">300 km or deeper</th><td>Sample 1</td>');
    expect(html).toContain('&quot;label&quot;: &quot;70–299 km&quot;');
  });
  it('leaves out a depth layer with no events, while the depth chart still counts it as zero', () => {
    dashboardState.magnitude = 7;
    const html = quakeDashboard();
    expect(html).toContain('<th scope="row">Below 70 km</th><td>Sample 1</td><td>7</td>');
    expect(html).toContain('<th scope="row">Below 70 km</th><td>Sample 2</td><td>7.7</td>');
    expect(html).not.toContain('&quot;label&quot;: &quot;70–299 km&quot;');
    expect(html).toContain('<th scope="row">Events</th><td>70–299 km</td><td>0</td>');
  });
  it('leaves out the magnitude boxes when no event reaches the threshold', () => {
    dashboardState.magnitude = 10;
    expect(quakeDashboard()).not.toContain('Strength at every depth');
  });
  it('draws one box per decade, from the complete years in view', () => {
    dashboardState.since = 2000;
    const html = climateDashboard();
    expect(html).toContain('<th scope="row">2000s</th><td>Sample 1</td><td>0.39</td>');
    expect(html).toContain('<th scope="row">2000s</th><td>Sample 10</td>');
    expect(html).not.toContain('<th scope="row">2000s</th><td>Sample 11</td>');
    expect(html).toContain('<th scope="row">2020s</th>');
    expect(html).not.toContain('<th scope="row">1990s</th>');
  });
  it('smooths the annual anomalies with a LOESS curve, listing years without a separator', () => {
    dashboardState.since = 2000;
    const html = climateDashboard();
    expect(html).toContain('<th scope="row">Annual anomaly</th><td>1</td><td>2000 · 0.39</td>');
    expect(html).toContain('<th scope="row">LOESS trend</th><td></td><td>LOESS fit to 26 observations</td>');
  });
  it('fits life expectancy to the logarithm of income across the complete countries', () => {
    const html = worldDashboard();
    expect(html).toContain('<th scope="row">Logarithmic fit</th><td></td><td>Logarithmic fit to 12 observations</td>');
    // Fitted on the bubbles' own x, GDP per person in US$ thousands, not in dollars.
    expect(html).toContain(
      '&quot;name&quot;: &quot;Logarithmic fit&quot;,\n      &quot;color&quot;: &quot;#263b33&quot;,\n      &quot;data&quot;: [\n        [\n          65.0583773146674,',
    );
  });
});

describe('colour and unit charts in the notebooks', () => {
  // 2000 to 2025: one stripe for each of the 26 complete years, the latest included.
  it('draws a warming stripe for each complete year in view, the latest included', () => {
    dashboardState.since = 2000;
    const html = climateDashboard();
    expect(html).toContain('<th scope="row">Annual anomaly</th><td>2000 – 2001, Year</td><td>0.39</td>');
    expect(html).not.toContain('<td>1999 – 2000, Year</td>');
    expect(html.match(/<th scope="row">Annual anomaly<\/th><td>\d{4} – \d{4}, Year<\/td>/g)).toHaveLength(26);
    expect(html).toContain('<th scope="row">Annual anomaly</th><td>2025 – 2026, Year</td>');
  });
  it('draws all 146 complete years from 1880', () => {
    dashboardState.since = 1880;
    expect(climateDashboard().match(/<th scope="row">Annual anomaly<\/th><td>\d{4} – \d{4}, Year<\/td>/g)).toHaveLength(146);
  });
  it('starts the stripes axis at the first year in view and ends it at the last stripe', () => {
    dashboardState.since = 2000;
    expect(climateDashboard()).toContain('&quot;min&quot;: &quot;2000&quot;,\n      &quot;max&quot;: &quot;2026&quot;');
  });
  it('colours the stripes and the month grid on one blue-to-red scale, even about 0', () => {
    expect(climateDashboard().match(/&quot;scheme&quot;: &quot;blue-red&quot;,\n {4}&quot;min&quot;: -1.5,\n {4}&quot;max&quot;: 1.5,/g)).toHaveLength(2);
  });
  it.each([1880, 2000])('keeps the month grid to the last 30 complete years, whatever the view starts from: %s', (since) => {
    dashboardState.since = since;
    const html = climateDashboard();
    expect(html).toContain('<th scope="row">Monthly anomaly</th><td>1996 – 1997, Jan</td><td>0.24</td>');
    expect(html).toContain('<th scope="row">Monthly anomaly</th><td>2025 – 2026, Dec</td><td>1.05</td>');
    expect(html).not.toContain('<th scope="row">Monthly anomaly</th><td>1995 – 1996, Dec</td>');
    expect(html.match(/<th scope="row">Monthly anomaly<\/th>/g)).toHaveLength(360);
    expect(html).toContain('&quot;min&quot;: &quot;1996&quot;,\n      &quot;max&quot;: &quot;2026&quot;');
    expect(html).toContain('the last 30 complete years, 1996–2025');
  });
  it('puts every day of the feed on the calendar, from its first day to its last', () => {
    const html = quakeDashboard();
    expect(html).toContain('<th scope="row">Events</th><td>1</td><td>2026-09-29 · 2</td>');
    expect(html).toContain('<th scope="row">Events</th><td>31</td><td>2026-10-29 · 17</td>');
    expect(html).toContain('&quot;from&quot;: &quot;2026-09-29&quot;,\n      &quot;to&quot;: &quot;2026-10-29&quot;,');
  });
  it('keeps a day with no event at the threshold on the calendar', () => {
    dashboardState.magnitude = 6;
    expect(quakeDashboard()).toContain('<th scope="row">Events</th><td>1</td><td>2026-09-29 · 0</td>');
  });
  it('draws one square for each event in each magnitude class', () => {
    const html = quakeDashboard();
    expect(html).toContain('<th scope="row">Events</th><td>M 4.5–4.9</td><td>527</td>');
    expect(html).toContain('<th scope="row">Events</th><td>M 5.0–5.9</td><td>191</td>');
    expect(html).toContain('<th scope="row">Events</th><td>M 6.0+</td><td>19</td>');
  });
  it('leaves out the classes below the threshold, and keeps the colour of the one left', () => {
    dashboardState.magnitude = 6;
    const html = quakeDashboard();
    expect(html).not.toContain('<td>M 4.5–4.9</td>');
    expect(html).not.toContain('<td>M 5.0–5.9</td>');
    expect(html).toContain('<th scope="row">Events</th><td>M 6.0+</td><td>19</td>');
    expect(html).toContain('&quot;name&quot;: &quot;M 6.0+&quot;,\n          &quot;value&quot;: 19,\n          &quot;color&quot;: &quot;#3b7662&quot;');
  });
  it('counts the events from M 7 in the M 6.0+ class', () => {
    dashboardState.magnitude = 7;
    expect(quakeDashboard()).toContain('<th scope="row">Events</th><td>M 6.0+</td><td>2</td>');
  });
  it('leaves out the calendar and the squares when no event reaches the threshold', () => {
    dashboardState.magnitude = 10;
    const html = quakeDashboard();
    expect(html).not.toContain('On the calendar');
    expect(html).not.toContain('One square, one event');
  });
  it('fills a life expectancy cell for each of the 12 countries in each of the 15 years', () => {
    const html = worldDashboard();
    expect(html).toContain('<th scope="row">Life expectancy</th><td>2010, Australia</td><td>81.7</td>');
    expect(html.match(/<th scope="row">Life expectancy<\/th>/g)).toHaveLength(180);
  });
  // Five countries and the rest, one palette colour each: the rest take the sixth.
  it('counts the five most populous countries in tens of millions, and the other seven together', () => {
    const html = worldDashboard();
    expect(html).toContain('<th scope="row">Tens of millions</th><td>India</td><td>144</td>');
    expect(html).toContain('<th scope="row">Tens of millions</th><td>Japan</td><td>12</td>');
    expect(html).toContain('<th scope="row">Tens of millions</th><td>Other 7 countries</td><td>36</td>');
    expect(html).not.toContain('<th scope="row">Tens of millions</th><td>Hungary</td>');
    expect(html.indexOf('<td>India</td><td>144</td>')).toBeLessThan(html.indexOf('<td>China</td><td>141</td>'));
    expect(html).toContain('&quot;name&quot;: &quot;Other 7 countries&quot;,\n          &quot;value&quot;: 36,\n          &quot;color&quot;: &quot;#8c8a50&quot;');
  });
  // In 2010 China still outnumbered India, and the other seven, rounded together, make 33 squares (32 if
  // each were rounded first): the squares and the note follow the year chosen.
  it('counts the people in the year chosen, the other countries together', () => {
    dashboardState.year = 2010;
    const html = worldDashboard();
    expect(html).toContain('<th scope="row">Tens of millions</th><td>China</td><td>134</td>');
    expect(html.indexOf('<td>China</td><td>134</td>')).toBeLessThan(html.indexOf('<td>India</td><td>124</td>'));
    expect(html).toContain('<th scope="row">Tens of millions</th><td>Other 7 countries</td><td>33</td>');
    expect(html).toContain('Each square is ten million people in 2010, rounded');
  });
});

describe('data tables', () => {
  const trips = {
    width: 400,
    height: 300,
    axes: { x: { type: 'linear' }, y: { type: 'linear' } },
    series: [{ type: 'histogram', name: 'Trips', edges: [0, 10, 20, 30], data: [5, 7, 10, 12, 18, 30] }],
  } as const;
  it.each([
    [{}, '2', '3', '1'],
    [{ cumulative: true }, '2', '5', '6'],
    [{ frequency: 'relative' }, '0.33', '0.5', '0.17'],
    [{ frequency: 'relative', cumulative: true }, '0.33', '0.83', '1'],
  ])('lists a histogram with %o by the heights it draws, the last bin holding its right edge', (options, first, second, third) => {
    const spec = { ...trips, series: [{ ...trips.series[0], ...options }] } as ChartSpec;
    expect(dataRows(spec)).toEqual([
      ['Trips', '0–10', first],
      ['Trips', '10–20', second],
      ['Trips', '20–30', third],
    ]);
  });
  // The table counts bins with its own copy of the chart's rule, so the two must agree where samples
  // sit on an interior edge (10) and on the final edge (30).
  it('lists the same bin counts the chart draws', () => {
    expect(dataRows({ ...trips } as ChartSpec)).toEqual([
      ['Trips', '0–10', '2'],
      ['Trips', '10–20', '3'],
      ['Trips', '20–30', '1'],
    ]);
    const svg = chart({ ...trips } as ChartSpec);
    expect(svg).toContain('<title>Trips, [0, 10): 2</title>');
    expect(svg).toContain('<title>Trips, [10, 20): 3</title>');
    expect(svg).toContain('<title>Trips, [20, 30]: 1</title>');
  });
  it('lists an empty relative histogram as zero in every bin', () => {
    const spec = { ...trips, series: [{ ...trips.series[0], data: [], frequency: 'relative' }] } as ChartSpec;
    expect(dataRows(spec)).toEqual([
      ['Trips', '0–10', '0'],
      ['Trips', '10–20', '0'],
      ['Trips', '20–30', '0'],
    ]);
  });
  it('lists a histogram without a separator when its axis drops it', () => {
    const spec = {
      ...trips,
      axes: { x: { type: 'linear', format: { thousandsSeparator: '' } }, y: { type: 'linear' } },
      series: [{ type: 'histogram', name: 'Years', edges: [1990, 2000, 2010], data: [1995, 2000, 2010] }],
    } as ChartSpec;
    expect(dataRows(spec)).toEqual([
      ['Years', '1990–2000', '1'],
      ['Years', '2000–2010', '2'],
    ]);
  });
  it('lists each sample of a distribution by its number', () => {
    const spec = {
      ...trips,
      series: [{ type: 'distribution', display: 'box', name: 'East', data: [12, 1500] }],
    } as ChartSpec;
    expect(dataRows(spec)).toEqual([
      ['East', 'Sample 1', '12'],
      ['East', 'Sample 2', '1,500'],
    ]);
  });
  it('names a regression without a method as a linear fit', () => {
    const spec = {
      ...trips,
      series: [{ type: 'relationship', display: 'regression', name: 'Fit', data: [[1, 2], [2, 3], [3, 5]] }],
    } as ChartSpec;
    expect(dataRows(spec)).toEqual([['Fit', '', 'Linear fit to 3 observations']]);
  });
  it.each([
    [{}, '1,500'],
    [{ thousandsSeparator: '' }, '1500'],
  ])('lists values with an axis format of %o as %s', (format, value) => {
    const spec = chartSpec('Orders', ['Q1'], [{ type: 'bar', name: 'Orders', data: [1500] }], {
      axes: { x: { type: 'band', categories: ['Q1'] }, y: { type: 'linear', format } },
    });
    expect(dataRows(spec)).toEqual([['Orders', 'Q1', value]]);
  });
});

describe('box charts', () => {
  const groups = [
    { name: 'East', data: [12, 14, 15] },
    { name: 'West', data: [10, 11] },
  ];
  it('stands each box at its labelled tick, two units apart, with half a unit of room at each end', () => {
    const spec = boxChart('Journeys', groups, '#397e92', { title: 'Minutes' });
    expect(spec.axes).toEqual({
      x: { type: 'linear', min: 0, max: 4, ticks: [{ value: 1, label: 'East' }, { value: 3, label: 'West' }] },
      y: { type: 'linear', grid: true, title: 'Minutes' },
    });
    expect(spec.series).toMatchObject([
      { type: 'distribution', display: 'box', name: 'East', position: 1, data: [12, 14, 15] },
      { type: 'distribution', display: 'box', name: 'West', position: 3, data: [10, 11] },
    ]);
  });
  it('hatches the boxes so their median line stays visible', () => {
    expect(boxChart('Journeys', groups, '#397e92', {}).style).toEqual({ roughness: 0.8, fillStyle: 'hachure' });
  });
});

describe('interactive examples', () => {
  it.each(examples)('$category: $name has executable playground code', (example) => {
    const output = executeExample(editorCode(example));
    expect(output).not.toMatch(/NaN|Infinity|undefined/);
    expect(output).toMatch(/<(svg|button|fieldset|div|details|label)/);
  });
  it('makes every visible card a single link without nested code controls', () => {
    galleryState.category = 'charts';
    galleryState.page = 0;
    const html = gallery();
    expect(html.match(/<a class="example-card" href="\/playground\/charts\//g)).toHaveLength(12);
    expect(html).not.toContain('<article class="example-card">');
    expect(html).toContain('inert aria-hidden="true"');
  });
  it('reports invalid code and missing render calls', () => {
    expect(() => executeExample('const =')).toThrow();
    expect(() => executeExample('const value=1;')).toThrow('Call render');
    expect(() => executeExample('render(42)')).toThrow('expects SVG');
    expect(() => executeExample("import { missing } from '@borrowdale/core';")).toThrow('Unknown import');
  });
  it('keeps dashboards chart-based, with each table only as a collapsed data view of a chart', () => {
    const html = worldDashboard() + climateDashboard() + quakeDashboard();
    expect(html.match(/<table/g)).toHaveLength(
      html.match(/<details class="dashboard-code dashboard-data">/g)!.length,
    );
    expect(html.match(/<table/g)).toHaveLength(html.match(/class="chart-view"/g)!.length);
  });
});

it.each(
  Array.from({ length: 15 }, (_, i) => 2010 + i).flatMap((year) =>
    worldAt(year).map((row) => ({ year, country: row.code })),
  ),
)('world dashboard renders $country in $year', ({ year, country }) => {
  dashboardState.year = year;
  dashboardState.country = country;
  expect(worldDashboard()).not.toMatch(/NaN|Infinity|render-error/);
});
