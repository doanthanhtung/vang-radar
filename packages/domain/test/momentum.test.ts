import { describe, expect, it } from "vitest";
import { buildMomentum, elapsedWholeDays } from "../src/formulas/momentum.js";

describe("elapsedWholeDays", () => {
  it("returns whole days between two timestamps", () => {
    const from = new Date("2026-06-16T00:00:00.000Z");
    const to = new Date("2026-06-22T00:00:00.000Z");
    expect(elapsedWholeDays(from, to)).toBe(6);
  });

  it("returns 0 when the lookback is shorter than one day", () => {
    const from = new Date("2026-06-22T00:00:00.000Z");
    const to = new Date("2026-06-22T12:00:00.000Z");
    expect(elapsedWholeDays(from, to)).toBe(0);
  });
});

describe("buildMomentum", () => {
  it("computes momentum with the actual elapsed day count", () => {
    const now = new Date("2026-06-22T00:00:00.000Z");
    const result = buildMomentum(110, { value: 100, time: new Date("2026-06-16T00:00:00.000Z") }, now);

    expect(result?.days).toBe(6);
    expect(result?.value).toBeCloseTo(0.1);
  });

  it("returns null when there is not enough history", () => {
    const now = new Date("2026-06-22T12:00:00.000Z");
    const result = buildMomentum(
      110,
      { value: 100, time: new Date("2026-06-22T00:00:00.000Z") },
      now
    );

    expect(result).toBeNull();
  });
});