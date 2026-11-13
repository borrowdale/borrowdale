import { describe, expect, it } from 'vitest';
import type { ChartSpec } from '@borrowdale/charts';
import { dataRows } from '../src/data-table';

const chart = (series: object[]) => ({ width: 300, height: 200, series }) as ChartSpec;

describe('data rows of the proportion charts', () => {
  it('list each category of a unit chart and each stage of a funnel', () => {
    expect(dataRows(chart([{ type: 'units', name: 'Seats', display: 'waffle', data: [{ name: 'Left', value: 37 }, { name: 'Right', value: 63 }] }])))
      .toEqual([['Seats', 'Left', '37'], ['Seats', 'Right', '63']]);
    expect(dataRows(chart([{ type: 'funnel', name: 'Sales', display: 'funnel', data: [{ name: 'Visits', value: 1000 }, { name: 'Sales', value: 120 }] }])))
      .toEqual([['Sales', 'Visits', '1,000'], ['Sales', 'Sales', '120']]);
  });

  it('list the parts a pie breaks out after its slices', () => {
    const pie = { type: 'pie', name: 'Sales', data: [{ name: 'Europe', value: 3 }, { name: 'Asia', value: 1 }], breakout: { slice: 'Europe', data: [{ name: 'France', value: 2 }, { name: 'Other', value: 1 }] } };

    expect(dataRows(chart([pie]))).toEqual([['Sales', 'Europe', '3'], ['Sales', 'Asia', '1'], ['Sales', 'France', '2'], ['Sales', 'Other', '1']]);
  });

  it('give a liquid fill its level as a percentage', () => {
    expect(dataRows(chart([{ type: 'liquid', name: 'Tank', value: 0.456 }]))).toEqual([['Tank', '', '45.6%']]);
  });

  it('give a Venn diagram a row per set and per overlap, naming its sets', () => {
    const venn = { type: 'venn', name: 'Readers', data: [{ sets: ['Post'], value: 1200 }, { sets: ['Star'], value: 800 }, { sets: ['Post', 'Star'], value: 300 }] };
    expect(dataRows(chart([venn]))).toEqual([['Readers', 'Post', '1,200'], ['Readers', 'Star', '800'], ['Readers', 'Post ∩ Star', '300']]);
  });

  it('give a hierarchy a row per leaf, named by its path below the root', () => {
    const tree = { name: 'All', children: [{ name: 'Fossil', children: [{ name: 'Coal', value: 1300 }] }, { name: 'Nuclear', value: 40 }] };
    expect(dataRows(chart([{ type: 'hierarchy', name: 'Energy', display: 'treemap', data: tree }]))).toEqual([['Energy', 'Fossil › Coal', '1,300'], ['Energy', 'Nuclear', '40']]);
  });
});

// Rows that hold events, ranges, dates or categories rather than numbers write them as they are.
describe('data rows of events, ranges, cells and dates', () => {
  it('list each event of a timeline by its label, else its number, with its extent', () => {
    const plan = { type: 'timeline', name: 'Plan', data: [{ from: '2026-01-01', to: '2026-02-01', label: 'Build' }, { from: 3 }] };

    expect(dataRows(chart([plan]))).toEqual([['Plan', 'Build', '2026-01-01 – 2026-02-01'], ['Plan', '2', '3']]);
  });

  it('list each item of an x-range in its row, with its extent', () => {
    const tasks = { type: 'xRange', name: 'Tasks', data: [{ row: 'Design', from: 1, to: 2.5 }, { row: 'Launch', from: 4 }] };

    expect(dataRows(chart([tasks]))).toEqual([['Tasks', 'Design', '1 – 2.5'], ['Tasks', 'Launch', '4']]);
  });

  it('list each cell of a heatmap by its place, a stretch written as its ends', () => {
    const cells = { type: 'heatmap', name: 'Load', data: [['Mon', 'AM', 3], [[0, 10], 'PM', null]] };

    expect(dataRows(chart([cells]))).toEqual([['Load', 'Mon, AM', '3'], ['Load', '0 – 10, PM', 'No data']]);
  });

  // A gap has no x: naming it by its place in the data would put it at an x the row does not have.
  it('list each point of a horizon row by its x, as its band axis lists rows, and a gap by none', () => {
    const load = { width: 300, height: 200, axes: { x: { type: 'linear' }, y: { type: 'band', categories: ['CPU', 'Memory'] } },
      series: [{ type: 'horizon', name: 'Load', row: 'CPU', data: [[2000, 5], null, [2010, -2]] }] } as ChartSpec;

    expect(dataRows(load)).toEqual([['Load', '2,000', '5'], ['Load', '', 'No data'], ['Load', '2,010', '-2']]);
  });

  it('list each cell of a polar heatmap by its angle and radius', () => {
    const visits = { width: 300, height: 200, axes: { angle: { type: 'band', categories: ['Mon', 'Tue'] }, radius: { type: 'band', categories: ['9am', '10am'] } },
      series: [{ type: 'polarHeatmap', name: 'Visits', data: [['Tue', '9am', 5], ['Mon', '10am', null]] }] } as ChartSpec;

    expect(dataRows(visits)).toEqual([['Visits', 'Tue, 9am', '5'], ['Visits', 'Mon, 10am', 'No data']]);
  });

  it('write the date of a calendar day as given', () => {
    const steps = { type: 'calendar', name: 'Steps', data: [['2026-01-05', 4200]] };

    expect(dataRows(chart([steps]))).toEqual([['Steps', '1', '2026-01-05 · 4,200']]);
  });
});
