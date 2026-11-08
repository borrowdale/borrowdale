import { fail, SERIES_FIELDS, show, type Check, type Fields } from '../read.js';
import type { MarkerSymbol, SeriesBase } from '../types.js';

/**
 * One option table drives both the public discriminated union and JSON validation: each key is a
 * value of the discriminant, listing the options it accepts. A misspelt option fails to compile.
 */
type Choices<Key extends string, Options, Table extends Record<string, readonly (keyof Options)[]>> = {
  [Choice in keyof Table]: { [K in Key]: Choice } & Pick<Options, Table[Choice][number]>;
}[keyof Table];

/** Checks that a value names an entry of `table`. */
export function keyOf<const T extends Record<string, readonly string[]>>(table: T): Check<keyof T & string> {
  return (path, value) => {
    if (typeof value !== 'string' || !Object.hasOwn(table, value)) {
      fail(path, `must be one of ${Object.keys(table).join(', ')}, got ${show(value)}`);
    }
    return value as keyof T & string;
  };
}

export function readDisplay<const T extends Record<string, readonly string[]>>(
  r: Fields,
  table: T,
): keyof T & string {
  const display = r.required('display', keyOf(table));
  r.allow([...SERIES_FIELDS, 'display', 'data', ...table[display]!]);
  return display;
}

/** Every key a series of these displays may carry; `readDisplay` then narrows them per display. */
export function displayKeys(table: Record<string, readonly string[]>): string[] {
  return ['display', 'data', ...new Set(Object.values(table).flat())];
}

/** Every display and method is handled: a key added to a table without its branch fails to compile. */
export function unhandled(value: never): never {
  throw new Error(`Unhandled statistical option ${String(value)}`);
}

interface DistributionOptions {
  position?: number | undefined;
  horizontal?: boolean | undefined;
  whiskers?: 'tukey' | 'minmax' | undefined;
  points?: boolean | undefined;
  bandwidth?: number | undefined;
  stack?: string | undefined;
  polar?: boolean | undefined;
  mirrored?: boolean | undefined;
  sizes?: readonly number[] | undefined;
  symbol?: MarkerSymbol | undefined;
  binWidth?: number | undefined;
}

export const DISTRIBUTIONS = {
  ecdf: [],
  box: ['position', 'horizontal', 'whiskers', 'points'],
  violin: ['position', 'horizontal', 'points', 'bandwidth', 'polar'],
  raincloud: ['position', 'horizontal', 'bandwidth', 'whiskers'],
  density: ['bandwidth', 'stack'],
  ridge: ['position', 'bandwidth'],
  normal: [],
  normalQQ: [],
  swarm: ['position', 'horizontal', 'mirrored', 'sizes', 'symbol'],
  dotPlot: ['position', 'horizontal', 'mirrored', 'binWidth'],
  isotype: ['position', 'horizontal', 'mirrored', 'binWidth', 'symbol'],
  stemLeaf: [],
} as const satisfies Record<string, readonly (keyof DistributionOptions)[]>;

export type DistributionSeries = SeriesBase & { type: 'distribution'; data: readonly number[] } & Choices<
    'display',
    DistributionOptions,
    typeof DISTRIBUTIONS
  >;

interface RegressionOptions {
  degree?: number | undefined;
  span?: number | undefined;
}

/** Regression methods and the options each accepts; a method left out is linear. */
export const REGRESSIONS = {
  linear: [],
  polynomial: ['degree'],
  exponential: [],
  logarithmic: [],
  loess: ['span'],
} as const satisfies Record<string, readonly (keyof RegressionOptions)[]>;

export type RegressionMethod = keyof typeof REGRESSIONS;

interface RelationshipOptions extends RegressionOptions {
  binWidth?: number | undefined;
  binHeight?: number | undefined;
  estimates: readonly number[];
  alertLimit: number;
  method?: RegressionMethod | undefined;
}

export const RELATIONSHIPS = {
  histogram2d: ['binWidth', 'binHeight'],
  hexbin: ['binWidth', 'binHeight'],
  stanford: ['binWidth', 'binHeight', 'alertLimit'],
  regression: ['method', 'degree', 'span'],
  qq: [],
  forest: ['estimates'],
} as const satisfies Record<string, readonly (keyof RelationshipOptions)[]>;

export type RelationshipSeries = SeriesBase & {
  type: 'relationship';
  data: readonly (readonly [number, number])[];
} & (
    | Choices<'display', RelationshipOptions, Omit<typeof RELATIONSHIPS, 'regression'>>
    | ({ display: 'regression' } & (Choices<'method', RegressionOptions, typeof REGRESSIONS> | { method?: undefined }))
  );

export type PriceBar = readonly [open: number, high: number, low: number, close: number];

interface MarketOptions {
  period?: number | undefined;
  boxSize: number;
  reversal?: number | undefined;
  /** Outline rising candles; falling candles are filled. Defaults to true. */
  hollow?: boolean | undefined;
  flags?: readonly { index: number; label: string }[] | undefined;
}

export const MARKET_DISPLAYS = {
  candlestick: ['hollow', 'flags'],
  ohlc: ['flags'],
  hlc: ['flags'],
  heikinAshi: ['hollow', 'flags'],
  renko: ['boxSize'],
  pointFigure: ['boxSize', 'reversal'],
  sma: ['period'],
  ema: ['period'],
  macd: [],
  rsi: ['period'],
  bollinger: ['period'],
  control: [],
} as const satisfies Record<string, readonly (keyof MarketOptions)[]>;

export const CANDLE_DISPLAYS = ['candlestick', 'heikinAshi', 'ohlc', 'hlc'] as const;

export type Candle = (typeof CANDLE_DISPLAYS)[number];

export type MarketSeries = SeriesBase & { type: 'market' } & (
    | ({ data: readonly PriceBar[] } & Choices<'display', MarketOptions, Pick<typeof MARKET_DISPLAYS, Candle>>)
    | ({ data: readonly (number | PriceBar)[] } & Choices<'display', MarketOptions, Omit<typeof MARKET_DISPLAYS, Candle>>)
  );

/** Counts numeric samples in adjacent intervals on linear x and y axes. */
export interface HistogramSeries extends SeriesBase {
  type: 'histogram';
  /** Stack series with matching edges and frequency options under the same name. */
  stack?: string | undefined;
  /** Strictly increasing bin edges, including both outer limits. */
  edges: readonly number[];
  /** Every sample must fall within the outer edges. An interior edge starts a bin. */
  data: readonly number[];
  /** Relative frequency divides by this series' sample count. */
  frequency?: 'count' | 'relative' | undefined;
  /** Accumulate the frequencies through each successive bin. */
  cumulative?: boolean | undefined;
}
