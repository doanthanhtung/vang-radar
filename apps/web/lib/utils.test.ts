import { describe, expect, it } from "vitest";
import { getPremiumLevel, getSpreadLevel } from "./utils";

describe("Spread and premium levels", () => {
  it.each([
    [0.0099, "Rất thấp", "emerald", 0],
    [0.01, "Thấp", "green", 1],
    [0.015, "Trung bình", "yellow", 2],
    [0.025, "Cao", "orange", 3],
    [0.04, "Rất cao", "red", 4]
  ])("classifies a spread of %d", (value, label, color, severity) => {
    expect(getSpreadLevel(value)).toEqual({ label, color, severity });
  });

  it.each([
    [0.0299, "Rất thấp", "emerald", 0],
    [0.03, "Thấp", "green", 1],
    [0.06, "Trung bình", "yellow", 2],
    [0.1, "Cao", "orange", 3],
    [0.13, "Cao", "orange", 3],
    [0.15, "Rất cao", "red", 4]
  ])("classifies a premium of %d", (value, label, color, severity) => {
    expect(getPremiumLevel(value)).toEqual({ label, color, severity });
  });

  it("does not classify missing or invalid values", () => {
    expect(getSpreadLevel(null)).toBeNull();
    expect(getPremiumLevel(Number.NaN)).toBeNull();
  });
});
