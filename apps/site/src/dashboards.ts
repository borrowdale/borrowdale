import {
  world,
  climate,
  quakes,
  countries,
  indicators,
  countryValue,
  worldAt,
  completedYears,
  median,
  pretty,
  compact,
  day,
  dailyCounts,
  worldYears,
  retrievedOn,
} from './data';
import { chart, chartSpec, colors, escape, ink } from './drawing';
import { codeBlock, chartCode } from './gallery';
import { dataTable } from './data-table';
import type { ChartSpec } from '@borrowdale/charts';
export { world, climate, quakes } from './data';
export const dashboardState = { year: 2023, country: 'HUN', since: 1970, magnitude: 4.5 };
// Box plots of each group's sample, at 1, 3, 5, …: each box reaches at most half a unit either side of
// its position, so neighbours keep a unit between them and each end of the axis half a unit. Hachure
// keeps the median line visible, where the dashboards' solid fill would hide it.
export function boxChart(
  title: string,
  groups: readonly { name: string; data: readonly number[] }[],
  color: string,
  y: { title?: string; format?: { suffix: string } },
) {
  const position = (i: number) => 2 * i + 1;
  return chartSpec(
    title,
    [],
    groups.map((group, i) => ({
      type: 'distribution',
      display: 'box',
      name: group.name,
      color,
      position: position(i),
      data: group.data,
    })),
    {
      legend: 'none',
      style: { roughness: 0.8, fillStyle: 'hachure' },
      axes: {
        x: {
          type: 'linear',
          min: 0,
          max: 2 * groups.length,
          ticks: groups.map((group, i) => ({ value: position(i), label: group.name })),
        },
        y: { type: 'linear', grid: true, ...y },
      },
    },
  );
}
export function chartPanel(title: string, note: string, spec: ChartSpec, extra = '') {
  return `<article class="chart-panel ${extra}"><header><div><h2>${escape(title)}</h2><p>${escape(note)}</p></div><span class="chart-mark">↗</span></header><p class="chart-scroll-hint">Swipe or scroll sideways to explore the chart →</p><div class="chart-view" tabindex="0" role="region" aria-label="${escape(title)} chart">${chart(spec)}</div>${dataTable(title, spec)}<details class="dashboard-code"><summary>View chart code <span>⌘</span></summary>${codeBlock(chartCode(spec))}</details></article>`;
}
function metric(label: string, value: string, note: string, accent = '') {
  return `<article class="metric ${accent}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
}
function heading(
  kicker: string,
  title: string,
  desc: string,
  source: string,
  retrieved: string,
  controls: string,
) {
  return `<div class="dashboard-heading"><div><p class="eyebrow">${kicker} / OPEN DATA NOTEBOOK</p><h1>${title}</h1><p>${desc}</p></div><div class="snapshot"><span class="status-dot"></span> Saved snapshot<small>Retrieved ${retrievedOn(retrieved)}</small></div></div><div class="dashboard-toolbar"><span>${source}</span><div>${controls}<button class="button small" id="download-data">↓ Download data</button></div></div>`;
}
function sourceNote(content: string) {
  return `<aside class="source-note"><span>↳</span><div><h3>Behind these numbers</h3><p>${content}</p></div></aside>`;
}
export function worldDashboard() {
  const { year, country } = dashboardState,
    rows = worldAt(year),
    selected = countries.find((x) => x.code === country)!;
  const complete = rows.filter((x) => x.gdp !== null && x.life !== null && x.population !== null);
  const gdp = rows.filter((x) => x.gdp !== null).sort((a, b) => b.gdp! - a.gdp!);
  const population = rows.reduce((n, r) => n + (r.population ?? 0), 0);
  const life = median(rows.flatMap((x) => (x.life === null ? [] : [x.life])));
  const years = worldYears;
  const controls = `<label>Year <select id="world-year">${years.map((y) => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select></label><label>Country <select id="world-country">${countries.map((c) => `<option value="${escape(c.code)}" ${country === c.code ? 'selected' : ''}>${escape(c.name)}</option>`).join('')}</select></label>`;
  const rank = chartSpec(
    'GDP per capita',
    gdp.map((x) => x.name),
    [{ type: 'bar', name: 'GDP per capita', color: colors[0], data: gdp.map((x) => x.gdp! / 1000) }],
    {
      height: 400,
      axes: {
        y: { type: 'band', categories: gdp.map((x) => x.name) },
        x: { type: 'linear', format: { prefix: '$', suffix: 'k' } },
      },
    },
  );
  const scatter: ChartSpec = {
    width: 660,
    height: 400,
    title: 'Income and longevity',
    legend: 'bottom',
    axes: {
      x: { type: 'linear', title: 'GDP per capita · US$ thousands' },
      y: { type: 'linear', min: 40, max: 95, title: 'Life expectancy · years' },
    },
    style: { roughness: 0.7, fillStyle: 'solid' },
    series: [
      ...complete.map((r, i) => ({
        type: 'bubble' as const,
        name: r.name,
        color: colors[i % colors.length],
        data: [[r.gdp! / 1000, r.life!, r.population! / 1e6] as const],
      })),
      // Life expectancy against the logarithm of income: the curve flattens as income rises. Fitted
      // only through three or more countries, as a refreshed snapshot may lack the latest values.
      ...(complete.length > 2
        ? [
            {
              type: 'relationship' as const,
              display: 'regression' as const,
              method: 'logarithmic' as const,
              name: 'Logarithmic fit',
              color: ink,
              data: complete.map((r) => [r.gdp! / 1000, r.life!] as const),
            },
          ]
        : []),
    ],
  };
  const trend = chartSpec(
    `${selected.name} · life expectancy`,
    years.map(String),
    [
      {
        type: 'line',
        name: selected.name,
        color: colors[2],
        curve: 'monotone',
        data: years.map((y) => countryValue(country, y, indicators.life)),
      },
    ],
    {
      axes: {
        x: { type: 'band', categories: years.map(String) },
        y: { type: 'linear', format: { suffix: ' yr' } },
      },
    },
  );
  const share: ChartSpec = {
    width: 660,
    height: 370,
    title: 'Population in the comparison',
    legend: 'right',
    series: [
      {
        type: 'pie',
        name: 'Population',
        innerRadius: 0.5,
        data: rows
          .filter((r) => r.population !== null)
          .map((r, i) => ({ name: r.name, value: r.population!, color: colors[i % colors.length] })),
      },
    ],
  };
  const profileKeys = ['gdp', 'life', 'population'] as const;
  const profile: ChartSpec = {
    width: 660,
    height: 370,
    title: `${selected.name} · relative profile`,
    axes: {
      angle: { type: 'band', categories: ['Income', 'Longevity', 'Population'] },
      radius: { type: 'linear', min: 0, max: 100 },
    },
    series: [
      {
        type: 'radar',
        name: selected.name,
        color: colors[2],
        data: profileKeys.map((k) => {
          const value = rows.find((r) => r.code === country)![k];
          return (value! / Math.max(...rows.map((r) => r[k] ?? 0))) * 100;
        }),
      },
    ],
  };
  const longevity: ChartSpec = {
    width: 1000,
    height: 420,
    title: 'Life expectancy by year',
    legend: 'bottom',
    colorAxis: { type: 'linear', title: 'Years' },
    axes: {
      x: { type: 'band', categories: years.map(String) },
      y: { type: 'band', categories: countries.map((c) => c.name) },
    },
    series: [
      {
        type: 'heatmap',
        name: 'Life expectancy',
        data: countries.flatMap((c) => years.map((y) => [String(y), c.name, countryValue(c.code, y, indicators.life)] as const)),
      },
    ],
  };
  // A waffle needs a colour of its own for each category, and the palette has six: the most populous
  // countries take five, and the rest share the sixth.
  const byPopulation = rows.filter((r) => r.population !== null).sort((a, b) => b.population! - a.population!);
  const largest = byPopulation.slice(0, colors.length - 1),
    others = byPopulation.slice(colors.length - 1);
  const people: ChartSpec = {
    width: 1000,
    height: 420,
    title: 'People, ten million at a time',
    legend: 'right',
    series: [
      {
        type: 'units',
        name: 'Tens of millions',
        display: 'waffle',
        columns: 40,
        data: [
          ...largest.map((r) => ({ name: r.name, population: r.population! })),
          ...(others.length
            ? [{ name: `Other ${others.length} countries`, population: others.reduce((n, r) => n + r.population!, 0) }]
            : []),
        ].map(({ name, population }, i) => ({ name, value: Math.round(population / 1e7), color: colors[i] })),
      },
    ],
  };
  return (
    heading(
      '01 · WORLD BANK',
      'A wider world.',
      `Different economies. Shared questions. Explore income, longevity and population across ${countries.length} countries.`,
      'World Development Indicators',
      world.retrieved,
      controls,
    ) +
    `<div class="metrics">${metric('COUNTRIES IN VIEW', String(rows.length), 'A selected comparison, not the whole world')}${metric('COMBINED POPULATION', compact(population), `${year} · available observations`)}${metric('MEDIAN LIFE EXPECTANCY', `${pretty(life)} <em>years</em>`, 'Unweighted country median', 'tint-green')}${metric('COMPLETE OBSERVATIONS', `${complete.length} / ${rows.length}`, 'Income + life expectancy + population')}</div>
 <div class="dashboard-grid">${chartPanel('The income picture', 'Current US$ per person · bars use thousands', rank)}${chartPanel('More than an income', 'Bubble area represents population · each bubble is one country · the line is a logarithmic fit across these countries, descriptive only', scatter)}${chartPanel('A longer perspective', `${selected.name} · 2010–2024 · gaps are missing observations`, trend, 'wide')}${chartPanel('Longevity across the years', 'Life expectancy at birth in years · each cell is one country and year', longevity, 'wide')}
 ${chartPanel('People in perspective', `Share of population among these ${countries.length} countries only`, share)}${profileKeys.every((k) => rows.find((r) => r.code === country)![k] !== null) ? chartPanel('Three dimensions', `Each measure is relative to the highest of the ${countries.length} countries (100).`, profile) : '<article class="chart-panel empty"><h2>Profile unavailable</h2><p>One or more measures are missing for this country and year.</p></article>'}${chartPanel('People, counted out', `Each square is ten million people in ${year}, rounded · the ${largest.length} most populous of the ${byPopulation.length} countries with data, and the rest together`, people, 'wide')}</div>` +
    sourceNote(
      `World Bank, <a href="https://datacatalog.worldbank.org/infrastructure-data/search/dataset/0037712/world-development-indicators" target="_blank" rel="noreferrer">World Development Indicators</a>, CC BY 4.0. Indicators: NY.GDP.PCAP.CD, SP.DYN.LE00.IN and SP.POP.TOTL. GDP is in current US dollars, not adjusted for purchasing power or inflation. Missing values stay missing. Bubble positions use complete observations only; the selected-country median is not a population-weighted global estimate. <a href="${escape(world.sourceUrl)}" target="_blank" rel="noreferrer">Original API query ↗</a>`,
    )
  );
}
export function climateDashboard() {
  const since = dashboardState.since,
    rows = completedYears.filter((x) => x.year >= since),
    latest = completedYears.at(-1)!;
  const earliest = rows[0]!,
    change = latest.annual! - earliest.annual!;
  const warmest = [...completedYears].sort((a, b) => b.annual! - a.annual!)[0]!;
  const recent = completedYears.slice(-3),
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const decs = [...new Set(rows.map((r) => Math.floor(r.year / 10) * 10))];
  const annual = chartSpec(
    'Global temperature anomaly',
    rows.map((r) => String(r.year)),
    [{ type: 'line', name: 'Annual anomaly', color: colors[3], data: rows.map((r) => r.annual) }],
    {
      width: 1000,
      height: 340,
      axes: {
        x: { type: 'band', categories: rows.map((r) => String(r.year)) },
        y: { type: 'linear', format: { suffix: '°C' } },
      },
    },
  );
  const decades = boxChart(
    'Decade spread',
    decs.map((d) => ({
      name: `${d}s`,
      data: rows.filter((r) => r.year >= d && r.year < d + 10).map((r) => r.annual!),
    })),
    colors[3],
    { format: { suffix: '°C' } },
  );
  const points = rows.map((r) => [r.year, r.annual!] as const);
  // The share of the years each local fit uses; the panel note quotes it.
  const span = 0.3;
  const smooth: ChartSpec = {
    width: 1000,
    height: 340,
    title: 'Smoothed temperature anomaly',
    legend: 'top',
    fontSize: 12,
    axes: {
      x: { type: 'linear', title: 'Year', format: { thousandsSeparator: '' } },
      y: { type: 'linear', grid: true, format: { suffix: '°C' } },
    },
    style: { roughness: 0.8, fillStyle: 'solid' },
    series: [
      {
        type: 'scatter',
        name: 'Annual anomaly',
        color: colors[3],
        data: points,
      },
      {
        type: 'relationship',
        display: 'regression',
        method: 'loess',
        span,
        name: 'LOESS trend',
        color: ink,
        data: points,
      },
    ],
  };
  const monthly: ChartSpec = {
    width: 660,
    height: 370,
    title: 'Monthly anomalies',
    legend: 'top',
    axes: {
      angle: { type: 'band', categories: months },
      radius: {
        type: 'linear',
        min: Math.min(0, ...recent.flatMap((r) => r.months.filter((x) => x !== null))),
        format: { suffix: '°C' },
      },
    },
    series: recent.map((r, i) => ({
      type: i === 0 ? 'polarArea' : 'polarLine',
      name: String(r.year),
      color: colors[[1, 0, 3][i]!],
      data: r.months,
    })),
  };
  const spread = chartSpec(
    'Monthly range and annual mean',
    rows.map((r) => String(r.year)),
    [
      {
        type: 'rangeArea',
        name: 'Monthly range',
        color: colors[0],
        data: rows.map((r) => {
          const values = r.months.filter((x): x is number => x !== null);
          return values.length ? [Math.min(...values), Math.max(...values)] : null;
        }),
      },
      { type: 'line', name: 'Annual mean', color: colors[3], data: rows.map((r) => r.annual) },
    ],
    { legend: 'top' },
  );
  const gauge: ChartSpec = {
    width: 660,
    height: 310,
    title: `${latest.year} annual anomaly`,
    axes: {
      angle: {
        type: 'linear',
        min: Math.min(0, latest.annual!),
        max: Math.max(2, Math.ceil(latest.annual!)),
        format: { suffix: '°C' },
      },
    },
    series: [{ type: 'gauge', name: 'Anomaly', color: colors[3], value: latest.annual! }],
  };
  // One diverging scale for both grids, even about 0 and wide enough for every month on record, so a
  // colour stands for the same anomaly in each and from any starting year.
  const bound =
    Math.ceil(Math.max(...completedYears.flatMap((r) => r.months.flatMap((m) => (m === null ? [] : [Math.abs(m)])))) * 2) / 2;
  const anomalyScale = { type: 'linear', scale: 'diverging', scheme: 'blue-red', min: -bound, max: bound, format: { suffix: '°C' } } as const;
  const yearOf = (year: number) => [String(year), String(year + 1)] as const;
  // The month grid keeps to the last 30 complete years, whatever the view starts from: from 1880 it
  // would draw 1,752 cells, over a megabyte of page.
  const lastYears = completedYears.slice(-30);
  const stripes: ChartSpec = {
    width: 1000,
    height: 200,
    title: 'Warming stripes',
    legend: 'bottom',
    colorAxis: anomalyScale,
    // Fixed ends, so the axis stops at the last stripe rather than rounding out to the next decade.
    axes: {
      x: { type: 'time', min: String(rows[0]!.year), max: String(latest.year + 1) },
      y: { type: 'band', categories: ['Year'], hidden: true },
    },
    series: [{ type: 'heatmap', name: 'Annual anomaly', data: rows.map((r) => [yearOf(r.year), 'Year', r.annual] as const) }],
  };
  const grid: ChartSpec = {
    width: 1000,
    height: 360,
    title: 'Monthly anomalies by year',
    legend: 'bottom',
    colorAxis: anomalyScale,
    // Fixed ends, as for the stripes: a free end rounds out to the next tick when a newly completed
    // year moves the window.
    axes: {
      x: { type: 'time', min: String(lastYears[0]!.year), max: String(latest.year + 1) },
      y: { type: 'band', categories: months },
    },
    series: [
      {
        type: 'heatmap',
        name: 'Monthly anomaly',
        data: lastYears.flatMap((r) => r.months.map((value, i) => [yearOf(r.year), months[i]!, value] as const)),
      },
    ],
  };
  return (
    heading(
      '02 · NASA GISS',
      'A warming record.',
      'A long view of a changing climate, drawn one year at a time. Global land–ocean temperature anomalies.',
      'GISTEMP v4 · baseline 1951–1980',
      climate.retrieved,
      `<label>View from <select id="climate-since">${[1880, 1950, 1970, 2000].map((y) => `<option ${since === y ? 'selected' : ''}>${y}</option>`).join('')}</select></label>`,
    ) +
    `<div class="metrics">${metric('LATEST COMPLETE YEAR', String(latest.year), 'Incomplete annual records are excluded')}${metric('ANNUAL ANOMALY', `${latest.annual! >= 0 ? '+' : ''}${pretty(latest.annual, 2)}<em>°C</em>`, 'Compared with the 1951–1980 mean', 'tint-coral')}${metric('CHANGE IN VIEW', `${change >= 0 ? '+' : ''}${pretty(change, 2)}<em>°C</em>`, `${earliest.year} to ${latest.year} · endpoint difference`)}${metric('WARMEST COMPLETE YEAR', String(warmest.year), `${pretty(warmest.annual, 2)}°C above the baseline`)}</div>
 <div class="dashboard-grid">${chartPanel('The long line', 'Annual global mean · degrees Celsius relative to 1951–1980', annual, 'wide')}${chartPanel('Stripes of change', 'One stripe per complete year · blue is cooler and red warmer than the 1951–1980 mean', stripes, 'wide')}${chartPanel('Decades, not days', 'Complete years in each decade · boxes span the middle half, the line marks the median · edge decades may be partial', decades)}${chartPanel('The shape of a year', 'Last three complete years · monthly anomalies in °C', monthly)}${chartPanel('Within each year', 'Monthly minimum–maximum envelope, not an uncertainty interval · °C', spread)}${chartPanel('The latest reading', '1951–1980 baseline · 0–2°C display scale, not a policy target', gauge)}${chartPanel('Beneath the noise', `Annual anomalies with a LOESS curve, span ${span} · a descriptive smoothing, not a forecast`, smooth, 'wide')}${chartPanel('Month by month', `Each cell is one month of the last 30 complete years, ${lastYears[0]!.year}–${latest.year} · the same colour scale as the stripes`, grid, 'wide')}</div>` +
    sourceNote(
      `NASA GISS/GISTEMP, <a href="https://data.giss.nasa.gov/gistemp/" target="_blank" rel="noreferrer">GISS Surface Temperature Analysis, version 4</a>. GISTEMP Team (2026); Lenssen et al. (2024), <a href="https://doi.org/10.1029/2023JD040179" target="_blank" rel="noreferrer">A GISTEMPv4 observational uncertainty ensemble</a>. Dataset accessed 2026-10-29. Values are anomalies, not absolute temperatures, and this baseline is not pre-industrial. Annual and monthly data may be revised by the source. <a href="${escape(climate.sourceUrl)}" target="_blank" rel="noreferrer">Original CSV ↗</a>`,
    )
  );
}
export function quakeDashboard() {
  const threshold = dashboardState.magnitude,
    events = quakes.rows.filter((x) => x.magnitude >= threshold);
  const strongest = events.length ? Math.max(...events.map((x) => x.magnitude)) : null;
  const depth = median(events.map((x) => x.depth));
  const counts = dailyCounts(events);
  // Magnitudes are reported in tenths, so bins centred on each tenth keep every value off an edge.
  const top = strongest ?? threshold;
  const edges = Array.from({ length: Math.round((top - threshold) * 10) + 2 }, (_, i) =>
    Number((threshold - 0.05 + i / 10).toFixed(2)),
  );
  // The magnitudes in each depth layer: the depth chart counts them, and the box chart draws the
  // layers that hold any.
  const layers = [
    { name: 'Below 70 km', from: -Infinity, to: 70 },
    { name: '70–299 km', from: 70, to: 300 },
    { name: '300 km or deeper', from: 300, to: Infinity },
  ].map(({ name, from, to }) => ({
    name,
    magnitudes: events.filter((e) => e.depth >= from && e.depth < to).map((e) => e.magnitude),
  }));
  const occupiedLayers = layers.filter((layer) => layer.magnitudes.length);
  const daily = chartSpec(
    'Daily earthquake counts',
    counts.map((x) => x.date.slice(5)),
    [{ type: 'bar', name: 'Events', color: colors[1], data: counts.map((x) => x.count) }],
    { width: 1000, height: 310 },
  );
  const magnitude = chartSpec(
    'Magnitude distribution',
    [],
    [{ type: 'histogram', name: 'Events', color: colors[0], edges, data: events.map((x) => x.magnitude) }],
    { axes: { x: { type: 'linear', title: 'Magnitude' }, y: { type: 'linear', grid: true, title: 'Events' } } },
  );
  const strength = boxChart(
    'Magnitude by depth',
    occupiedLayers.map((layer) => ({ name: layer.name, data: layer.magnitudes })),
    colors[2],
    { title: 'Magnitude' },
  );
  const depthChart: ChartSpec = {
    width: 660,
    height: 310,
    title: 'Magnitude and depth',
    legend: 'none',
    axes: {
      x: { type: 'linear', min: 4, max: Math.max(8, (strongest ?? 8) + 0.5), title: 'Magnitude' },
      y: { type: 'linear', min: Math.min(0, ...events.map((x) => x.depth)), title: 'Depth · km' },
    },
    style: { roughness: 0.5, fillStyle: 'solid' },
    series: [
      {
        type: 'scatter',
        name: 'Earthquakes',
        color: colors[2],
        data: events.map((x) => [x.magnitude, x.depth]),
      },
    ],
  };
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const hourly: ChartSpec = {
    width: 660,
    height: 370,
    title: 'Events by UTC hour',
    axes: { angle: { type: 'band', categories: hours } },
    series: [
      {
        type: 'rose',
        name: 'Events',
        color: colors[1],
        data: hours.map((h) => events.filter((e) => new Date(e.time).getUTCHours() === Number(h)).length),
      },
    ],
  };
  let accumulated = 0;
  const cumulative = chartSpec(
    'Accumulated observations',
    counts.map((r) => r.date.slice(5)),
    [{ type: 'area', name: 'Events', color: colors[2], data: counts.map((r) => (accumulated += r.count)) }],
  );
  const depths: ChartSpec = {
    width: 660,
    height: 370,
    title: 'Depth bands',
    series: [
      {
        type: 'pie',
        name: 'Events',
        innerRadius: 0.55,
        data: layers.map((layer) => ({ name: layer.name, value: layer.magnitudes.length })),
      },
    ],
  };
  const calendar: ChartSpec = {
    width: 660,
    height: 310,
    title: 'Events per day',
    colorAxis: { type: 'linear', title: 'Events' },
    series: [
      {
        type: 'calendar',
        name: 'Events',
        from: counts[0]!.date,
        to: counts.at(-1)!.date,
        data: counts.map((r) => [r.date, r.count] as const),
      },
    ],
  };
  // One square per event, so no class is rounded away. shortcut: a unit chart draws at most 2,000
  // units; revisit when a saved feed holds more than 2,000 events at the lowest threshold.
  const classes = [
    { name: 'M 4.5–4.9', from: 4.5, to: 5, color: colors[0] },
    { name: 'M 5.0–5.9', from: 5, to: 6, color: colors[1] },
    { name: 'M 6.0+', from: 6, to: Infinity, color: colors[2] },
  ];
  const squares: ChartSpec = {
    width: 660,
    height: 370,
    title: 'Events by magnitude class',
    legend: 'bottom',
    series: [
      {
        type: 'units',
        name: 'Events',
        display: 'waffle',
        columns: 40,
        // Only the classes the threshold leaves events in, each in its own colour at every threshold.
        data: classes
          .filter(({ to }) => to > threshold)
          .map(({ name, from, to, color }) => ({
            name,
            value: events.filter((e) => e.magnitude >= from && e.magnitude < to).length,
            color,
          })),
      },
    ],
  };
  return (
    heading(
      '03 · USGS',
      'Beneath the surface.',
      'A 30-day field notebook of earthquakes recorded around the world. Patterns in magnitude, time and depth.',
      'USGS Earthquake Hazards Program',
      quakes.retrieved,
      `<label>Minimum magnitude <select id="quake-magnitude">${[4.5, 5, 6, 7].map((m) => `<option value="${m}" ${m === threshold ? 'selected' : ''}>M ${m}+</option>`).join('')}</select></label>`,
    ) +
    `<div class="metrics">${metric('RECORDED EVENTS', pretty(events.length, 0), `Magnitude ${threshold}+ · saved feed`)}${metric('LARGEST MAGNITUDE', strongest === null ? '—' : `M ${pretty(strongest)}`, 'Magnitude types are supplied by USGS', 'tint-blue')}${metric('MEDIAN DEPTH', `${pretty(depth)} <em>km</em>`, 'Below the reference surface')}${metric('FEED WINDOW ENDS', day(quakes.generated).slice(5), 'UTC · archived snapshot, not live monitoring')}</div>
 <div class="dashboard-grid">${chartPanel('Thirty days of movement', 'Events per UTC day · current day may be incomplete', daily, 'wide')}${chartPanel('A sense of scale', 'Events in steps of 0.1 magnitude · magnitude is logarithmic', magnitude)}${events.length ? chartPanel('How deep, how strong?', 'Each point is one event · depth increases upward on this axis', depthChart) : '<article class="chart-panel empty"><h2>No events at this threshold.</h2><p>Choose a lower minimum magnitude.</p></article>'}
 ${chartPanel('Around the clock', 'UTC hour of origin · descriptive counts, not a daily risk forecast', hourly)}${chartPanel('The record grows', 'Cumulative event count across the saved feed window', cumulative)}${events.length ? chartPanel('Layers beneath us', 'Event counts grouped by reported depth', depths) + chartPanel('Strength at every depth', 'Magnitudes in each depth layer · boxes span the middle half · dots are events more than 1.5 box heights beyond the box', strength) + chartPanel('On the calendar', 'Events per UTC day · weeks start on Monday · the first and last days may be partial', calendar) + chartPanel('One square, one event', 'Every event in the saved feed at this threshold, by reported magnitude', squares) : ''}</div>` +
    sourceNote(
      `U.S. Geological Survey, <a href="https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php" target="_blank" rel="noreferrer">M4.5+ 30-day GeoJSON feed</a>. USGS-produced data are in the U.S. public domain. Feed generated ${escape(new Date(quakes.generated).toISOString())}. The download preserves the source URL, feed generation time and selected fields. Event estimates may change; this saved demo is not a real-time alert or safety service. The first and last UTC days may represent partial days. <a href="${escape(quakes.sourceUrl)}" target="_blank" rel="noreferrer">Original feed ↗</a>`,
    )
  );
}
