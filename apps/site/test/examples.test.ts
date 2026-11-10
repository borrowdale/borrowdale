import statisticalCases from '../../examples/statistical-cases.json';
import { afterEach, describe, it, expect } from 'vitest';
import { examples, categories, gallery, galleryState, chartExamples } from '../src/gallery';
import { editorCode } from '../src/editor';
import { pageHtml } from '../src/pages';
import { executeExample } from '../src/playground-runtime';
import { worldAt, countryValue, world, climate, quakes, median, dailyCounts } from '../src/data';
import { dashboardState, worldDashboard, climateDashboard, quakeDashboard } from '../src/dashboards';
import { chart, chartSpec, reseed } from '../src/drawing';
import cartesianCases from '../../examples/cartesian-cases.json';
import timeCases from '../../examples/time-cases.json';
import type { ChartSpec } from '@borrowdale/charts';

// The gallery's chart examples with a name, and the spec the gallery holds under it.
const galleryCharts = (name: string) =>
  examples.filter((example) => example.category === 'charts' && example.name === name);
const gallerySpec = (name: string) => chartExamples.find((example) => example.name === name)?.spec;

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

  it('has time examples to check', () => {
    expect(timeCases.length).toBeGreaterThan(0);
  });

  it.each([...timeCases, ...statisticalCases])('includes the $name composition in the editable gallery', ({ name, spec }) => {
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
        'gauge',
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
        'polarLine',
        'polarScatter',
        'radar',
        'radialBar',
        'rangeArea',
        'rose',
        'scatter',
        'timeline',
        'xRange',
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
