import type { SeriesBase, MarkerSymbol } from '../types.js';
import { SERIES_FIELDS, fail, show, type Fields } from '../read.js';

/** The same option table drives both the public discriminated union and JSON validation. */
type Displays<Table, Options> = {
  [Mode in keyof Table]: { display: Mode } & Pick<
    Options,
    Extract<Table[Mode] extends readonly (infer Key)[] ? Key : never, keyof Options>
  >;
}[keyof Table];

export function readDisplay<const T extends Record<string, readonly string[]>>(
  r: Fields,
  table: T,
): keyof T & string {
  const display = r.required('display', (path, value) => {
    if (typeof value !== 'string' || !Object.hasOwn(table, value))
      fail(path, `must be one of ${Object.keys(table).join(', ')}, got ${show(value)}`);
    return value as keyof T & string;
  });
  r.allow([...SERIES_FIELDS, 'display', 'data', ...table[display]!]);
  return display;
}

/** Every display and method is handled: a key added to a table without its branch fails to compile. */
export function unhandled(value: never): never {
  throw new Error(`Unhandled statistical option ${String(value)}`);
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
} as const;

export const RELATIONSHIPS = {
  histogram2d: ['binWidth', 'binHeight'],
  hexbin: ['binWidth', 'binHeight'],
  stanford: ['binWidth', 'binHeight', 'alertLimit'],
  regression: ['method', 'degree', 'span'],
  qq: [],
  forest: ['estimates'],
} as const;

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
} as const;

interface DistributionOptions {
  position?: number;
  horizontal?: boolean;
  whiskers?: 'tukey' | 'minmax';
  points?: boolean;
  bandwidth?: number;
  stack?: string;
  polar?: boolean;
  mirrored?: boolean;
  sizes?: readonly number[];
  symbol?: MarkerSymbol;
  binWidth?: number;
}
export type DistributionSeries = SeriesBase & { type: 'distribution'; data: readonly number[] } & Displays<
    typeof DISTRIBUTIONS,
    DistributionOptions
  >;
export const REGRESSION_METHODS = ['linear', 'polynomial', 'exponential', 'logarithmic', 'loess'] as const;
export type RegressionMethod = (typeof REGRESSION_METHODS)[number];
type Regression =
  | { method?: Exclude<RegressionMethod, 'polynomial' | 'loess'> }
  | { method: 'polynomial'; degree?: number }
  | { method: 'loess'; span?: number };
export type RelationshipSeries = SeriesBase & {
  type: 'relationship';
  data: readonly (readonly [number, number])[];
} & (
    | Displays<
        Omit<typeof RELATIONSHIPS, 'regression'>,
        { binWidth?: number; binHeight?: number; estimates: readonly number[]; alertLimit: number }
      >
    | ({ display: 'regression' } & Regression)
  );
type PriceBar = readonly [open: number, high: number, low: number, close: number];
export const CANDLE_DISPLAYS = ['candlestick', 'heikinAshi', 'ohlc', 'hlc'] as const;
export type Candle = (typeof CANDLE_DISPLAYS)[number];
interface MarketOptions {
  period?: number;
  boxSize: number;
  reversal?: number;
  /** Outline rising candles; falling candles are filled. Defaults to true. */
  hollow?: boolean;
  flags?: readonly { index: number; label: string }[];
}
export type MarketSeries = SeriesBase & { type: 'market' } & (
    | ({ data: readonly PriceBar[] } & Displays<Pick<typeof MARKET_DISPLAYS, Candle>, MarketOptions>)
    | ({ data: readonly (number | PriceBar)[] } & Displays<Omit<typeof MARKET_DISPLAYS, Candle>, MarketOptions>)
  );
