// Render the time, log, square-root, Gantt and timeline examples as standalone SVG documents with
// their font embedded. Usage: npm run build && node apps/examples/time.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { layoutChart, toSvgChart } from '@borrowdale/charts';
import { excalifontFiles } from '@borrowdale/text/excalifont-files';
import cases from './time-cases.json' with { type: 'json' };

const directory = new URL('./out/', import.meta.url);
mkdirSync(directory, { recursive: true });
for (const { name, spec } of cases) {
  const svg = toSvgChart(layoutChart(spec), { fontFiles: excalifontFiles, idPrefix: name });
  writeFileSync(new URL(`${name}.svg`, directory), svg);
  console.log(name);
}
