import type { Point, Shape, SketchStyle } from '@borrowdale/core';
import { cos, sin } from '@borrowdale/core/math';
import type { Drawing, SeedKey } from './drawing.js';
import type { ChartNode, Marker, MarkerSymbol } from './types.js';

/** The image reference stays plain data; only the renderer receives trusted assets. */
export function markerNode(
  drawing: Drawing, marker: Marker, center: Point, size: number,
  style: SketchStyle, key: SeedKey, own: SketchStyle,
): ChartNode {
  if (typeof marker !== 'string') {
    return { kind: 'image', asset: marker.image, x: center[0] - size / 2,
      y: center[1] - size / 2, width: size, height: size };
  }
  return marker === 'tick'
    ? drawing.outline(symbolShape(marker, center, size), style, key, own)
    : drawing.shape(symbolShape(marker, center, size), style, key, own);
}

/** A marker inside the square centred at `center`, with side `size`. */
export function symbolShape(symbol: MarkerSymbol, [cx, cy]: Point, size: number): Shape {
  const radius = size / 2;
  const polygon = (points: readonly Point[]): Shape => ({
    kind: 'polygon',
    points: points.map(([x, y]) => [cx + x * radius, cy + y * radius]),
  });
  switch (symbol) {
    case 'circle':
      return { kind: 'circle', cx, cy, diameter: size };
    case 'square':
      return { kind: 'rectangle', x: cx - radius, y: cy - radius, width: size, height: size };
    case 'diamond':
      return polygon([[0, -1], [1, 0], [0, 1], [-1, 0]]);
    case 'triangle':
      return polygon([[0, -1], [1, 1], [-1, 1]]);
    case 'cross':
      return polygon([
        [-1 / 3, -1], [1 / 3, -1], [1 / 3, -1 / 3], [1, -1 / 3],
        [1, 1 / 3], [1 / 3, 1 / 3], [1 / 3, 1], [-1 / 3, 1],
        [-1 / 3, 1 / 3], [-1, 1 / 3], [-1, -1 / 3], [-1 / 3, -1 / 3],
      ]);
    case 'star':
      return polygon(Array.from({ length: 10 }, (_, i): Point => {
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        const reach = i % 2 === 0 ? 1 : 0.4;
        return [cos(angle) * reach, sin(angle) * reach];
      }));
    case 'wye':
      return polygon(Array.from({ length: 9 }, (_, i): Point => {
        const arm = Math.floor(i / 3);
        const corner = i % 3;
        const angle = -Math.PI / 2 + arm * 2 * Math.PI / 3;
        const [along, across] = corner === 0 ? [1, -0.2] : corner === 1 ? [1, 0.2] : [0.2, 0.2];
        // Divide by the furthest possible corner distance so every orientation fits.
        return [(cos(angle) * along - sin(angle) * across) / 1.02,
          (sin(angle) * along + cos(angle) * across) / 1.02];
      }));
    case 'tick':
      return { kind: 'line', x1: cx, y1: cy - radius, x2: cx, y2: cy + radius };
  }
}
