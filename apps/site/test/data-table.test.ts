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
});
