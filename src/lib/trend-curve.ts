export type TrendPoint = {x: number; y: number};

/** Shape-preserving cubic interpolation through measured points.
 * Controls stay inside each pair's range: no invented peaks or negative counts.
 */
export function smoothTrendPath(points: readonly TrendPoint[]): string {
  if (!points.length) return '';
  const format = (value: number) => value.toFixed(2);
  const start = `M${format(points[0].x)},${format(points[0].y)}`;
  if (points.length === 1) return start;
  const widths = points.slice(1).map((point, index) => point.x - points[index].x);
  const slopes = widths.map((width, index) => width > 0 ? (points[index + 1].y - points[index].y) / width : 0);
  const tangents = points.map((_, index) => {
    if (!index) return slopes[0];
    if (index === points.length - 1) return slopes.at(-1)!;
    const before = slopes[index - 1], after = slopes[index];
    if (before * after <= 0) return 0;
    const firstWeight = 2 * widths[index] + widths[index - 1];
    const secondWeight = widths[index] + 2 * widths[index - 1];
    return (firstWeight + secondWeight) / (firstWeight / before + secondWeight / after);
  });
  return start + points.slice(1).map((point, index) => {
    const previous = points[index], width = widths[index], slope = slopes[index];
    if (width <= 0) return ` L${format(point.x)},${format(point.y)}`;
    const bounded = (tangent: number) => slope === 0 ? 0 : Math.sign(slope) * Math.min(Math.abs(tangent), 3 * Math.abs(slope));
    return ` C${format(previous.x + width / 3)},${format(previous.y + bounded(tangents[index]) * width / 3)} ${format(point.x - width / 3)},${format(point.y - bounded(tangents[index + 1]) * width / 3)} ${format(point.x)},${format(point.y)}`;
  }).join('');
}
