export type TrendTipLabel = {
  key: string;
  tipY: number;
  labelY: number;
  column: number;
};

/** Lay out readable labels while leaving every measured line endpoint intact. */
export function layoutTrendTipLabels(
  tips: readonly {key: string; y: number}[],
  top: number,
  bottom: number,
  gap = 14,
): TrendTipLabel[] {
  if (!tips.length) return [];
  const start = Number.isFinite(top) ? top : 0;
  const end = Number.isFinite(bottom) ? Math.max(start, bottom) : start;
  const spacing = Number.isFinite(gap) && gap > 0 ? gap : 14;
  const target = (tip: {y: number}) => Number.isFinite(tip.y) ? tip.y : start;
  const sorted = [...tips].sort((a, b) => target(a) - target(b) || a.key.localeCompare(b.key));
  const capacity = Math.max(1, Math.floor((end - start) / spacing) + 1);
  const columns = Math.ceil(sorted.length / capacity);
  const rows = Math.floor(sorted.length / columns);
  const extra = sorted.length % columns;
  const labels: TrendTipLabel[] = [];
  let offset = 0;

  for (let column = 0; column < columns; column++) {
    const count = rows + (column < extra ? 1 : 0);
    const group = sorted.slice(offset, offset + count).map(tip => ({
      key: tip.key,
      tipY: tip.y,
      labelY: Math.max(start, Math.min(end, target(tip))),
      column,
    }));
    for (let index = 1; index < group.length; index++) {
      group[index].labelY = Math.max(group[index].labelY, group[index - 1].labelY + spacing);
    }
    for (let index = group.length - 1; index >= 0; index--) {
      const limit = index === group.length - 1 ? end : group[index + 1].labelY - spacing;
      group[index].labelY = Math.min(group[index].labelY, limit);
    }
    labels.push(...group);
    offset += count;
  }
  return labels;
}
