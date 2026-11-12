// The weights of a Marimekko chart's band axis, `weights: "stacks"`: each column as wide as its stack.
import { MIN_WEIGHT, type CheckedBandAxis, type CheckedLinearAxis } from './check-axis.js';
import { aSeries, fail, show } from './read.js';
import { stackTotal } from './stack.js';
import type { SeriesOf } from './validate.js';

/**
 * The weights `weights: "stacks"` asks for: each category of `band` as wide as the total of its stack,
 * as a share of the largest. Every series must be a bar of one stack, shown as shares of its total on
 * a linear percent axis, so that each column's area is in proportion to the part it shows.
 */
export function stackWeights(series: readonly SeriesOf<'cartesian'>[], band: CheckedBandAxis, value: CheckedLinearAxis, path: string): number[] {
  const bars = series.map((entry) =>
    entry.type === 'bar' ? entry : fail(path, `is "stacks", which needs every series to be a bar, but ${entry.path} is ${aSeries(entry.type)}`));
  const first = bars[0]!;
  for (const bar of bars) {
    const apart = bar.stack === undefined ? 'has no stack'
      : bar.stack !== first.stack ? `stacks in ${show(bar.stack)}, and ${first.path} in ${show(first.stack)}`
      : bar.axis !== first.axis ? `is on ${bar.axis}, and ${first.path} on ${first.axis}`
      : undefined;
    if (apart) fail(path, `is "stacks", which needs every bar in one stack, but ${bar.path} ${apart}`);
  }
  if (!value.percent) {
    // Only a linear axis takes percent.
    const fix = value.kind === 'linear' ? `set percent on ${value.path}` : `${value.path} is ${value.kind}: make it linear, with percent`;
    fail(path, `is "stacks", which needs the stacks shown as shares: ${fix}`);
  }
  const totals = stackTotal(bars);
  const largest = Math.max(...totals);
  return totals.map((total, i) => {
    const weight = total / largest;
    if (weight >= MIN_WEIGHT) return weight;
    const why = largest === 0 ? 'as every stack does' : `less than a millionth of the largest, ${largest}`;
    return fail(path, `is "stacks", but the stack of ${show(band.categories[i])} totals ${total}, ${why}`);
  });
}
