// A liquid fill: one level, from empty to full, as liquid in a container under a wave.
import { fail, integer, number, oneOf, type Fields } from './read.js';
import type { SeriesBase } from './types.js';
import type { CheckedChartBase, SeriesOf } from './validate.js';

/** A level as liquid in a container, its surface a wave, the level written in the middle as a percentage. */
export interface LiquidSeries extends SeriesBase {
  type: 'liquid';
  /** The level, from 0 (empty) to 1 (full). */
  value: number;
  /** The container: a `circle` (the default), or a `rectangle` filling the chart. */
  shape?: 'circle' | 'rectangle' | undefined;
  /** Wave crests across the container, 1 to 5. Defaults to 2. */
  waves?: number | undefined;
}

/** The most wave crests across a container. */
export const MAX_WAVES = 5;

export interface CheckedLiquidChart extends CheckedChartBase {
  system: 'liquid';
  series: SeriesOf<'liquid'>[];
}

export function readLiquid(r: Fields) {
  return {
    value: r.required('value', number(0, 1)),
    shape: r.optional('shape', oneOf(['circle', 'rectangle'] as const)) ?? 'circle',
    waves: r.optional('waves', integer(1, MAX_WAVES)) ?? 2,
  };
}

export function checkLiquidChart(r: Fields, base: CheckedChartBase, series: SeriesOf<'liquid'>[]): CheckedLiquidChart {
  if (r.has('axes')) fail('axes', 'must be left out: a liquid fill has no axes');
  if (series.length > 1) fail('series', `of a liquid fill must be one liquid series, got ${series.length}`);
  return { ...base, system: 'liquid', series };
}
