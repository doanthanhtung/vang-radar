import { describe, expect, it } from "vitest";
import { generateDecisionSignal, type SignalInput } from "../src/index.js";

const baseInput: SignalInput = {
  productCode: "SJC_BAR",
  domesticBuyPriceVnd: 88_000_000,
  domesticSellPriceVnd: 90_000_000,
  xauUsdPerOz: 2400,
  usdVnd: 25_000,
  worldVndPerLuong: 72_339_183,
  premiumBuyPct: 0.21,
  premiumSellPct: 0.1,
  spreadAbsVnd: 2_000_000,
  spreadPct: 0.022,
  premiumPercentile180d: 50,
  spreadPercentile180d: 50,
  premiumSampleSize180d: 100,
  spreadSampleSize180d: 100,
  xauMomentum7d: 0.01,
  xauMomentum30d: 0.02,
  domesticMomentum7d: 0.01,
  dataQualityScore: 95,
  isDataValid: true
};

describe("generateDecisionSignal", () => {
  it("returns DATA_UNRELIABLE for invalid data", () => {
    const result = generateDecisionSignal({ ...baseInput, isDataValid: false });
    expect(result.signal).toBe("DATA_UNRELIABLE");
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it("returns AVOID for high premium or spread", () => {
    const result = generateDecisionSignal({ ...baseInput, premiumSellPct: 0.2 });
    expect(result.signal).toBe("AVOID");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(35);
  });

  it("returns BUY_DCA for low premium, low spread, positive world momentum", () => {
    const result = generateDecisionSignal({
      ...baseInput,
      premiumPercentile180d: 25,
      spreadPercentile180d: 35,
      xauMomentum30d: 0.01
    });
    expect(result.signal).toBe("BUY_DCA");
    expect(result.score).toBeGreaterThanOrEqual(65);
    expect(result.score).toBeLessThanOrEqual(80);
  });

  it("does not return BUY_DCA when history or 30d world momentum is missing", () => {
    const result = generateDecisionSignal({
      ...baseInput,
      premiumPercentile180d: 25,
      spreadPercentile180d: 35,
      premiumSampleSize180d: 3,
      spreadSampleSize180d: 3,
      xauMomentum30d: null
    });
    expect(result.signal).toBe("HOLD");
  });

  it("returns TAKE_PROFIT for high premium, fast domestic momentum, high spread", () => {
    const result = generateDecisionSignal({
      ...baseInput,
      premiumPercentile180d: 88,
      spreadPercentile180d: 85,
      domesticMomentum7d: 0.04
    });
    expect(result.signal).toBe("TAKE_PROFIT");
    expect(result.score).toBeGreaterThanOrEqual(55);
    expect(result.score).toBeLessThanOrEqual(70);
  });

  it("returns HOLD for a normal case", () => {
    const result = generateDecisionSignal({
      ...baseInput,
      premiumPercentile180d: 55,
      spreadPercentile180d: 50,
      domesticMomentum7d: 0.01
    });
    expect(result.signal).toBe("HOLD");
    expect(result.score).toBeGreaterThanOrEqual(45);
    expect(result.score).toBeLessThanOrEqual(65);
  });
});
