import { expect, it } from 'vitest';
import type * as Charts from '@borrowdale/charts';
import { evaluateInChromium } from '../../core/test/support/chromium.js';

it('keeps zero-width segments invisible on Canvas as in SVG', async () => {
  const result = await evaluateInChromium(new URL('../src/index.ts', import.meta.url), 'charts', '', async () => {
    const api = (globalThis as unknown as { charts: typeof Charts }).charts;
    const layout = api.layoutChart({ width: 64, height: 64, legend: 'none', style: { roughness: 0 },
      axes: { x: { type: 'linear', min: 0, max: 1, hidden: true }, y: { type: 'linear', min: 0, max: 1, hidden: true } },
      series: [{ type: 'xyLine', name: 'zero', data: [[0, 0.5], [1, 0.5]], segments: [{ width: 0 }] }] });
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.lineWidth = 10;
    api.drawChart(context, layout);
    const native = [...context.getImageData(32, 32, 1, 1).data];
    const width = context.lineWidth;
    const source = new Image();
    source.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(api.toSvgChart(layout))}`;
    await source.decode();
    context.clearRect(0, 0, 64, 64); context.drawImage(source, 0, 0);
    return { native, exported: [...context.getImageData(32, 32, 1, 1).data], width };
  }, undefined);
  expect(result.exported).toEqual([0, 0, 0, 0]);
  expect(result.native).toEqual(result.exported);
  expect(result.width).toBe(10);
}, 120_000);

it('renders preloaded images and continuous gradients on native Canvas and SVG', async () => {
  const result = await evaluateInChromium(new URL('../src/index.ts', import.meta.url), 'charts', '', async () => {
    const api = (globalThis as unknown as { charts: typeof Charts }).charts;
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext('2d')!;
    const source = document.createElement('canvas'); source.width = 1; source.height = 1;
    source.getContext('2d')!.fillStyle = '#00ff00'; source.getContext('2d')!.fillRect(0, 0, 1, 1);
    const assets = { images: new Map([['green', { dataUrl: source.toDataURL(), source }]]) };
    const axes = { x: { type: 'linear' as const, min: 0, max: 1, hidden: true }, y: { type: 'linear' as const, min: 0, max: 1, hidden: true } };
    const image = api.layoutChart({ width: 64, height: 64, legend: 'none', axes,
      series: [{ type: 'scatter', name: 'S', data: [[0.5, 0.5]], symbol: { image: 'green' } }] });
    api.drawChart(context, image, assets);
    const canvasImage = [...context.getImageData(32, 32, 1, 1).data];
    const svgSource = new Image();
    svgSource.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(api.toSvgChart(image, assets))}`;
    await svgSource.decode();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    context.clearRect(0, 0, 64, 64); context.drawImage(svgSource, 0, 0);
    const svgImage = [...context.getImageData(32, 32, 1, 1).data];
    const gradient = api.layoutChart({ width: 64, height: 64, legend: 'none', axes, style: { roughness: 0, strokeWidth: 12 },
      series: [{ type: 'xyLine', name: 'G', data: [[0, 0.5], [1, 0.5]], gradient: { axis: 'x', stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] } }] });
    context.clearRect(0, 0, 64, 64); context.strokeStyle = '#00ff00'; context.lineWidth = 7;
    api.drawChart(context, gradient);
    const left = [...context.getImageData(18, 32, 1, 1).data];
    const right = [...context.getImageData(46, 32, 1, 1).data];
    const state = [context.strokeStyle, context.lineWidth];
    const first = api.appendChart(document.body, gradient);
    const second = api.appendChart(document.body, gradient);
    return { canvasImage, svgImage, left, right, state,
      ids: [first.querySelector('linearGradient')!.id, second.querySelector('linearGradient')!.id] };
  }, undefined);
  expect(result.canvasImage).toEqual([0, 255, 0, 255]);
  expect(result.svgImage).toEqual(result.canvasImage);
  expect(result.left[0]).toBeGreaterThan(result.left[2]!);
  expect(result.right[2]).toBeGreaterThan(result.right[0]!);
  expect(result.state).toEqual(['#00ff00', 7]);
  expect(result.ids[0]).not.toBe(result.ids[1]);
}, 120_000);
