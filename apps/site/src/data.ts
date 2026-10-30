import world from './data/world.json';
import climate from './data/climate.json';
import quakes from './data/quakes.json';
export { world, climate, quakes };
export const indicators = { gdp: 'NY.GDP.PCAP.CD', life: 'SP.DYN.LE00.IN', population: 'SP.POP.TOTL' };
export const countries = [...new Map(world.rows.map((x) => [x.code, x.country])).entries()].map(
  ([code, name]) => ({ code, name }),
);
export function countryValue(code: string, year: number, indicator: string): number | null {
  return (
    world.rows.find((x) => x.code === code && x.year === year && x.indicator === indicator)?.value ?? null
  );
}
export function worldAt(year: number) {
  return countries.map((c) => ({
    ...c,
    gdp: countryValue(c.code, year, indicators.gdp),
    life: countryValue(c.code, year, indicators.life),
    population: countryValue(c.code, year, indicators.population),
  }));
}
export function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return n ? (sorted[Math.floor((n - 1) / 2)]! + sorted[Math.floor(n / 2)]!) / 2 : null;
}
export const completedYears = climate.rows.filter((x) => x.annual !== null);
export const pretty = (n: number | null, digits = 1) =>
  n === null ? '—' : new Intl.NumberFormat('en', { maximumFractionDigits: digits }).format(n);
export const compact = (n: number) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
export const day = (n: number) => new Date(n).toISOString().slice(0, 10);
export function dailyCounts(events: typeof quakes.rows) {
  // Include zero-event UTC days across the saved feed window, even after filtering.
  const end = Date.parse(day(quakes.generated));
  const start = Date.parse(day(Math.min(...quakes.rows.map((e) => e.time))));
  const rows = Array.from({ length: Math.round((end - start) / 86400000) + 1 }, (_, i) => ({
    date: day(start + i * 86400000),
    count: 0,
  }));
  for (const e of events) {
    const row = rows.find((r) => r.date === day(e.time));
    if (row) row.count++;
  }
  return rows;
}
