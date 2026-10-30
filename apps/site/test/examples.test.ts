import { describe, it, expect } from 'vitest';
import { examples, categories, gallery, galleryState } from '../src/gallery';
import { editorCode } from '../src/editor';
import { executeExample } from '../src/playground-runtime';
import { worldAt, countryValue, world, climate, quakes, median, dailyCounts } from '../src/data';
import { dashboardState, worldDashboard, climateDashboard, quakeDashboard } from '../src/dashboards';
import { chartSpec } from '../src/drawing';

describe('gallery coverage and actual rendering', () => {
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
        'line',
        'pie',
        'polarArea',
        'polarLine',
        'polarScatter',
        'radar',
        'radialBar',
        'rangeArea',
        'rose',
        'scatter',
      ].sort(),
    );
    expect([...new Set(examples.filter((x) => x.category === 'shapes').map((x) => x.tag))].sort()).toEqual(
      ['arc', 'circle', 'curve', 'ellipse', 'line', 'linearPath', 'path', 'polygon', 'rectangle'].sort(),
    );
    expect([...new Set(examples.filter((x) => x.category === 'patterns').map((x) => x.tag))].sort()).toEqual([
      'circles',
      'crosshatch',
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
    expect(html.match(/<a class="example-card" href="#example\/charts\//g)).toHaveLength(12);
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
    expect(html.match(/<table/g)).toHaveLength(html.match(/<details class="dashboard-code dashboard-data">/g)!.length);
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
  expect(() => worldDashboard()).not.toThrow();
});
