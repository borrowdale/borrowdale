// A funnel chart: named stages in turn, as a funnel, a pyramid, the bands of a funnel area, or the
// bands of a silhouette.
import { Budget } from '@borrowdale/core';
import { fitPath } from '@borrowdale/core/internal';
import { checkNameColors, readNamedValues } from './named-values.js';
import { boolean, fail, oneOf, probe, shortText, show, type Fields } from './read.js';
import { readDisplay, type Choices } from './statistics/types.js';
import type { SeriesBase } from './types.js';
import type { CheckedChartBase, SeriesOf } from './validate.js';

/** The longest silhouette, in characters of path data. */
const MAX_PATH = 10_000;
// Work enough to read any silhouette that long, before the chart's drawing budget exists.
const PATH_WORK = 200_000;

interface FunnelOptions {
  /**
   * How a funnel's stages narrow: `trapezoid` slopes each stage from its width to the next one's (the
   * default), `bar` keeps each stage straight, and `smooth` curves between them.
   */
  shape?: 'trapezoid' | 'bar' | 'smooth' | undefined;
  /** Which way the stages run: `vertical`, from top to bottom (the default), or `horizontal`, from left to right. */
  orientation?: 'vertical' | 'horizontal' | undefined;
  /** Writes each stage's name and value on it. Labels can overlap on thin stages. */
  dataLabels?: boolean | undefined;
  /**
   * The silhouette a `pictorialStacked` series fills, as SVG path data of at most 10,000 characters.
   * It is scaled to fit the chart, keeping its proportions.
   */
  silhouette?: string | undefined;
}

/** The options each display takes. */
export const FUNNEL_DISPLAYS = {
  funnel: ['shape', 'orientation', 'dataLabels'],
  pyramid: ['orientation', 'dataLabels'],
  funnelArea: ['orientation', 'dataLabels'],
  pictorialStacked: ['silhouette', 'orientation', 'dataLabels'],
} as const satisfies Record<string, readonly (keyof FunnelOptions)[]>;

export interface FunnelStage {
  /** At most 100 characters, unique in the series: the stage's legend entry. */
  name: string;
  /** 0 to 1e15. */
  value: number;
  color?: string | undefined;
}

/**
 * Stages in order, the first at the top, or at the left when `horizontal`. `display` picks the
 * drawing: a `funnel` of stages of equal depth, each as wide as its value; a `pyramid` whose stages'
 * areas are in proportion to their values; a `funnelArea`, the same in a trapezoid a third as wide at
 * its foot; or `pictorialStacked`, the bands of a silhouette, each as deep as its value. Two funnel
 * displays with the same stages stand back to back.
 */
export type FunnelSeries = SeriesBase & { type: 'funnel'; data: readonly FunnelStage[] } & Choices<
    'display',
    FunnelOptions,
    typeof FUNNEL_DISPLAYS
  >;

export interface CheckedFunnelChart extends CheckedChartBase {
  system: 'funnel';
  series: SeriesOf<'funnel'>[];
}

export function readFunnel(r: Fields, path: string, reserve: (count: number) => void) {
  const display = readDisplay(r, FUNNEL_DISPLAYS);
  const data = readNamedValues(r, path, reserve, [], () => ({}));
  const silhouette = display === 'pictorialStacked' ? r.required('silhouette', shortText(MAX_PATH)) : undefined;
  if (silhouette !== undefined) {
    probe(`${path}.silhouette`, () => fitPath(silhouette, { x: 0, y: 0, width: 1, height: 1 }, new Budget(PATH_WORK)));
  }
  return {
    display,
    data,
    shape: r.optional('shape', oneOf(['trapezoid', 'bar', 'smooth'] as const)) ?? 'trapezoid',
    orientation: r.optional('orientation', oneOf(['vertical', 'horizontal'] as const)) ?? 'vertical',
    // Whether the spec gave it: the check that funnels back to back run alike names only one given.
    orientationGiven: r.has('orientation'),
    dataLabels: r.optional('dataLabels', boolean) ?? false,
    silhouette,
  };
}

export function checkFunnelChart(r: Fields, base: CheckedChartBase, series: SeriesOf<'funnel'>[]): CheckedFunnelChart {
  if (r.has('axes')) fail('axes', 'must be left out: a funnel chart has no axes');
  if (series.length > 2) {
    fail('series', `of a funnel chart must be one funnel series, or two funnels back to back, got ${series.length}`);
  }
  const [first, second] = series as [SeriesOf<'funnel'>, SeriesOf<'funnel'> | undefined];
  if (second) {
    for (const entry of series) {
      if (entry.display !== 'funnel') fail(`${entry.path}.display`, `is ${entry.display}, but only funnel displays stand back to back`);
    }
    if (second.orientation !== first.orientation) {
      const [given, other] = second.orientationGiven ? [second, first] : [first, second];
      const theirs = other.orientationGiven ? `${other.path}.orientation is ${other.orientation}` : `${other.path} has the default, ${other.orientation}`;
      fail(`${given.path}.orientation`, `is ${given.orientation}, but ${theirs}: funnels back to back run the same way`);
    }
    if (second.data.length !== first.data.length) {
      fail(`${second.path}.data`, `has ${second.data.length} stages, but ${first.path}.data has ${first.data.length}: funnels back to back share their stages`);
    }
    second.data.forEach((item, i) => {
      const theirs = first.data[i]!.name;
      if (item.name !== theirs) {
        fail(`${second.path}.data[${i}].name`, `is ${show(item.name)}, but ${first.path}.data[${i}].name is ${show(theirs)}: funnels back to back share their stages, in order`);
      }
    });
  }
  checkNameColors(series);
  return { ...base, system: 'funnel', series };
}
