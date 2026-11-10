import type { Point } from '@borrowdale/core';
import { valueReader, type CheckedAxis } from './check-axis.js';
import type { Drawing } from './drawing.js';
import type { Rect } from './frame.js';
import { fail, fields, list, oneOf, text, type Check, type Fields } from './read.js';
import type { Annotation, ChartValue, ChartPosition } from './types.js';

type AxisKey = 'x' | 'y' | 'y2';
export type CheckedAnnotation = Annotation & { path: string; color: string; layer: 'back' | 'front' };

export function checkAnnotations(r: Fields, axes: Record<AxisKey, CheckedAxis | undefined>, color: Check<string>): CheckedAnnotation[] {
  const coordinate = (axis: AxisKey): Check<ChartValue> => (path, raw) => {
    const target = axes[axis];
    if (!target) return fail(path, `needs axes.${axis}`);
    if (target.type === 'linear') return valueReader(target.kind)(path, raw);
    const name = text(100)(path, raw);
    if (!target.categories.includes(name)) fail(path, `is not a category of axes.${axis}`);
    return name;
  };
  const position = (axis: 'y' | 'y2'): Check<ChartPosition> => (path, raw) => {
    const values = list(2, 2, (p, value, i) => coordinate(i === 0 ? 'x' : axis)(p, value))(path, raw);
    return [values[0]!, values[1]!];
  };
  return r.optional('annotations', list(0, 100, (path, raw): CheckedAnnotation => {
    const item = fields(path, raw);
    const type = item.required('type', oneOf(['line', 'band', 'region', 'arrow', 'label'] as const));
    const keys = type === 'line' ? ['axis', 'value', 'label'] : type === 'band' ? ['axis', 'from', 'to']
      : type === 'label' ? ['axis', 'at', 'text'] : ['axis', 'from', 'to'];
    item.allow(['type', 'color', 'layer', ...keys]);
    const base = { path, color: item.optional('color', color) ?? (type === 'band' || type === 'region' ? '#e8eef5' : '#555'),
      layer: item.optional('layer', oneOf(['back', 'front'] as const)) ?? (type === 'band' || type === 'region' ? 'back' : 'front') };
    if (type === 'line' || type === 'band') {
      const axis = item.required('axis', oneOf(['x', 'y', 'y2'] as const));
      return type === 'line'
        ? { ...base, type, axis, value: item.required('value', coordinate(axis)), label: item.optional('label', text()) }
        : { ...base, type, axis, from: item.required('from', coordinate(axis)), to: item.required('to', coordinate(axis)) };
    }
    const axis = item.optional('axis', oneOf(['y', 'y2'] as const)) ?? 'y';
    return type === 'label'
      ? { ...base, type, axis, at: item.required('at', position(axis)), text: item.required('text', text()) }
      : { ...base, type, axis, from: item.required('from', position(axis)), to: item.required('to', position(axis)) };
  })) ?? [];
}

/** Coordinates in data space, before scales are fitted. */
export function annotationValues(entry: CheckedAnnotation): { axis: AxisKey; value: ChartValue }[] {
  if (entry.type === 'line') return [{ axis: entry.axis, value: entry.value }];
  if (entry.type === 'band') return [entry.from, entry.to].map((value) => ({ axis: entry.axis, value }));
  const points = entry.type === 'label' ? [entry.at] : [entry.from, entry.to];
  return points.flatMap(([x, y]) => [{ axis: 'x', value: x }, { axis: entry.axis ?? 'y', value: y }]);
}

export function drawAnnotations(
  drawing: Drawing, entries: readonly CheckedAnnotation[], layer: 'back' | 'front', rect: Rect,
  at: (axis: AxisKey, value: ChartValue) => number,
): void {
  entries.forEach((entry, i) => {
    if (entry.layer !== layer) return;
    const key = ['annotation', i];
    const style = { stroke: entry.color, strokeWidth: 1 };
    const point = ([x, y]: ChartPosition): Point => [at('x', x), at(entry.axis ?? 'y', y)];
    if (entry.type === 'label') {
      const [x, y] = point(entry.at);
      drawing.push(drawing.label(entry.text, x, y, rect, entry.path));
    } else if (entry.type === 'line') {
      const value = at(entry.axis, entry.value);
      const from: Point = entry.axis === 'x' ? [value, rect.top] : [rect.left, value];
      const to: Point = entry.axis === 'x' ? [value, rect.bottom] : [rect.right, value];
      drawing.push(drawing.outline({ kind: 'linearPath', points: [from, to] }, style, key));
      if (entry.label) drawing.push(drawing.label(entry.label, to[0], to[1], rect, entry.path));
    } else if (entry.type === 'arrow') {
      const from = point(entry.from), to = point(entry.to);
      const dx = to[0] - from[0], dy = to[1] - from[1];
      const length = Math.sqrt(dx * dx + dy * dy);
      const head = Math.min(8, length / 2);
      const ux = length ? dx / length : 0, uy = length ? dy / length : 0;
      const left: Point = [to[0] - head * ux - head * uy / 2, to[1] - head * uy + head * ux / 2];
      const right: Point = [to[0] - head * ux + head * uy / 2, to[1] - head * uy - head * ux / 2];
      drawing.push(drawing.outline({ kind: 'linearPath', points: [from, to] }, style, key),
        drawing.outline({ kind: 'linearPath', points: [left, to, right] }, style, [...key, 'head']));
    } else {
      let from: Point, to: Point;
      if (entry.type === 'region') {
        from = point(entry.from); to = point(entry.to);
      } else {
        const a = at(entry.axis, entry.from), b = at(entry.axis, entry.to);
        from = entry.axis === 'x' ? [a, rect.top] : [rect.left, a];
        to = entry.axis === 'x' ? [b, rect.bottom] : [rect.right, b];
      }
      drawing.push(drawing.shape({ kind: 'rectangle', x: Math.min(from[0], to[0]), y: Math.min(from[1], to[1]),
        width: Math.abs(to[0] - from[0]), height: Math.abs(to[1] - from[1]) },
        { stroke: 'none', fill: entry.color, fillStyle: 'solid' }, key));
    }
  });
}
