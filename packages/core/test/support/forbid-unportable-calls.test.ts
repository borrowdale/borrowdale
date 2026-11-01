import { describe, expect, it } from 'vitest';
import { EXACT, INTL, LOCAL_DATE, LOCALE_METHODS, UNPORTABLE, UTC_DATE } from './forbid-unportable-calls.js';
import { cosAtLoad } from './binds-math-at-load.js';

type MathFunction = (...args: number[]) => number;
type Method = (...args: unknown[]) => unknown;

// Every function Math has in this runtime, and the two lists sorted together. A Math function added
// by a later runtime must be classified before the guard can be trusted; so must a Date method.
const MATH_FUNCTIONS = Object.getOwnPropertyNames(Math)
  .filter((name) => typeof (Math as unknown as Record<string, unknown>)[name] === 'function')
  .sort();
const CLASSIFIED = [...UNPORTABLE, ...EXACT].sort();
const DATE_METHODS = Object.getOwnPropertyNames(Date.prototype).sort();
const DATE_CLASSIFIED = [...LOCAL_DATE, ...UTC_DATE].sort();

// Calls, made only when a test runs them, so the guard is in place.
const epoch = (): Record<string, Method> => new Date(0) as unknown as Record<string, Method>;
const callDate = (name: string) => () => epoch()[name]!();
const callOn = (owner: object, name: string) => () => (owner as Record<string, Method>)[name]!();
const callDateWithout = () => Date();
const newDate = (...args: unknown[]) => () => new (Date as unknown as new (...a: unknown[]) => Date)(...args);
const newNumberFormat = () => new Intl.NumberFormat('en');
const callMath = (name: string) => () => (Math[name as keyof Math] as MathFunction)(1, 1);
const cosAtLoadOf1 = () => cosAtLoad(1);

describe('the unportable-call guard', () => {
  it('classifies every Math function as unportable or exact', () => {
    expect(MATH_FUNCTIONS).toEqual(CLASSIFIED);
  });

  it.each(UNPORTABLE)('makes Math.%s throw', (name) => {
    expect(callMath(name)).toThrow(`Math.${name}() called while drawing`);
  });

  it('reaches a reference to Math.cos taken by a module loaded after it', () => {
    expect(cosAtLoadOf1).toThrow('Math.cos() called while drawing');
  });

  it.each<[string, number[], number]>([
    ['abs', [-4], 4],
    ['floor', [4.5], 4],
    ['sqrt', [4], 2],
    ['imul', [4, 2], 8],
    ['round', [2.5], 3],
  ])('leaves Math.%s working', (name, args, expected) => {
    expect((Math[name as keyof Math] as MathFunction)(...args)).toBe(expected);
  });

  it('classifies every Date method as local or UTC', () => {
    expect(DATE_METHODS).toEqual(DATE_CLASSIFIED);
  });

  it.each(LOCAL_DATE)('makes Date.prototype.%s throw', (name) => {
    expect(callDate(name)).toThrow(`Date.prototype.${name}() called while drawing`);
  });

  it.each<[string, unknown]>([
    ['getTime', 0],
    ['getUTCFullYear', 1970],
    ['getUTCHours', 0],
    ['toISOString', '1970-01-01T00:00:00.000Z'],
    ['valueOf', 0],
  ])('leaves Date.prototype.%s working', (name, expected) => {
    expect(callDate(name)()).toBe(expected);
  });

  it.each(LOCALE_METHODS)('makes %s.prototype.%s throw', (owner, name, prototype) => {
    expect(callOn(prototype, name)).toThrow(`${owner}.prototype.${name}() called while drawing`);
  });

  it('lists the members of Intl', () => {
    expect(INTL).toEqual(expect.arrayContaining(['Collator', 'DateTimeFormat', 'NumberFormat', 'Segmenter']));
  });

  it.each(INTL)('makes Intl.%s throw', (name) => {
    expect(callOn(Intl, name)).toThrow(`Intl.${name}() called while drawing`);
  });

  it('makes constructing an Intl formatter throw', () => {
    expect(newNumberFormat).toThrow('Intl.NumberFormat() called while drawing');
  });

  it.each(['now', 'parse'])('makes Date.%s throw', (name) => {
    expect(callOn(Date, name)).toThrow(`Date.${name}() called while drawing`);
  });

  it('makes calling Date without new throw', () => {
    expect(callDateWithout).toThrow('Date() called while drawing');
  });

  it.each<[string, unknown[]]>([
    ['nothing', []],
    ['a string', ['2026-01-01']],
    ['local date parts', [2026, 0, 1]],
    ['a numeric string', ['0']],
  ])('makes a new Date from %s throw', (_label, args) => {
    expect(newDate(...args)).toThrow('new Date() called while drawing, with other than one number or Date');
  });

  it.each<[string, unknown[], number]>([
    ['a number of milliseconds', [5], 5],
    ['another Date', [new Date(7)], 7],
  ])('leaves a new Date from %s working', (_label, args, expected) => {
    expect(newDate(...args)().getTime()).toBe(expected);
  });

  it('leaves Date.UTC working', () => {
    expect(Date.UTC(2026, 10, 1)).toBe(1_793_491_200_000);
  });

  it('keeps Date instances recognisable', () => {
    expect(newDate(0)()).toBeInstanceOf(Date);
  });
});
