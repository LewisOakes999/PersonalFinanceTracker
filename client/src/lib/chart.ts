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

/**
 * A fitted domain plus evenly spaced ticks on round numbers (about four
 * intervals). Passing both stops the chart picking its own ticks inside the
 * domain, which can leave uneven gaps where it drops a crowded label.
 */
export function fittedAxis(
  values: number[]
): { domain: [number, number]; ticks: number[] } | undefined {
  const fitted = fittedDomain(values);
  if (!fitted) return undefined;
  const [lo, hi] = fitted;
  const rough = (hi - lo) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm > 5 ? 10 : norm > 2 ? 5 : norm > 1 ? 2 : 1) * mag; // round up
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { domain: [min, max], ticks };
}
