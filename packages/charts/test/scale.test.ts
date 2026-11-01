import { describe, expect, it } from 'vitest';
import { bandScale, formatNumber, formatValue, place, scaleOf, type Scale } from '../src/scale.js';
import type { CheckedFormat, CheckedLinearAxis } from '../src/check-axis.js';

const plain: CheckedFormat = { decimals: undefined, thousands: ',', decimal: '.', prefix: '', suffix: '' };

// A scale asks for about one tick per 50 units of axis, so a length of 250 asks for 5.
const axis: CheckedLinearAxis = {
  type: 'linear',
  kind: 'linear',
  path: 'axes.y',
  title: undefined,
  min: undefined,
  max: undefined,
  step: undefined,
  interval: undefined,
  ticks: undefined,
  percent: false,
  grid: true,
  hidden: false,
  labelAngle: 0,
  format: plain,
  months: [],
};

// The ticks a scale labels when its labels must be `every` tick spacings apart: placed one unit
// apart, so the room is that many units.
const labelledTicks = (scale: Scale, every: number): number[] =>
  scale.labelled(every, (value) => scale.ticks.indexOf(value)).map((i) => scale.ticks[i]!);
// Places every tick at one place.
const atOnePlace = (): number => 0;
const scaling = (on: CheckedLinearAxis, extent: [number, number], length: number) => () => scaleOf(on, extent, length);

describe('a linear scale', () => {
  it.each<[string, [number, number], number, [number, number], string[]]>([
    ['rounds out to steps of 2 × 10^n', [0, 87], 250, [0, 100], ['0', '20', '40', '60', '80', '100']],
    ['writes fractional ticks as the nearest doubles to their decimals', [0.1, 0.3], 200, [0.1, 0.3], ['0.10', '0.15', '0.20', '0.25', '0.30']],
    ['takes in negative values', [-3, 7], 250, [-4, 8], ['-4', '-2', '0', '2', '4', '6', '8']],
    ['shows one value against zero', [5, 5], 250, [0, 5], ['0', '1', '2', '3', '4', '5']],
    ['shows zero alone as 0 to 1', [0, 0], 250, [0, 1], ['0.0', '0.2', '0.4', '0.6', '0.8', '1.0']],
    ['reaches tiny steps', [1e-9, 3e-9], 200, [1e-9, 3e-9], ['0.0000000010', '0.0000000015', '0.0000000020', '0.0000000025', '0.0000000030']],
    ['reaches large steps', [12, 9876543], 300, [0, 10000000], ['0', '2,000,000', '4,000,000', '6,000,000', '8,000,000', '10,000,000']],
    ['ends on 0.3 rather than rounding 3.0000000000000004 up', [0, 0.3], 150, [0, 0.3], ['0.0', '0.1', '0.2', '0.3']],
    ['draws values half a billionth apart as equal, against zero', [1e9, 1e9 + 0.5], 250, [0, 1.2e9], ['0', '200,000,000', '400,000,000', '600,000,000', '800,000,000', '1,000,000,000', '1,200,000,000']],
    ['tells values two billionths apart from equal', [1e9, 1e9 + 2], 250, [1e9, 1e9 + 2], ['1,000,000,000.0', '1,000,000,000.5', '1,000,000,001.0', '1,000,000,001.5', '1,000,000,002.0']],
    ['draws values a billionth apart as equal, against zero', [1e15, 1e15 + 1], 250, [0, 1.2e15], ['0', '200,000,000,000,000', '400,000,000,000,000', '600,000,000,000,000', '800,000,000,000,000', '1,000,000,000,000,000', '1,200,000,000,000,000']],
  ])('%s', (_case, extent, length, domain, labels) => {
    expect(scaleOf(axis, extent, length)).toMatchObject({ domain, labels });
  });

  it.each<[string, [number, number], { min: number; max: number }, string[]]>([
    ['shows a second of timestamps fixed at both ends', [1.7e12 + 100, 1.7e12 + 900], { min: 1.7e12, max: 1.7e12 + 1000 }, ['1,700,000,000,000', '1,700,000,000,200', '1,700,000,000,400', '1,700,000,000,600', '1,700,000,000,800', '1,700,000,001,000']],
    ['shows ends fixed a ten-billionth of their size apart', [1e9 + 0.2, 1e9 + 0.3], { min: 1e9 + 0.1, max: 1e9 + 0.5 }, ['1,000,000,000.10', '1,000,000,000.15', '1,000,000,000.20', '1,000,000,000.25', '1,000,000,000.30', '1,000,000,000.35', '1,000,000,000.40', '1,000,000,000.45', '1,000,000,000.50']],
    ['shows ends fixed within a billionth of their size, with ticks between them', [5, 5], { min: 5, max: 5 + 4e-9 }, ['5.0000000000', '5.0000000005', '5.0000000010', '5.0000000015', '5.0000000020', '5.0000000025', '5.0000000030', '5.0000000035', '5.0000000040']],
  ])('%s', (_case, extent, fixed, labels) => {
    expect(scaleOf({ ...axis, ...fixed }, extent, 300)).toMatchObject({ domain: [fixed.min, fixed.max], labels });
  });

  it.each<[string, [number, number], { min?: number; max?: number }, [number, number]]>([
    ['moves the free end a step below a fixed max that all the data equal', [0, 0], { max: 0 }, [-0.2, 0]],
    ['does the same below zero', [-5, -5], { max: -5 }, [-6, -5]],
    ['moves the free end a step above a fixed min that all the data equal', [5, 5], { min: 5 }, [5, 6]],
  ])('%s', (_case, extent, fixed, domain) => {
    expect(scaleOf({ ...axis, ...fixed }, extent, 250).domain).toEqual(domain);
  });

  it('steps a short axis again for the range shown when a fixed min meets data that all equal it', () => {
    expect(scaleOf({ ...axis, min: 5 }, [5, 5], 100)).toMatchObject({
      domain: [5, 6],
      ticks: [5, 5.5, 6],
      labels: ['5.0', '5.5', '6.0'],
    });
  });

  it('keeps only the ends as ticks when the doubles between fixed ends run out', () => {
    expect(scaleOf({ ...axis, min: 1, max: 1 + 2 ** -52 }, [1, 1], 300)).toMatchObject({
      ticks: [1, 1 + 2 ** -52],
      labels: ['1.0000000000000000', '1.0000000000000002'],
    });
  });

  it.each<[string, number, number[]]>([
    ['both ends when they fit', 1, [1, 1 + 2 ** -52]],
    ['the first end when they do not', 2, [1]],
  ])('labels %s of an axis with only its ends as ticks', (_case, every, labelled) => {
    expect(labelledTicks(scaleOf({ ...axis, min: 1, max: 1 + 2 ** -52 }, [1, 1], 300), every)).toEqual(labelled);
  });

  it.each<[string, [number, number], number, number, number[]]>([
    ['every tick when the labels fit', [0, 30], 750, 1, [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]],
    ['multiples of 10 on a step-2 axis that needs every third', [0, 30], 750, 3, [0, 10, 20, 30]],
    ['multiples of 10, counted from zero, on a step-5 axis that needs every second', [152, 188], 400, 2, [150, 160, 170, 180, 190]],
    ['multiples of 20 on a step-5 axis that needs every third', [0, 100], 1000, 3, [0, 20, 40, 60, 80, 100]],
  ])('labels %s', (_case, extent, length, every, labelled) => {
    expect(labelledTicks(scaleOf(axis, extent, length), every)).toEqual(labelled);
  });

  it('labels the tick that is a multiple of the largest nice step alone when none is a multiple of the one needed', () => {
    expect(labelledTicks(scaleOf({ ...axis, min: 3, max: 7 }, [3, 7], 250), 6)).toEqual([5]);
  });

  it('labels the first tick alone when every tick is at one place', () => {
    expect(scaleOf(axis, [0, 30], 750).labelled(10, atOnePlace)).toEqual([0]);
  });

  it('labels the multiple of 2 alone on an axis of large numbers with no multiple of the larger steps', () => {
    expect(labelledTicks(scaleOf({ ...axis, min: 1e13 + 1, max: 1e13 + 3, step: 1 }, [1e13 + 1, 1e13 + 3], 250), 5)).toEqual([1e13 + 2]);
  });

  it('rejects values that differ by less than 1e-20, which no tick step reaches', () => {
    expect(scaling(axis, [1e-25, 2e-25], 250)).toThrow(
      'Invalid chart: axes.y has values that differ by 1e-25, less than the smallest tick step, 1e-20',
    );
  });

  it('keeps a fixed min and max as the ends, with ticks only between them', () => {
    expect(scaleOf({ ...axis, min: -10, max: 95 }, [0, 87], 250)).toMatchObject({
      domain: [-10, 95],
      ticks: [0, 20, 40, 60, 80],
    });
  });

  it('writes the labels in the axis format', () => {
    expect(scaleOf({ ...axis, format: { ...plain, decimals: 1, prefix: '€' } }, [0, 87], 250).labels).toEqual([
      '€0.0',
      '€20.0',
      '€40.0',
      '€60.0',
      '€80.0',
      '€100.0',
    ]);
  });

  it('rejects data above a fixed max, naming the axis', () => {
    expect(scaling({ ...axis, max: 50 }, [0, 87], 250)).toThrow('Invalid chart: axes.y.max is 50, but the data reach 87');
  });

  it('maps the domain onto the range it is placed on, which may run backwards', () => {
    expect(place(scaleOf(axis, [0, 87], 250), [300, 100]).at(25)).toBe(250);
  });
});

describe('bandScale', () => {
  it('splits the range into equal bands, with the same gap between them as at each end', () => {
    expect(bandScale(4, [0, 100], 0.2)).toMatchObject({ bandwidth: 19.047619047619047, step: 23.80952380952381 });
  });

  it('starts the first band one gap in', () => {
    expect(bandScale(4, [0, 100], 0.2).start(0)).toBe(4.761904761904762);
  });

  it('starts the last band one gap and a band before the end', () => {
    expect(bandScale(4, [0, 100], 0.2).start(3)).toBe(76.19047619047619);
  });
});

describe('formatValue', () => {
  it.each<[string, number, CheckedFormat, string]>([
    ['writes all the decimals a value has', 1234.125, plain, '1,234.125'],
    ['writes small values out in full', 1.5e-7, plain, '0.00000015'],
    ['writes whole values with no decimals', 42, plain, '42'],
    ['keeps the decimals a format fixes', 1234.125, { ...plain, decimals: 1 }, '1,234.1'],
    ['writes a value too small for 20 decimals as 0 to 20 decimals', 1e-101, plain, '0.00000000000000000000'],
  ])('%s', (_case, value, format, expected) => {
    expect(formatValue(value, format)).toBe(expected);
  });
});

describe('formatNumber', () => {
  it.each<[string, number, number, CheckedFormat, string]>([
    ['groups thousands', 1234567.891, 2, plain, '1,234,567.89'],
    ['writes a value that rounds to zero without a sign', -0.001, 2, plain, '0.00'],
    ['uses the given separators and affixes', -1234, 0, { ...plain, thousands: '.', decimal: ',', prefix: '€', suffix: ' k' }, '-€1.234 k'],
    ['writes a separator literally, not as a replacement pattern', 1234, 0, { ...plain, thousands: '$&' }, '1$&234'],
    ['rounds half up, as toFixed does', 0.5, 0, plain, '1'],
    ['leaves numbers under a thousand ungrouped', 999, 0, plain, '999'],
  ])('%s', (_case, value, decimals, format, expected) => {
    expect(formatNumber(value, decimals, format)).toBe(expected);
  });
});
