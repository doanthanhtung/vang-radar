import { describe, expect, it } from "vitest";
import {
  calculatePremiumPct,
  calculateSpreadAbsVnd,
  calculateSpreadPct,
  calculateWorldVndPerLuong
} from "../src/index.js";

describe("gold formulas", () => {
  it("calculates world VND per luong", () => {
    const value = calculateWorldVndPerLuong(2400, 25000);
    expect(value).toBeCloseTo(72_339_179.78, 2);
  });

  it("calculates premium percentages as decimals", () => {
    const world = 72_000_000;
    expect(calculatePremiumPct(80_640_000, world)).toBeCloseTo(0.12, 5);
    expect(calculatePremiumPct(70_560_000, world)).toBeCloseTo(-0.02, 5);
  });

  it("calculates spread absolute and percentage", () => {
    expect(calculateSpreadAbsVnd(82_000_000, 80_000_000)).toBe(2_000_000);
    expect(calculateSpreadPct(82_000_000, 80_000_000)).toBeCloseTo(0.02439, 5);
  });
});
