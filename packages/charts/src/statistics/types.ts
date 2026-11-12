import { fail, SERIES_FIELDS, show, type Check, type Fields } from '../read.js';
import type { SeriesBase, SymbolName } from '../types.js';

/**
 * One option table drives both the public discriminated union and JSON validation: each key is a
 * value of the discriminant, listing the options it accepts. A misspelt option fails to compile.
 */
export type Choices<Key extends string, Options, Table extends Record<string, readonly (keyof Options)[]>> = {
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
  /** Where the group stands on the group axis, in that axis' data units. Defaults to 0. */
  position?: number | undefined;
  /** Exchange the axes, so the group stands on y and the values run along x. */
  horizontal?: boolean | undefined;
  /**
   * Tukey whiskers (the default) reach the outermost samples within 1.5 IQR of the box, and never end
   * inside it; `min-max` whiskers reach the lowest and highest samples.
   */
  whiskers?: 'tukey' | 'min-max' | undefined;
  /** Draw every sample as a dot. */
  points?: boolean | undefined;
  /**
   * The kernel density bandwidth, positive, in data units. Defaults to 1.06 times the sample standard
   * deviation times the sample count to the power -0.2, or for a constant sample the larger of 1 and
   * one percent of its absolute value.
   */
  bandwidth?: number | undefined;
  /** Stack density series with the same stack name, in order. */
  stack?: string | undefined;
  /** Stack to both sides of the position (the default), or to one side when false. */
  mirrored?: boolean | undefined;
  /** One marker diameter per observation, 1 to 40 drawing units. Markers are 7 units by default. */
  sizes?: readonly number[] | undefined;
  /** The marker: a circle on a swarm and a star on an isotype by default. */
  symbol?: SymbolName | undefined;
  /** The span of values each stack groups, in data units. Defaults to 1. */
  binWidth?: number | undefined;
}

export const DISTRIBUTIONS = {
  ecdf: [],
  box: ['position', 'horizontal', 'whiskers', 'points'],
  violin: ['position', 'horizontal', 'points', 'bandwidth'],
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
  /** A polynomial's degree, an integer from 1 to 5. Defaults to 2. */
  degree?: number | undefined;
  /** The fraction of observations each LOESS fit uses, 0.05 to 1. Defaults to 0.5. */
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
  /**
   * A cell's width in x data units: a rectangle's side, or a hexagon from vertex to vertex. Defaults
   * to 1.
   */
  binWidth?: number | undefined;
  /**
   * A cell's height in y data units: a rectangle's side, or a hexagon from flat side to flat side.
   * Defaults to `binWidth`.
   */
  binHeight?: number | undefined;
  /** One point estimate per interval, each within its interval. */
  estimates: readonly number[];
  /** The positive alert limit that, with the diagonal, bounds the integrity regions. */
  alertLimit: number;
  /** The fitted curve. Defaults to linear. */
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
  /** The trailing window, 1 to 1,000 sessions (default 20), or price changes for RSI (default 14). */
  period?: number | undefined;
  /** The positive price step of each box. */
  boxSize: number;
  /** The boxes a point-and-figure reversal takes, 1 to 100. Defaults to 3. */
  reversal?: number | undefined;
  /** Outline rising candles; falling candles are filled. Defaults to true. */
  hollow?: boolean | undefined;
  /** Up to 100 labels, each on the session at `index`, of at most 100 characters. */
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
  /**
   * Strictly increasing bin edges, including both outer limits, each one the x axis' `format` writes
   * exactly, as the bins' tooltips state them.
   */
  edges: readonly number[];
  /** Every sample must fall within the outer edges. An interior edge starts a bin. */
  data: readonly number[];
  /** Relative frequency divides by this series' sample count. */
  frequency?: 'count' | 'relative' | undefined;
  /** Accumulate the frequencies through each successive bin. */
  cumulative?: boolean | undefined;
}
