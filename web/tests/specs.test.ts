import { describe, expect, it } from "vitest";
import { sectionCovered, sectionNumbers } from "@/lib/specs";

describe("spec section index", () => {
  it("finds CSI and state-style section numbers", () => {
    const t = "SECTION 33 11 00 WATER UTILITY DISTRIBUTION PIPING ... Section 02720 Storm Drain ... SECTION 301 - SUBGRADE";
    expect(sectionNumbers(t).sort()).toEqual(["02720", "301", "331100"]);
  });
  it("matches a bid item's section reference against uploaded specs", () => {
    const idx = [["331100", "02720"]];
    expect(sectionCovered("33 11 00", idx)).toBe(true);
    expect(sectionCovered("02720", idx)).toBe(true);
    expect(sectionCovered("32 12 16", idx)).toBe(false);
    expect(sectionCovered(null, idx)).toBe(true);
  });
});
