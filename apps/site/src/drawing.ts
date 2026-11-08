import { sketch, toSvgSketch, type Shape, type SketchOptions } from '@borrowdale/core';
import { layoutChart, toSvgChart, drawChart, type ChartSpec, type ChartImage } from '@borrowdale/charts';
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
export const exampleSeed = (original?: string | number) => original === undefined ? seed : `${seed}:${original}`;
export function shapeSvg(shape: Shape, options: SketchOptions = {}, width = 300, height = 180, fit = false) {
  return `<svg ${fit ? 'data-fit' : ''} viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(shape.kind)} drawing">${toSvgSketch(sketch(shape, { stroke: '#263b33', ...options, seed: exampleSeed(options.seed) }))}</svg>`;
}
// Draws with exactly the seed given, whatever the page's re-sketch seed: for a drawing that must
// always match a file, such as the header mark and `public/favicon.svg`.
export function fixedShapeSvg(shape: Shape, options: SketchOptions & { seed: number }, width: number, height: number) {
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(shape.kind)} drawing">${toSvgSketch(sketch(shape, { stroke: '#263b33', ...options }))}</svg>`;
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
  const p = pattern({ ...options, seed: exampleSeed(options.seed) });
  return `<svg viewBox="0 0 300 160" role="img" aria-label="${escape(options.kind)} pattern"><defs>${p.def}</defs><rect width="300" height="160" fill="${p.fill}"/></svg>`;
}
const pending = new Map<string, { spec: ChartSpec; images: Map<string, ChartImage> }>();
let chartId = 0;
export function chart(spec: ChartSpec, renderer: 'svg' | 'canvas' = 'svg', assets: Record<string, string> = {}) {
  const images = new Map(Object.entries(assets).map(([name, dataUrl]) => [name, { dataUrl }]));
  const resolved = { ...spec, seed };
  if (renderer === 'canvas') {
    const id = `chart-${++chartId}`;
    pending.set(id, { spec: resolved, images });
    return `<canvas id="${id}" width="${spec.width * 2}" height="${spec.height * 2}" role="img" aria-label="${escape(spec.title ?? 'Chart preview')}"></canvas>`;
  }
  return toSvgChart(layoutChart(resolved), { images, idPrefix: `site-chart-${++chartId}` });
}
export function hydrateDrawings() {
  for (const [id, { spec, images }] of pending) {
    const canvas = document.getElementById(id) as HTMLCanvasElement | null;
    if (!canvas) continue;
    const draw = async () => {
      for (const asset of images.values()) {
        const source = new Image();
        source.src = asset.dataUrl;
        await source.decode();
        asset.source = source;
      }
      if (!canvas.isConnected) return;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas rendering is unavailable.');
      context.scale(2, 2);
      drawChart(context, layoutChart(spec), { images });
    };
    void draw().catch(() => {
      if (!canvas.isConnected) return;
      const message = document.createElement('p');
      message.className = 'render-error';
      message.textContent = 'Could not render this Canvas preview. Try SVG or reload to retry.';
      canvas.replaceWith(message);
    });
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
