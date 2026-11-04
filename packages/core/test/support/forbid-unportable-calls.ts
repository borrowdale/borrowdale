import { afterAll, vi } from 'vitest';

// Importing this module makes every test in the importing file fail if drawing calls a function whose
// result depends on more than its arguments: on the JavaScript engine (most Math functions), on the
// clock or a source of randomness (Math.random, Date.now, a new Date of now, crypto.getRandomValues
// and crypto.randomUUID) or on the locale and time zone (Intl, the toLocale methods, the local-time
// Date methods, parsing a date string). Drawings must come from their input and the engine's own
// arithmetic alone. performance.now reads the clock too, but the test runner calls it while it loads
// the code under test, so it cannot be made to throw here. Temporal, in the engines that have it, is
// not guarded yet: Temporal.Now reads the clock and the time zone, its toLocaleString methods the
// locale, and its time zone conversions the engine's time zone data. A Date reaches it through
// toTemporalInstant, so guarding it means guarding its prototypes, not only the global. No package
// calls Temporal; guard it before one does.
//
// The functions are replaced when this module loads, not before each test, so import it before the
// code under test: code that keeps its own reference (`const cos = Math.cos`) when it loads then
// holds the throwing function too.

/** Every Math function whose result is implementation-approximated, plus random. */
export const UNPORTABLE = [
  'random',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'pow', 'cbrt', 'hypot',
] as const;

/** Every Math function whose result the specification fixes exactly. The engine may call these. */
export const EXACT = [
  'abs', 'ceil', 'clz32', 'f16round', 'floor', 'fround', 'imul', 'max', 'min', 'round', 'sign', 'sqrt', 'trunc',
] as const;

/** Every Date method that reads or writes the local time zone, or writes the locale's format. */
export const LOCAL_DATE = [
  'getDate', 'getDay', 'getFullYear', 'getHours', 'getMilliseconds', 'getMinutes', 'getMonth', 'getSeconds',
  'getTimezoneOffset', 'getYear',
  'setDate', 'setFullYear', 'setHours', 'setMilliseconds', 'setMinutes', 'setMonth', 'setSeconds', 'setYear',
  'toDateString', 'toLocaleDateString', 'toLocaleString', 'toLocaleTimeString', 'toString', 'toTimeString',
] as const;

/** Every Date method that works in UTC or on the time value alone. */
export const UTC_DATE = [
  'constructor', 'getTime',
  'getUTCDate', 'getUTCDay', 'getUTCFullYear', 'getUTCHours', 'getUTCMilliseconds', 'getUTCMinutes', 'getUTCMonth',
  'getUTCSeconds',
  'setTime', 'setUTCDate', 'setUTCFullYear', 'setUTCHours', 'setUTCMilliseconds', 'setUTCMinutes', 'setUTCMonth',
  'setUTCSeconds',
  'toGMTString', 'toISOString', 'toJSON', 'toTemporalInstant', 'toUTCString', 'valueOf',
] as const;

/** The methods outside Date that format or compare by the locale. */
export const LOCALE_METHODS: readonly (readonly [owner: string, name: string, prototype: object])[] = [
  ['Object', 'toLocaleString', Object.prototype],
  ['Number', 'toLocaleString', Number.prototype],
  ['BigInt', 'toLocaleString', BigInt.prototype],
  ['Array', 'toLocaleString', Array.prototype],
  ['TypedArray', 'toLocaleString', Object.getPrototypeOf(Uint8Array.prototype) as object],
  ['String', 'localeCompare', String.prototype],
  ['String', 'toLocaleLowerCase', String.prototype],
  ['String', 'toLocaleUpperCase', String.prototype],
];

/** Every member of Intl: each one formats, compares or names things from the runtime's locale data. */
export const INTL = Object.getOwnPropertyNames(Intl);

type Method = (...args: unknown[]) => unknown;

// A function expression rather than an arrow, so `new Intl.NumberFormat()` runs it too: vitest
// constructs a mock's implementation when the mock is called with `new`.
function forbid(owner: object, name: string, label: string): void {
  vi.spyOn(owner as Record<string, Method>, name).mockImplementation(function () {
    throw new Error(`${label}() called while drawing`);
  });
}

for (const name of UNPORTABLE) {
  forbid(Math, name, `Math.${name}`);
}
for (const name of LOCAL_DATE) {
  forbid(Date.prototype, name, `Date.prototype.${name}`);
}
for (const [owner, name, prototype] of LOCALE_METHODS) {
  forbid(prototype, name, `${owner}.prototype.${name}`);
}
for (const name of INTL) {
  forbid(Intl, name, `Intl.${name}`);
}
forbid(Date, 'now', 'Date.now');
forbid(Date, 'parse', 'Date.parse');
forbid(crypto, 'getRandomValues', 'crypto.getRandomValues');
forbid(crypto, 'randomUUID', 'crypto.randomUUID');

// A Date may be made from a number of milliseconds, or copied from another Date. Called without
// `new`, or made from nothing, a string or the parts of a local time, it reads the clock, parses
// by the engine's own rules or applies the time zone.
const RealDate = Date;
vi.stubGlobal(
  'Date',
  new Proxy(RealDate, {
    apply: () => {
      throw new Error('Date() called while drawing');
    },
    construct: (target, args: unknown[], newTarget: NewableFunction) => {
      if (!(args.length === 1 && (typeof args[0] === 'number' || args[0] instanceof RealDate))) {
        throw new Error('new Date() called while drawing, with other than one number or Date');
      }
      return Reflect.construct(target, args, newTarget) as object;
    },
  }),
);

afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
