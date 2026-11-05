// Place circles against neighbours at their final screen coordinates. Each neighbour excludes an
// interval of possible offsets along the group axis. The nearest free offset gives a compact swarm.
export function swarmOffset(
  value: number,
  radius: number,
  placed: readonly Circle[],
  mirrored: boolean,
  min: number,
  max: number,
  circular = true,
): number | undefined {
  const blocked: [number, number][] = [];
  for (const circle of placed) {
    const delta = value - circle.value;
    const gap = circle.radius + radius + 1;
    if (Math.abs(delta) >= gap) continue;
    const side = circular ? Math.sqrt(gap * gap - delta * delta) : gap;
    blocked.push([circle.offset - side, circle.offset + side]);
  }
  blocked.sort((a, b) => a[0] - b[0]);
  let low = Math.max(min, mirrored ? -Infinity : 0);
  let best: number | undefined;
  const consider = (left: number, right: number) => {
    if (left > right) return;
    const candidate = Math.min(right, Math.max(left, 0));
    if (best === undefined || Math.abs(candidate) < Math.abs(best)) best = candidate;
  };
  for (const [left, right] of blocked) {
    consider(low, Math.min(max, left));
    low = Math.max(low, right);
  }
  consider(low, max);
  return best;
}
export interface Circle {
  value: number;
  radius: number;
  offset: number;
}
