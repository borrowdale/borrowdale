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
} from './data';
import { chart, chartSpec, colors, escape } from './drawing';
import { codeBlock, chartCode } from './gallery';
import type { ChartSpec } from '@borrowdale/charts';
export const dashboardState = { year: 2023, country: 'HUN', since: 1970, magnitude: 4.5 };
const number = (value: number) => value.toLocaleString('en', { maximumFractionDigits: 2 });
// The categories a series of plain values is drawn against, from whichever axis is the band axis.
function categoriesOf(spec: ChartSpec): readonly string[] {
  const axes = (spec as { axes?: Record<string, { type?: string; categories?: readonly string[] }> }).axes ?? {};
  return Object.values(axes).find((axis) => axis.type === 'band')?.categories ?? [];
}
// One row per drawn value, so the numbers behind a chart can be read without seeing it.
function dataRows(spec: ChartSpec) {
  const categories = categoriesOf(spec);
  return spec.series.flatMap((series) => {
    if (series.type === 'gauge') return [[series.name, '', number(series.value)]];
    if (series.type === 'pie') return series.data.map((slice) => [series.name, slice.name, number(slice.value)]);
    return (series.data as readonly (number | null | readonly number[])[]).map((value, i) => [
      series.name,
      categories[i] ?? String(i + 1),
      value === null ? 'No data' : typeof value === 'number' ? number(value) : value.map(number).join(' · '),
    ]);
  });
}
function dataTable(title: string, spec: ChartSpec) {
  const rows = dataRows(spec)
    .map(([series, point, value]) => `<tr><th scope="row">${escape(series)}</th><td>${escape(point)}</td><td>${value}</td></tr>`)
    .join('');
  return `<details class="dashboard-code dashboard-data"><summary>View data</summary><div class="table-scroll"><table><caption class="visually-hidden">${escape(title)} data</caption><thead><tr><th scope="col">Series</th><th scope="col">Point</th><th scope="col">Value</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}
export function chartPanel(title: string, note: string, spec: ChartSpec, extra = '') {
  return `<article class="chart-panel ${extra}"><header><div><h2>${escape(title)}</h2><p>${escape(note)}</p></div><span class="chart-mark">↗</span></header><p class="chart-scroll-hint">Swipe or scroll sideways to explore the chart →</p><div class="chart-view" tabindex="0" role="region" aria-label="${escape(title)} chart">${chart(spec)}</div>${dataTable(title, spec)}<details class="dashboard-code"><summary>View chart code <span>⌘</span></summary>${codeBlock(chartCode(spec))}</details></article>`;
}
function metric(label: string, value: string, note: string, accent = '') {
  return `<article class="metric ${accent}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
}
function heading(kicker: string, title: string, desc: string, source: string, controls: string) {
  return `<div class="dashboard-heading"><div><p class="eyebrow">${kicker} / OPEN DATA NOTEBOOK</p><h1>${title}</h1><p>${desc}</p></div><div class="snapshot"><span class="status-dot"></span> Saved snapshot<small>Retrieved 29 Oct 2026</small></div></div><div class="dashboard-toolbar"><span>${source}</span><div>${controls}<button class="button small" id="download-data">↓ Download data</button></div></div>`;
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
  const years = Array.from({ length: 15 }, (_, i) => 2010 + i);
  const controls = `<label>Year <select id="world-year">${years.map((y) => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select></label><label>Country <select id="world-country">${countries.map((c) => `<option value="${c.code}" ${country === c.code ? 'selected' : ''}>${escape(c.name)}</option>`).join('')}</select></label>`;
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
    series: complete.map((r, i) => ({
      type: 'bubble',
      name: r.name,
      color: colors[i % colors.length],
      data: [[r.gdp! / 1000, r.life!, r.population! / 1e6]],
    })),
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
  return (
    heading(
      '01 · WORLD BANK',
      'A wider world.',
      'Different economies. Shared questions. Explore income, longevity and population across 12 countries.',
      'World Development Indicators',
      controls,
    ) +
    `<div class="metrics">${metric('COUNTRIES IN VIEW', String(rows.length), 'A selected comparison, not the whole world')}${metric('COMBINED POPULATION', compact(population), `${year} · available observations`)}${metric('MEDIAN LIFE EXPECTANCY', `${pretty(life)} <em>years</em>`, 'Unweighted country median', 'tint-green')}${metric('COMPLETE OBSERVATIONS', `${complete.length} / ${rows.length}`, 'Income + life expectancy + population')}</div>
 <div class="dashboard-grid">${chartPanel('The income picture', 'Current US$ per person · bars use thousands', rank)}${chartPanel('More than an income', 'Bubble area represents population · each bubble is one country', scatter)}${chartPanel('A longer perspective', `${selected.name} · 2010–2024 · gaps are missing observations`, trend, 'wide')}
 ${chartPanel('People in perspective', 'Share of population among these 12 countries only', share)}${profileKeys.every((k) => rows.find((r) => r.code === country)![k] !== null) ? chartPanel('Three dimensions', 'Each measure is relative to the highest of the 12 countries (100).', profile) : '<article class="chart-panel empty"><h2>Profile unavailable</h2><p>One or more measures are missing for this country and year.</p></article>'}</div>` +
    sourceNote(
      `World Bank, <a href="https://datacatalog.worldbank.org/infrastructure-data/search/dataset/0037712/world-development-indicators" target="_blank" rel="noreferrer">World Development Indicators</a>, CC BY 4.0. Indicators: NY.GDP.PCAP.CD, SP.DYN.LE00.IN and SP.POP.TOTL. GDP is in current US dollars, not adjusted for purchasing power or inflation. Missing values stay missing. Bubble positions use complete observations only; the selected-country median is not a population-weighted global estimate. <a href="${escape(world.sourceUrl)}" target="_blank" rel="noreferrer">Original API query ↗</a>`,
    )
  );
}
export function climateDashboard() {
  const since = dashboardState.since,
    rows = completedYears.filter((x) => x.year >= since),
    latest = completedYears.at(-1)!;
  const earliest = rows[0],
    change = latest.annual! - earliest.annual!;
  const warmest = [...completedYears].sort((a, b) => b.annual! - a.annual!)[0];
  const recent = completedYears.slice(-3),
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const decs = [...new Set(rows.map((r) => Math.floor(r.year / 10) * 10))];
  const mean = decs.map((d) => {
    const rs = rows.filter((r) => r.year >= d && r.year < d + 10);
    return rs.reduce((s, r) => s + r.annual!, 0) / rs.length;
  });
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
  const decades = chartSpec(
    'Decade averages',
    decs.map((d) => `${d}s`),
    [{ type: 'bar', name: 'Mean anomaly', color: colors[3], data: mean }],
  );
  const monthly: ChartSpec = {
    width: 660,
    height: 370,
    title: 'Monthly anomalies',
    legend: 'top',
    axes: {
      angle: { type: 'band', categories: months },
      radius: { type: 'linear', min: 0, format: { suffix: '°C' } },
    },
    series: recent.map((r, i) => ({
      type: i === 0 ? 'polarArea' : 'polarLine',
      name: String(r.year),
      color: colors[[1, 0, 3][i]],
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
    axes: { angle: { type: 'linear', min: 0, max: 2, format: { suffix: '°C' } } },
    series: [{ type: 'gauge', name: 'Anomaly', color: colors[3], value: latest.annual! }],
  };
  return (
    heading(
      '02 · NASA GISS',
      'A warming record.',
      'A long view of a changing climate, drawn one year at a time. Global land–ocean temperature anomalies.',
      'GISTEMP v4 · baseline 1951–1980',
      `<label>View from <select id="climate-since">${[1880, 1950, 1970, 2000].map((y) => `<option ${since === y ? 'selected' : ''}>${y}</option>`).join('')}</select></label>`,
    ) +
    `<div class="metrics">${metric('LATEST COMPLETE YEAR', String(latest.year), 'Incomplete annual records are excluded')}${metric('ANNUAL ANOMALY', `${latest.annual! >= 0 ? '+' : ''}${pretty(latest.annual, 2)}<em>°C</em>`, 'Compared with the 1951–1980 mean', 'tint-coral')}${metric('CHANGE IN VIEW', `${change >= 0 ? '+' : ''}${pretty(change, 2)}<em>°C</em>`, `${earliest.year} to ${latest.year} · endpoint difference`)}${metric('WARMEST COMPLETE YEAR', String(warmest.year), `${pretty(warmest.annual, 2)}°C above the baseline`)}</div>
 <div class="dashboard-grid">${chartPanel('The long line', 'Annual global mean · degrees Celsius relative to 1951–1980', annual, 'wide')}${chartPanel('Decades, not days', 'Arithmetic mean of available complete years · edge decades may be partial', decades)}${chartPanel('The shape of a year', 'Last three complete years · monthly anomalies in °C', monthly)}${chartPanel('Within each year', 'Monthly minimum–maximum envelope, not an uncertainty interval · °C', spread)}${chartPanel('The latest reading', '1951–1980 baseline · 0–2°C display scale, not a policy target', gauge)}</div>` +
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
  const bins = ['4.5–4.9', '5.0–5.9', '6.0–6.9', '7.0+'];
  const magnitudes = [
    events.filter((x) => x.magnitude < 5).length,
    events.filter((x) => x.magnitude >= 5 && x.magnitude < 6).length,
    events.filter((x) => x.magnitude >= 6 && x.magnitude < 7).length,
    events.filter((x) => x.magnitude >= 7).length,
  ];
  const daily = chartSpec(
    'Daily earthquake counts',
    counts.map((x) => x.date.slice(5)),
    [{ type: 'bar', name: 'Events', color: colors[1], data: counts.map((x) => x.count) }],
    { width: 1000, height: 310 },
  );
  const magnitude = chartSpec('Magnitude distribution', bins, [
    { type: 'bar', name: 'Events', color: colors[0], data: magnitudes },
  ]);
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
        data: [
          { name: 'Below 70 km', value: events.filter((e) => e.depth < 70).length },
          { name: '70–299 km', value: events.filter((e) => e.depth >= 70 && e.depth < 300).length },
          { name: '300 km or deeper', value: events.filter((e) => e.depth >= 300).length },
        ],
      },
    ],
  };
  return (
    heading(
      '03 · USGS',
      'Beneath the surface.',
      'A 30-day field notebook of earthquakes recorded around the world. Patterns in magnitude, time and depth.',
      'USGS Earthquake Hazards Program',
      `<label>Minimum magnitude <select id="quake-magnitude">${[4.5, 5, 6, 7].map((m) => `<option value="${m}" ${m === threshold ? 'selected' : ''}>M ${m}+</option>`).join('')}</select></label>`,
    ) +
    `<div class="metrics">${metric('RECORDED EVENTS', pretty(events.length, 0), `Magnitude ${threshold}+ · saved feed`)}${metric('LARGEST MAGNITUDE', strongest === null ? '—' : `M ${pretty(strongest)}`, 'Magnitude types are supplied by USGS', 'tint-blue')}${metric('MEDIAN DEPTH', `${pretty(depth)} <em>km</em>`, 'Below the reference surface')}${metric('FEED WINDOW ENDS', day(quakes.generated).slice(5), 'UTC · archived snapshot, not live monitoring')}</div>
 <div class="dashboard-grid">${chartPanel('Thirty days of movement', 'Events per UTC day · current day may be incomplete', daily, 'wide')}${chartPanel('A sense of scale', 'Counts by magnitude band · magnitude is logarithmic', magnitude)}${events.length ? chartPanel('How deep, how strong?', 'Each point is one event · depth increases upward on this axis', depthChart) : '<article class="chart-panel empty"><h2>No events at this threshold.</h2><p>Choose a lower minimum magnitude.</p></article>'}
 ${chartPanel('Around the clock', 'UTC hour of origin · descriptive counts, not a daily risk forecast', hourly)}${chartPanel('The record grows', 'Cumulative event count across the saved feed window', cumulative)}${events.length ? chartPanel('Layers beneath us', 'Event counts grouped by reported depth', depths) : ''}</div>` +
    sourceNote(
      `U.S. Geological Survey, <a href="https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php" target="_blank" rel="noreferrer">M4.5+ 30-day GeoJSON feed</a>. USGS-produced data are in the U.S. public domain. Feed generated ${escape(new Date(quakes.generated).toISOString())}. The download preserves the source URL, feed generation time and selected fields. Event estimates may change; this saved demo is not a real-time alert or safety service. The first and last UTC days may represent partial days. <a href="${escape(quakes.sourceUrl)}" target="_blank" rel="noreferrer">Original feed ↗</a>`,
    )
  );
}
