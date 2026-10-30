// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { drawChart } from '@borrowdale/charts';
import { chart, hydrateDrawings } from '../src/drawing';
import { presentationExamples } from '../src/chart-examples';

vi.mock('@borrowdale/charts', async (original) => ({
  ...await original<typeof import('@borrowdale/charts')>(),
  drawChart: vi.fn(),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(drawChart).mockClear();
  document.body.innerHTML = '';
});
function preview(decode: () => Promise<void>) {
  vi.stubGlobal('Image', class { src = ''; decode = decode; });
  const entry = presentationExamples.find((e) => e.name === 'image-markers')!;
  document.body.innerHTML = chart(entry.spec, 'canvas', entry.images);
  const canvas = document.querySelector('canvas')!;
  const scale = vi.fn();
  vi.spyOn(canvas, 'getContext').mockReturnValue({ scale } as unknown as CanvasRenderingContext2D);
  hydrateDrawings();
  return { canvas, scale };
}
it('waits for image decoding before passing the source to Canvas', async () => {
  let finish!: () => void;
  const { scale } = preview(() => new Promise<void>((resolve) => { finish = resolve; }));
  expect(drawChart).not.toHaveBeenCalled();
  finish();
  await vi.waitFor(() => expect(drawChart).toHaveBeenCalledOnce());
  const images = vi.mocked(drawChart).mock.calls[0]![2]!.images!;
  expect(images.get('badge')!.source).toBeDefined();
  expect(images.get('badge')!.dataUrl).toMatch(/^data:image\/png;base64,/);
  expect(scale).toHaveBeenCalledExactlyOnceWith(2, 2);
});
it('does not draw a preview removed during decoding', async () => {
  let finish!: () => void;
  const { canvas } = preview(() => new Promise<void>((resolve) => { finish = resolve; }));
  canvas.remove();
  finish();
  await Promise.resolve();
  await Promise.resolve();
  expect(drawChart).not.toHaveBeenCalled();
});
it('shows a recoverable error when an asset fails to decode', async () => {
  preview(() => Promise.reject(new Error('Invalid image')));
  await vi.waitFor(() => expect(document.querySelector('.render-error')?.textContent).toContain('Try SVG'));
  expect(drawChart).not.toHaveBeenCalled();
  expect(document.querySelector('canvas')).toBeNull();
});
