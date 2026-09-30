// Variance calibration: compare what past jobs actually produced with the
// production rates in Setup. Suggestions only; a person approves each change.

export type CalLine = { jobId: string; jobName: string; quantity: number | null; actualHours: number | null; estimatedCost: number | null; actualCost: number | null };
export type CalRate = { id: string; activity: string; unit: string; outputPerDay: number | null; hoursPerDay: number; laborCount: number };

export type CalResult = {
  actualOutput: number; variancePct: number | null; method: "HOURS" | "COST";
  basis: { jobId: string; jobName: string; quantity: number; hours: number | null; outputPerDay: number }[];
};

/**
 * Actual output per crew-day. With labor hours: crew-days = hours ÷ (crew size × hours per day),
 * output = quantity ÷ crew-days, weighted by quantity across jobs. Without hours, fall back to
 * scaling the current rate by estimated ÷ actual cost.
 */
export function calibrate(rate: CalRate, lines: CalLine[]): CalResult | null {
  const crew = Math.max(1, rate.laborCount);
  const withHours = lines.filter((l) => (l.quantity ?? 0) > 0 && (l.actualHours ?? 0) > 0);
  if (withHours.length) {
    let q = 0, days = 0;
    const basis = withHours.map((l) => {
      const d = l.actualHours! / (crew * rate.hoursPerDay);
      q += l.quantity!; days += d;
      return { jobId: l.jobId, jobName: l.jobName, quantity: l.quantity!, hours: l.actualHours, outputPerDay: l.quantity! / d };
    });
    const actual = q / days;
    return { actualOutput: actual, variancePct: rate.outputPerDay ? ((actual - rate.outputPerDay) / rate.outputPerDay) * 100 : null, method: "HOURS", basis };
  }
  const withCost = lines.filter((l) => (l.estimatedCost ?? 0) > 0 && (l.actualCost ?? 0) > 0 && (l.quantity ?? 0) > 0);
  if (withCost.length && rate.outputPerDay) {
    const est = withCost.reduce((a, l) => a + l.estimatedCost!, 0), act = withCost.reduce((a, l) => a + l.actualCost!, 0);
    const actual = rate.outputPerDay * (est / act);
    return {
      actualOutput: actual, variancePct: ((actual - rate.outputPerDay) / rate.outputPerDay) * 100, method: "COST",
      basis: withCost.map((l) => ({ jobId: l.jobId, jobName: l.jobName, quantity: l.quantity!, hours: null, outputPerDay: rate.outputPerDay! * (l.estimatedCost! / l.actualCost!) })),
    };
  }
  return null;
}
