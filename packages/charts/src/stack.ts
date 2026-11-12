/** From a series' value at the start of its bar or band to the value at its end, per category. */
export type Span = [from: number, to: number] | null;

/**
 * Where each value of series that stack starts and ends. Series of one group stack positive values
 * up and negative values down (as ECharts does); with `percentOf`, each stack's values become shares
 * of its total. A series alone in its group stands on zero.
 */
export function stackSpans<E extends { data: readonly (number | null)[] }>(
  entries: readonly E[],
  groupOf: (entry: E) => string,
  percentOf: (entry: E) => boolean,
): Map<E, Span[]> {
  const spans = new Map<E, Span[]>();
  const groups = new Map<string, E[]>();
  for (const entry of entries) {
    const members = groups.get(groupOf(entry)) ?? [];
    members.push(entry);
    groups.set(groupOf(entry), members);
  }
  const totals = new Map([...groups].map(([group, members]) => [group, stackTotal(members)]));
  const sums = new Map<string, number[][]>();
  for (const entry of entries) {
    const group = groupOf(entry);
    const total = totals.get(group)!;
    const percent = percentOf(entry);
    const [up, down] = sums.get(group) ?? [entry.data.map(() => 0), entry.data.map(() => 0)];
    sums.set(group, [up!, down!]);
    const share = (part: number, i: number): number => (total[i]! === 0 ? 0 : (part / total[i]!) * 100);
    spans.set(
      entry,
      entry.data.map((value, i) => {
        if (value === null) {
          return null;
        }
        const side = value < 0 ? down! : up!;
        const from = side[i]!;
        side[i] = from + value;
        return percent ? [share(from, i), share(from + value, i)] : [from, from + value];
      }),
    );
  }
  return spans;
}

/** The group a series stacks in: its own, or every one of its type with its stack name in `scope`. */
export function stackGroup(entry: { type: string; index: number; stack: string | undefined }, scope: string): string {
  return `${entry.type}|${scope}|${entry.stack === undefined ? `#${entry.index}` : `@${entry.stack}`}`;
}

/** The total of series stacked together at each category: the sizes of their parts, whatever their signs. */
export function stackTotal(entries: readonly { data: readonly (number | null)[] }[]): number[] {
  return entries[0]?.data.map((_, i) => entries.reduce((sum, entry) => sum + Math.abs(entry.data[i] ?? 0), 0)) ?? [];
}
