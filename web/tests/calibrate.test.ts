import { describe, expect, it } from "vitest";
import { calibrate } from "@/lib/calibrate";

const rate = { id: "r", activity: "12in waterline", unit: "LF", outputPerDay: 400, hoursPerDay: 8, laborCount: 4 };

describe("variance calibration", () => {
  it("derives output per crew-day from actual labor hours", () => {
    // 2,400 LF in 720 labor-hours with a 4-person, 8-hour crew = 22.5 crew-days → 106.7 LF/day
    const r = calibrate(rate, [{ jobId: "j", jobName: "A", quantity: 2400, actualHours: 720, estimatedCost: null, actualCost: null }])!;
    expect(r.method).toBe("HOURS");
    expect(r.actualOutput).toBeCloseTo(106.67, 1);
    expect(r.variancePct).toBeCloseTo(-73.3, 1);
  });
  it("weights several jobs by quantity", () => {
    const r = calibrate(rate, [
      { jobId: "a", jobName: "A", quantity: 1000, actualHours: 64, estimatedCost: null, actualCost: null }, // 2 days → 500/day
      { jobId: "b", jobName: "B", quantity: 3000, actualHours: 256, estimatedCost: null, actualCost: null }, // 8 days → 375/day
    ])!;
    expect(r.actualOutput).toBeCloseTo(400, 5); // 4000 LF / 10 days
    expect(r.basis.map((b) => Math.round(b.outputPerDay))).toEqual([500, 375]);
  });
  it("falls back to the cost ratio when hours are missing", () => {
    const r = calibrate(rate, [{ jobId: "j", jobName: "A", quantity: 100, actualHours: null, estimatedCost: 90, actualCost: 100 }])!;
    expect(r.method).toBe("COST");
    expect(r.actualOutput).toBeCloseTo(360, 5);
  });
  it("returns nothing without usable data", () => {
    expect(calibrate(rate, [{ jobId: "j", jobName: "A", quantity: null, actualHours: 10, estimatedCost: null, actualCost: null }])).toBeNull();
  });
});
