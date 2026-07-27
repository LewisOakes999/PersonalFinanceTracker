/**
 * Y-axis domain fitted to the data, with padding and rounded bounds.
 *
 * Trend charts (net worth, projected balance) sit a long way from zero: a
 * zero-anchored axis squeezes a year of real movement into a few pixels and the
 * line reads as flat. Fitting the axis to the data is the normal convention for
 * this kind of chart — the axis labels make the offset explicit.
 *
 * Only for line/area charts. Bars encode magnitude by length and must keep a
 * zero baseline, otherwise their relative sizes lie.
 */
export function fittedDomain(
  values: number[],
  padRatio = 0.12
): [number, number] | undefined {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length === 0) return undefined;

  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  // A flat series still needs a band, or the line sits on the axis.
  const span = hi - lo || Math.abs(hi) * 0.1 || 1;
  const pad = span * padRatio;

  let min = lo - pad;
  let max = hi + pad;

  // Don't invent a negative axis for data that never goes negative (or a
  // positive floor for data that never goes positive).
  if (lo >= 0 && min < 0) min = 0;
  if (hi <= 0 && max > 0) max = 0;

  // Round outward to a readable step so ticks land on sensible numbers.
  const step = niceStep(max - min);
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step];
}

/** A "nice" tick step (1, 2 or 5 × a power of ten) for a given range. */
function niceStep(range: number): number {
  if (!Number.isFinite(range) || range <= 0) return 1;
  const rough = range / 4; // aim for roughly four gridlines
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const nice = norm >= 5 ? 5 : norm >= 2 ? 2 : 1;
  return nice * mag;
}
