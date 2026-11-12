import type { CellPlace, ChartSpec, ChartValue, HistogramSeries, RelationshipSeries } from '@borrowdale/charts';
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
  return spec.series.flatMap((series) => seriesRows(series, categories, format));
}
// The rows of one series; a new series type fails to compile until it has its rows here.
function seriesRows(series: ChartSpec['series'][number], categories: readonly string[], format: (value: number) => string): string[][] {
  const named = (items: readonly { name: string; value: number }[]) => items.map((item) => [series.name, item.name, format(item.value)]);
  switch (series.type) {
    case 'gauge':
      return [[series.name, '', format(series.value)]];
    case 'liquid':
      return [[series.name, '', `${format(series.value * 100)}%`]];
    case 'histogram':
      return histogramRows(series, format);
    case 'distribution':
      return series.data.map((value, i) => [series.name, `Sample ${i + 1}`, format(value)]);
    case 'pie':
      return named([...series.data, ...(series.breakout?.data ?? [])]);
    case 'units':
    case 'funnel':
      return named(series.data);
    case 'relationship':
      if (series.display === 'regression') {
        return [[series.name, '', `${fitNames[series.method ?? 'linear']} fit to ${series.data.length} observations`]];
      }
      return plainRows(series.name, series.data, categories, format);
    case 'timeline':
      return series.data.map((event, i) => [series.name, event.label ?? String(i + 1), span(event, format)]);
    case 'xRange':
      return series.data.map((item) => [series.name, item.row, span(item, format)]);
    case 'heatmap':
      return series.data.map(([x, y, value]) => [series.name, `${place(x, format)}, ${place(y, format)}`, written(value, format)]);
    case 'polarHeatmap':
      return series.data.map(([angle, radius, value]) => [series.name, `${angle}, ${radius}`, written(value, format)]);
    case 'horizon':
      // Its band axis lists the rows, so each point is named by its x.
      return series.data.map((point, i) => (point === null ? [series.name, String(i + 1), 'No data'] : [series.name, written(point[0], format), written(point[1], format)]));
    case 'bar':
    case 'line':
    case 'area':
    case 'rangeArea':
    case 'interval':
    case 'market':
    case 'xyLine':
    case 'xyArea':
    case 'scatter':
    case 'bubble':
    case 'radar':
    case 'rose':
    case 'radialBar':
    case 'polarLine':
    case 'polarArea':
    case 'polarScatter':
    case 'calendar':
      return plainRows(series.name, series.data, categories, format);
    default:
      return unknownSeries(series);
  }
}
type Cell = ChartValue | null;
// A value as the table writes it: a number formatted, a date or category as given.
function written(value: Cell, format: (value: number) => string): string {
  return value === null ? 'No data' : typeof value === 'number' ? format(value) : value;
}
// An event's or an item's extent: where it starts, and where it ends when it has an end.
function span({ from, to }: { from: ChartValue; to?: ChartValue | undefined }, format: (value: number) => string): string {
  return to === undefined ? written(from, format) : `${written(from, format)} – ${written(to, format)}`;
}
// A cell's place on an axis: a category, a hexagon's column or row, or a stretch from one value to
// another.
function place(at: ChartValue | CellPlace, format: (value: number) => string): string {
  return typeof at === 'object' ? span({ from: at[0], to: at[1] }, format) : written(at, format);
}
// One row per value, against the band axis' category where there is one.
function plainRows(name: string, data: readonly (Cell | readonly Cell[])[], categories: readonly string[], format: (value: number) => string) {
  return data.map((value, i) => [
    name,
    categories[i] ?? String(i + 1),
    typeof value === 'object' && value !== null ? value.map((cell) => written(cell, format)).join(' · ') : written(value, format),
  ]);
}
function unknownSeries(series: never): never {
  throw new Error(`Unknown series type: ${String((series as { type?: unknown }).type)}`);
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
