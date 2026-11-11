import type { ChartSpec, HistogramSeries, RelationshipSeries } from '@borrowdale/charts';
import { escape } from './drawing';

type FitMethod = NonNullable<Extract<RelationshipSeries, { display: 'regression' }>['method']>;
// How a data view names each fit; a new method fails to compile until it has a name here.
const fitNames: Record<FitMethod, string> = {
  linear: 'Linear',
  polynomial: 'Polynomial',
  exponential: 'Exponential',
  logarithmic: 'Logarithmic',
  loess: 'LOESS',
};
// The fields of a chart axis a data view reads, whichever kind of axis it is.
type AxisFields = { type?: string; categories?: readonly string[]; format?: { thousandsSeparator?: string } };
const axesOf = (spec: ChartSpec) =>
  Object.values((spec as unknown as { axes?: Record<string, AxisFields> }).axes ?? {});
// The categories a series of plain values is drawn against, from whichever axis is the band axis.
function categoriesOf(spec: ChartSpec): readonly string[] {
  return axesOf(spec).find((axis) => axis.type === 'band')?.categories ?? [];
}
// One row per bin, with the height the chart draws. The counting follows the rule in the
// "Histograms" section of the charts package README: each bin holds its left edge, and the last bin
// its right edge too. Change the two together.
function histogramRows(
  { name, edges, data, frequency, cumulative }: HistogramSeries,
  format: (value: number) => string,
) {
  let height = 0;
  return edges.slice(1).map((end, i) => {
    const start = edges[i]!;
    const count = data.filter((v) => v >= start && (v < end || (i === edges.length - 2 && v === end))).length;
    height = cumulative ? height + count : count;
    const value = frequency === 'relative' && data.length ? height / data.length : height;
    return [name, `${format(start)}–${format(end)}`, format(value)];
  });
}
// One row per drawn value, so the numbers behind a chart can be read without seeing it. A histogram
// gets one row per bin instead of one per sample, a sample one row per observation, and a fitted
// curve one row naming its fit, as the observations it was fitted to have their own rows. A chart
// whose axes drop the thousands separator, as a year axis does, has none in its table either.
export function dataRows(spec: ChartSpec) {
  const categories = categoriesOf(spec);
  const useGrouping = axesOf(spec).every((axis) => axis.format?.thousandsSeparator !== '');
  const format = new Intl.NumberFormat('en', { maximumFractionDigits: 2, useGrouping }).format;
  return spec.series.flatMap((series) => {
    if (series.type === 'gauge') return [[series.name, '', format(series.value)]];
    if (series.type === 'histogram') return histogramRows(series, format);
    if (series.type === 'distribution')
      return series.data.map((value, i) => [series.name, `Sample ${i + 1}`, format(value)]);
    if (series.type === 'relationship' && series.display === 'regression')
      return [[series.name, '', `${fitNames[series.method ?? 'linear']} fit to ${series.data.length} observations`]];
    if (series.type === 'pie')
      return series.data.map((slice) => [series.name, slice.name, format(slice.value)]);
    return (series.data as readonly (number | null | readonly number[])[]).map((value, i) => [
      series.name,
      categories[i] ?? String(i + 1),
      value === null ? 'No data' : typeof value === 'number' ? format(value) : value.map(format).join(' · '),
    ]);
  });
}
// A chart's numbers as a collapsed table beside it.
export function dataTable(title: string, spec: ChartSpec) {
  const rows = dataRows(spec)
    .map(
      ([series, point, value]) =>
        `<tr><th scope="row">${escape(series)}</th><td>${escape(point)}</td><td>${escape(value)}</td></tr>`,
    )
    .join('');
  return `<details class="dashboard-code dashboard-data"><summary>View data</summary><div class="table-scroll"><table><caption class="visually-hidden">${escape(title)} data</caption><thead><tr><th scope="col">Series</th><th scope="col">Point</th><th scope="col">Value</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}
