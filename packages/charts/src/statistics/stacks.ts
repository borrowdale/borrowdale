import type { SeriesOf } from '../validate.js';
import { stackDensities } from './density-stack.js';
import { checkHistogramStacks } from './histogram.js';

/** Checks and builds the stacks of statistical series, once every series of the chart is read. */
export function stackStatistics(series: readonly SeriesOf<'cartesian'>[], reserve: (count: number) => void): void {
  checkHistogramStacks(series.filter((entry) => entry.type === 'histogram'));
  stackDensities(series.filter((entry) => entry.type === 'distribution'), reserve);
}
