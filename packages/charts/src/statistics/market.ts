import { binGrid } from './bin-grid.js';
import { boolean, fail, fields, integer, list, MAX_VALUE, number, oneOf, text, tuple, type Fields } from '../read.js';
import { average, checkGeometry, deviation, dot, line, rect, type Glyph, type XY } from './geometry.js';
import type { Role } from '../palette.js';
import { CANDLE_DISPLAYS, readDisplay, MARKET_DISPLAYS, unhandled, type Candle } from './types.js';

function ema(prices: readonly number[], period: number, offset = 0): XY[] {
  if (prices.length < period) return [];
  if (period === 1) return prices.map((price, index) => [offset + index, price]);
  let value = average(prices.slice(0, period));
  const result: XY[] = [[offset + period - 1, value]];
  for (let i = period; i < prices.length; i++) {
    value += ((prices[i]! - value) * 2) / (period + 1);
    result.push([i + offset, value]);
  }
  return result;
}
function relativeStrength(prices: number[], period: number): XY[] {
  let gain = 0,
    loss = 0;
  const result: XY[] = [];
  for (let i = 1; i < prices.length; i++) {
    // RSI is a ratio. Exact binary scaling keeps even the smallest price changes
    // representable through the initial division; input prices are bounded by 1e15.
    const delta = (prices[i]! - prices[i - 1]!) * (2 ** 512);
    const up = Math.max(0, delta),
      down = Math.max(0, -delta);
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
function bricks(
  prices: number[],
  size: number,
  reversal: number,
  renko: boolean,
  path: string,
  reserve: (n: number) => void,
): Glyph[] {
  const origin = prices[0]!;
  const grid = binGrid(origin, size);
  let level = 0,
    direction = 0,
    column = 0;
  const marks: Glyph[] = [];
  for (const price of prices) {
    const sign = Math.sign(price - grid.edge(level));
    const steps = Math.abs(grid.index(price, sign > 0 ? 'floor' : 'ceil') - level);
    const reversing = direction !== 0 && direction !== sign;
    if (steps < (reversing ? reversal : 1)) continue;
    if (steps - (reversing && renko ? 1 : 0) + marks.length > 4000)
      fail(path, 'would draw more than 4000 price boxes');
    reserve((steps - (reversing && renko ? 1 : 0)) * (renko ? 4 : 1));
    if (reversing && !renko) column++;
    if (reversing && renko) level += sign;
    for (let step = reversing && renko ? 1 : 0; step < steps; step++) {
      const from = grid.edge(level);
      level += sign;
      const to = grid.edge(level);
      if (to === from) fail(path, 'needs a box size resolvable at the price coordinates');
      if (renko) {
        marks.push({ ...rect(String(to), column, from, column + 1, to), hollow: sign > 0 });
        column++;
      } else marks.push({ kind: 'text', label: sign > 0 ? 'X' : 'O', points: [[column, to]] });
    }
    direction = sign;
  }
  if (!marks.length) marks.push(dot('Initial close', 0, origin));
  return marks;
}
type Bar = readonly [open: number, high: number, low: number, close: number];

// Rising and falling candles differ by fill, not only by colour: hollow or hatched when rising,
// solid when falling, all in the series' own colour.
function priceBars(r: Fields, display: Candle, data: readonly Bar[]): Glyph[] {
  const hollow = r.optional('hollow', boolean) ?? true;
  const highs: number[] = [];
  const marks: Glyph[] = [];
  let previousOpen = 0,
    previousClose = 0;
  data.forEach(([open, high, low, close], i) => {
    if (display === 'heikinAshi') {
      const transformed = (open + high + low + close) / 4;
      open = i ? (previousOpen + previousClose) / 2 : (open + close) / 2;
      close = transformed;
      high = Math.max(high, open, close);
      low = Math.min(low, open, close);
      previousOpen = open;
      previousClose = close;
    }
    highs.push(high);
    const title = `${i}: open ${open}, high ${high}, low ${low}, close ${close}`;
    const rising = close >= open;
    if (display === 'ohlc' || display === 'hlc') {
      marks.push(
        line(title, [
          [i, low],
          [i, high],
        ]),
        line('Close', [
          [i, close],
          [i + 0.3, close],
        ]),
      );
      if (display === 'ohlc')
        marks.push(
          line('Open', [
            [i - 0.3, open],
            [i, open],
          ]),
        );
    } else {
      marks.push(
        line(title, [
          [i, low],
          [i, Math.min(open, close)],
        ]),
        line(title, [
          [i, Math.max(open, close)],
          [i, high],
        ]),
        open === close
          ? line(title, [
              [i - 0.3, open],
              [i + 0.3, open],
            ])
          : { ...rect(title, i - 0.3, open, i + 0.3, close), role: rising ? 'rise' : 'fall', hollow: hollow && rising },
      );
    }
  });
  const flags = r.optional(
    'flags',
    list(0, 100, (p, raw) => {
      const f = fields(p, raw);
      f.allow(['index', 'label']);
      return { i: f.required('index', integer(0, data.length - 1)), label: f.required('label', text(100)) };
    }),
  );
  for (const flag of flags ?? []) marks.push({ kind: 'text', label: flag.label, points: [[flag.i, highs[flag.i]!]] });
  return marks;
}
export function readMarket(r: Fields, path: string, reserve: (n: number) => void) {
  const display = readDisplay(r, MARKET_DISPLAYS);
  const readBar = tuple(['open', 'high', 'low', 'close']);
  const needsBar = CANDLE_DISPLAYS.some((candle) => candle === display);
  const data = r.required(
    'data',
    list(
      1,
      1000,
      (p, raw) => {
        if (!needsBar && typeof raw === 'number') {
          const close = number(-MAX_VALUE, MAX_VALUE)(p, raw);
          return [close, close, close, close] as const;
        }
        return readBar(p, raw);
      },
      reserve,
    ),
  );
  data.forEach(([o, h, l, c], i) => {
    if (l > Math.min(o, c) || h < Math.max(o, c))
      fail(`${path}.data[${i}]`, 'needs low and high to enclose open and close');
  });
  const closes = data.map((p) => p[3]);
  const marks: Glyph[] = [];
  const period = r.optional('period', integer(1, 1000)) ?? (display === 'rsi' ? 14 : 20);
  const add = (label: string, points: XY[], role?: Role) => {
    if (!points.length) fail(path, `has too few observations for ${label}`);
    marks.push(line(label, points, role));
  };
  switch (display) {
    case 'sma':
    case 'bollinger': {
      const mean: XY[] = [],
        low: XY[] = [],
        high: XY[] = [];
      for (let i = period - 1; i < closes.length; i++) {
        const window = closes.slice(i - period + 1, i + 1);
        const value = average(window);
        mean.push([i, value]);
        if (display === 'bollinger') {
          const spread = 2 * deviation(window);
          low.push([i, value - spread]);
          high.push([i, value + spread]);
        }
      }
      if (high.length === 1) marks.push(line('Two standard deviations', [low[0]!, high[0]!]));
      else if (high.length)
        marks.push({ kind: 'polygon', label: 'Two standard deviations', points: [...high, ...low.reverse()] });
      add('Simple moving average', mean);
      break;
    }
    case 'ema':
      add('Exponential moving average', ema(closes, period));
      break;
    case 'rsi':
      add('Relative strength index', relativeStrength(closes, period));
      break;
    case 'macd': {
      const fast = ema(closes, 12),
        slow = ema(closes, 26);
      const macd: XY[] = slow.map(([i, y]) => [i, fast[i - 11]![1] - y]);
      const signal = ema(
        macd.map((p) => p[1]),
        9,
        25,
      );
      for (const [i, y] of signal) marks.push(rect('MACD histogram', i - 0.3, 0, i + 0.3, macd[i - 25]![1] - y));
      add('MACD', macd);
      add('Signal', signal, 'secondary');
      break;
    }
    case 'control': {
      if (closes.length < 2) fail(path, 'needs at least two measurements');
      const mean = average(closes);
      const mr = average(closes.slice(1).map((v, i) => Math.abs(v - closes[i]!)));
      for (const [name, y] of [
        ['Lower limit', mean - (3 * mr) / 1.128],
        ['Centre', mean],
        ['Upper limit', mean + (3 * mr) / 1.128],
      ] as const) {
        add(
          name,
          [
            [0, y],
            [closes.length - 1, y],
          ],
          'reference',
        );
      }
      add(
        'Observations',
        closes.map((v, i) => [i, v]),
      );
      break;
    }
    case 'renko':
    case 'pointFigure': {
      const size = r.required('boxSize', number(Number.MIN_VALUE, MAX_VALUE));
      const reversal = display === 'renko' ? 2 : (r.optional('reversal', integer(1, 100)) ?? 3);
      marks.push(...bricks(closes, size, reversal, display === 'renko', path, reserve));
      break;
    }
    case 'candlestick':
    case 'heikinAshi':
    case 'ohlc':
    case 'hlc':
      marks.push(...priceBars(r, display, data));
      break;
    default:
      unhandled(display);
  }
  if (display !== 'pointFigure' && display !== 'renko') reserve(marks.reduce((sum, m) => sum + m.points.length, 0));
  return checkGeometry(path, marks);
}
