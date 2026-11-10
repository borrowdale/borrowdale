import type { Role } from '../palette.js';
import {
  boolean,
  fail,
  fields,
  integer,
  list,
  MAX_VALUE,
  number,
  text,
  tuple,
  type Check,
  type Fields,
} from '../read.js';
import { binGrid } from './bin-grid.js';
import {
  average,
  checkGeometry,
  deviation,
  dot,
  line,
  rect,
  valued,
  type Glyph,
  type XY,
} from './geometry.js';
import {
  CANDLE_DISPLAYS,
  MARKET_DISPLAYS,
  readDisplay,
  unhandled,
  type Candle,
  type PriceBar,
} from './types.js';

/** Half the width of a candle, an OHLC tick or a MACD histogram bar, in sessions. */
const HALF_BAR = 0.3;

/** The usual MACD periods: fast and slow exponential averages, and the signal line's. */
const FAST = 12;

const SLOW = 26;

const SIGNAL = 9;

/** For moving ranges of two observations, the mean range is d2 = 1.128 standard deviations. */
const D2 = 1.128;

const MAX_BOXES = 4_000;

// An exponential moving average over points at increasing x, starting at the first full window's
// mean. Each value keeps the x of the point it ends at.
function ema(points: readonly XY[], period: number): XY[] {
  if (points.length < period) return [];
  if (period === 1) return points.map(([x, price]) => [x, price]);
  let value = average(points.slice(0, period).map(([, price]) => price));
  const result: XY[] = [[points[period - 1]![0], value]];
  for (let i = period; i < points.length; i++) {
    value += ((points[i]![1] - value) * 2) / (period + 1);
    result.push([points[i]![0], value]);
  }
  return result;
}

/** The value of a series of consecutive sessions at session `x`. */
function at(series: readonly XY[], x: number): number {
  return series[x - series[0]![0]]![1];
}

function relativeStrength(prices: number[], period: number): XY[] {
  let gain = 0, loss = 0;
  const result: XY[] = [];
  for (let i = 1; i < prices.length; i++) {
    // RSI is a ratio. Exact binary scaling keeps even the smallest price changes
    // representable through the initial division; input prices are bounded by 1e15.
    const delta = (prices[i]! - prices[i - 1]!) * (2 ** 512);
    const up = Math.max(0, delta), down = Math.max(0, -delta);
    if (period === 1) {
      gain = up;
      loss = down;
    } else if (i <= period) {
      gain += up / period;
      loss += down / period;
    } else {
      gain += (up - gain) / period;
      loss += (down - loss) / period;
    }
    if (i >= period) result.push([i, gain + loss ? 100 * (gain / (gain + loss)) : 50]);
  }
  return result;
}

interface PriceBox {
  from: number;
  to: number;
  rising: boolean;
  /** The first box after the trend turned. */
  reversed: boolean;
}

// Walks the closes on a grid of `size` from the first close: each grid step crossed is a box. Turning
// needs `reversal` steps against the trend, and the first `gap` of them draw no box.
function priceBoxes(path: string, prices: readonly number[], size: number, reversal: number, gap: number): PriceBox[] {
  const grid = binGrid(prices[0]!, size);
  let level = 0, direction = 0;
  const boxes: PriceBox[] = [];
  for (const price of prices) {
    const sign = Math.sign(price - grid.edge(level));
    const steps = Math.abs(grid.index(price, sign > 0 ? 'floor' : 'ceil') - level);
    const reversing = direction !== 0 && direction !== sign;
    if (steps < (reversing ? reversal : 1)) continue;
    const skip = reversing ? gap : 0;
    if (boxes.length + steps - skip > MAX_BOXES) fail(path, `would draw more than ${MAX_BOXES} price boxes`);
    level += sign * skip;
    for (let step = skip; step < steps; step++) {
      const from = grid.edge(level);
      level += sign;
      const to = grid.edge(level);
      if (to === from) fail(path, 'needs a box size resolvable at the price coordinates');
      boxes.push({ from, to, rising: sign > 0, reversed: reversing && step === skip });
    }
    direction = sign;
  }
  return boxes;
}

// Renko: one brick per box, each in its own column, outlined when rising. A turn takes two boxes.
function renko(boxes: readonly PriceBox[]): Glyph[] {
  return boxes.map(({ from, to, rising }, column) => ({
    ...valued(rect('{0}', column, from, column + 1, to), [to]),
    hollow: rising,
  }));
}

// Point and figure: X for a rising box and O for a falling one, a new column at each turn.
function pointFigure(boxes: readonly PriceBox[]): Glyph[] {
  let column = 0;
  return boxes.map(({ to, rising, reversed }) => {
    if (reversed) column++;
    return { kind: 'valueText', label: rising ? 'X' : 'O', points: [[column, to]] };
  });
}

// Each bar's open is the midpoint of the previous transformed bar and its close the bar's mean;
// high and low stretch to include them.
function heikinAshi(bars: readonly PriceBar[]): PriceBar[] {
  const result: PriceBar[] = [];
  bars.forEach(([open, high, low, close], i) => {
    const previous = result[i - 1];
    const smoothedOpen = previous ? (previous[0] + previous[3]) / 2 : (open + close) / 2;
    const smoothedClose = (open + high + low + close) / 4;
    result.push([
      smoothedOpen,
      Math.max(high, smoothedOpen, smoothedClose),
      Math.min(low, smoothedOpen, smoothedClose),
      smoothedClose,
    ]);
  });
  return result;
}

// Candles and bars. Rising and falling candles differ by fill, not only by colour: hollow (or
// hatched) when rising and solid when falling, in the series' own colour.
function priceBars(display: Candle, bars: readonly PriceBar[], hollow: boolean): Glyph[] {
  const candles = display === 'candlestick' || display === 'heikinAshi';
  return bars.flatMap(([open, high, low, close], i): Glyph[] => {
    // Prices are written in the value axis' format; the session is a plain index.
    const label = `${i}: open {0}, high {1}, low {2}, close {3}`;
    const prices = [open, high, low, close];
    if (!candles) {
      const marks = [
        valued(line(label, [[i, low], [i, high]]), prices),
        line('Close', [[i, close], [i + HALF_BAR, close]]),
      ];
      return display === 'ohlc' ? [...marks, line('Open', [[i - HALF_BAR, open], [i, open]])] : marks;
    }
    const rising = close >= open;
    const body: Glyph =
      open === close
        ? line(label, [[i - HALF_BAR, open], [i + HALF_BAR, open]])
        : { ...rect(label, i - HALF_BAR, open, i + HALF_BAR, close), role: rising ? 'rise' : 'fall', hollow: hollow && rising };
    return [
      valued(line(label, [[i, low], [i, Math.min(open, close)]]), prices),
      valued(line(label, [[i, Math.max(open, close)], [i, high]]), prices),
      valued(body, prices),
    ];
  });
}

// A bar is [open, high, low, close] with the extremes enclosing the others. Indicators and price
// boxes also take a bare close, read as a bar whose four prices are equal.
function priceBar(needsBar: boolean): Check<PriceBar> {
  const readBar = tuple(['open', 'high', 'low', 'close']);
  return (path, raw) => {
    if (!needsBar && typeof raw === 'number') {
      const close = number(-MAX_VALUE, MAX_VALUE)(path, raw);
      return [close, close, close, close];
    }
    const [open, high, low, close] = readBar(path, raw);
    if (low > Math.min(open, close) || high < Math.max(open, close)) {
      fail(path, 'needs low and high to enclose open and close');
    }
    return [open, high, low, close];
  };
}

export function readMarket(r: Fields, path: string, reserve: (count: number) => void) {
  const display = readDisplay(r, MARKET_DISPLAYS);
  const needsBar = CANDLE_DISPLAYS.some((candle) => candle === display);
  const data = r.required('data', list(1, 1000, priceBar(needsBar), reserve));
  const closes = data.map((p) => p[3]);
  const sessions = closes.map((close, i): XY => [i, close]);
  const period = (fallback: number) => r.optional('period', integer(1, 1000)) ?? fallback;
  const marks: Glyph[] = [];
  const add = (label: string, points: XY[], role?: Role) => {
    if (!points.length) fail(path, `has too few observations for ${label}`);
    marks.push(line(label, points, role));
  };
  switch (display) {
    case 'sma':
    case 'bollinger': {
      const window = period(20);
      const mean: XY[] = [],
        low: XY[] = [],
        high: XY[] = [];
      for (let i = window - 1; i < closes.length; i++) {
        const prices = closes.slice(i - window + 1, i + 1);
        const value = average(prices);
        mean.push([i, value]);
        if (display === 'bollinger') {
          const spread = 2 * deviation(prices);
          low.push([i, value - spread]);
          high.push([i, value + spread]);
        }
      }
      if (high.length === 1) {
        marks.push(line('Two standard deviations', [low[0]!, high[0]!]));
      } else if (high.length) {
        marks.push({ kind: 'polygon', label: 'Two standard deviations', points: [...high, ...low.reverse()] });
      }
      add('Simple moving average', mean);
      break;
    }
    case 'ema':
      add('Exponential moving average', ema(sessions, period(20)));
      break;
    case 'rsi':
      add('Relative strength index', relativeStrength(closes, period(14)));
      break;
    case 'macd': {
      const fast = ema(sessions, FAST);
      const macd = ema(sessions, SLOW).map(([x, slow]): XY => [x, at(fast, x) - slow]);
      const signal = ema(macd, SIGNAL);
      for (const [x, y] of signal) marks.push(rect('MACD histogram', x - HALF_BAR, 0, x + HALF_BAR, at(macd, x) - y));
      add('MACD', macd);
      add('Signal', signal, 'secondary');
      break;
    }
    case 'control': {
      if (closes.length < 2) fail(path, 'needs at least two measurements');
      const mean = average(closes);
      const reach = (3 * average(closes.slice(1).map((v, i) => Math.abs(v - closes[i]!)))) / D2;
      for (const [name, y] of [
        ['Lower limit', mean - reach],
        ['Centre', mean],
        ['Upper limit', mean + reach],
      ] as const) {
        add(name, [[0, y], [closes.length - 1, y]], 'reference');
      }
      add('Observations', sessions);
      break;
    }
    case 'renko':
    case 'pointFigure': {
      const size = r.required('boxSize', number(Number.MIN_VALUE, MAX_VALUE));
      const boxes =
        display === 'renko'
          ? renko(priceBoxes(path, closes, size, 2, 1))
          : pointFigure(priceBoxes(path, closes, size, r.optional('reversal', integer(1, 100)) ?? 3, 0));
      marks.push(...(boxes.length ? boxes : [dot('Initial close', 0, closes[0]!)]));
      break;
    }
    case 'candlestick':
    case 'heikinAshi':
    case 'ohlc':
    case 'hlc': {
      const hollow = r.optional('hollow', boolean) ?? true;
      const bars = display === 'heikinAshi' ? heikinAshi(data) : data;
      const flags = r.optional(
        'flags',
        list(0, 100, (p, raw) => {
          const f = fields(p, raw);
          f.allow(['index', 'label']);
          return { index: f.required('index', integer(0, data.length - 1)), label: f.required('label', text(100)) };
        }),
      );
      marks.push(
        ...priceBars(display, bars, hollow),
        ...(flags ?? []).map(({ index, label }): Glyph => ({ kind: 'dataLabel', label, points: [[index, bars[index]![1]]] })),
      );
      break;
    }
    default:
      unhandled(display);
  }
  return checkGeometry(path, marks, reserve);
}
