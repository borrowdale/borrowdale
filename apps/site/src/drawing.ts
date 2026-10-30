import { sketch, toSvgPaths, type Shape, type SketchOptions } from '@borrowdale/core';
import { layoutChart, toSvgChart, drawChart, type ChartSpec } from '@borrowdale/charts';
import { pattern, type PatternOptions } from '@borrowdale/fills';
import { layoutText, textBounds, toSvgText, type LayoutOptions } from '@borrowdale/text';

export const colors = ['#de9b24', '#397e92', '#3b7662', '#bd6556', '#7b79a3', '#8c8a50'];
export const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export let seed = 7;
export function reseed() {
  seed += 1;
}
export function shapeSvg(shape: Shape, options: SketchOptions = {}, width = 300, height = 180, fit = false) {
  return `<svg ${fit ? 'data-fit' : ''} viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(shape.kind)} drawing">${toSvgPaths(sketch(shape, { seed, stroke: '#263b33', ...options }))}</svg>`;
}
// Hides an ornamental drawing from assistive technology, so it adds nothing to the name of the link or
// button around it.
export function decorative(svg: string) {
  return svg.replace(/ role="img" aria-label="[^"]*"/, ' aria-hidden="true" focusable="false"');
}
export function scribble(width = 260, height = 64, fill = '#f0c557') {
  return decorative(
    shapeSvg(
      { kind: 'rectangle', x: 3, y: 3, width: width - 6, height: height - 6 },
      { fill, fillStyle: 'solid', roughness: 0.8 },
      width,
      height,
    ),
  );
}
export function textSvg(text: string, options: LayoutOptions) {
  const layout = layoutText(text, options),
    box = textBounds(layout);
  return {
    svg: `<svg viewBox="${box.x - 12} ${box.y - 12} ${Math.max(box.width + 24, 40)} ${Math.max(box.height + 24, 40)}" role="img" aria-label="${escape(layout.text)}">${toSvgText(layout, { fill: '#263b33' })}</svg>`,
    missing: layout.missing,
  };
}
export function patternSvg(options: PatternOptions) {
  const p = pattern(options);
  return `<svg viewBox="0 0 300 160" role="img" aria-label="${escape(options.kind)} pattern"><defs>${p.def}</defs><rect width="300" height="160" fill="${p.fill}"/></svg>`;
}
const pending = new Map<string, ChartSpec>();
let chartId = 0;
export function chart(spec: ChartSpec, renderer: 'svg' | 'canvas' = 'svg') {
  const resolved = { ...spec, seed };
  if (renderer === 'canvas') {
    const id = `chart-${++chartId}`;
    pending.set(id, resolved);
    return `<canvas id="${id}" width="${spec.width * 2}" height="${spec.height * 2}" role="img" aria-label="${escape(spec.title ?? 'Chart preview')}"></canvas>`;
  }
  return toSvgChart(layoutChart(resolved));
}
export function hydrateDrawings() {
  for (const [id, spec] of pending) {
    const canvas = document.getElementById(id) as HTMLCanvasElement | null;
    if (canvas) {
      const context = canvas.getContext('2d')!;
      context.scale(2, 2);
      drawChart(context, layoutChart({ ...spec, seed }));
    }
  }
  pending.clear();
  document.querySelectorAll<SVGSVGElement>('svg[data-fit]').forEach((svg) => {
    const b = svg.getBBox();
    svg.setAttribute(
      'viewBox',
      `${b.x - 4} ${b.y - 4} ${Math.max(b.width + 8, 12)} ${Math.max(b.height + 8, 12)}`,
    );
  });
}
export function download(name: string, contents: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function chartSpec(
  title: string,
  categories: string[],
  series: ChartSpec['series'],
  extra: Partial<ChartSpec> = {},
): ChartSpec {
  return {
    width: 660,
    height: 310,
    title,
    // Name the series whenever there is more than one, so they are never told apart by colour alone.
    legend: series.length > 1 ? 'top' : 'none',
    fontSize: 12,
    axes: { x: { type: 'band', categories }, y: { type: 'linear', grid: true } },
    style: { roughness: 0.8, fillStyle: 'solid' },
    series,
    ...extra,
  } as ChartSpec;
}
