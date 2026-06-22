import { describe, expect, it } from "vitest";
import { explainDecisionSignal, generateDecisionSignal, type SignalInput } from "../src/index.js";

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
  xauMomentum7dDays: 7,
  xauMomentum30dDays: 30,
  domesticMomentum7d: 0.01,
  domesticMomentum7dDays: 7,
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

  it("returns BUY_DCA for low premium percentile, normal spread, mild world momentum", () => {
    const result = generateDecisionSignal({
      ...baseInput,
      premiumPercentile180d: 25,
      spreadPercentile180d: 78,
      spreadPct: 0.02,
      xauMomentum30d: 0.01
    });
    expect(result.signal).toBe("BUY_DCA");
    expect(result.score).toBeGreaterThanOrEqual(65);
    expect(result.score).toBeLessThanOrEqual(80);
  });

  it("returns BUY_DCA when premium is at historic low even if world gold dips mildly", () => {
    const result = generateDecisionSignal({
      ...baseInput,
      productCode: "DOJI_RING_9999",
      premiumSellPct: 0.0976,
      premiumPercentile180d: 0,
      spreadPct: 0.0204,
      spreadPercentile180d: 79,
      xauMomentum30d: null,
      xauMomentum7d: -0.0234,
      xauMomentum7dDays: 5
    });
    expect(result.signal).toBe("BUY_DCA");
    expect(result.score).toBeGreaterThanOrEqual(75);
  });

  it("returns BUY_DCA with partial history and 7d momentum fallback", () => {
    const result = generateDecisionSignal({
      ...baseInput,
      premiumPercentile180d: 25,
      spreadPct: 0.02,
      premiumSampleSize180d: 3,
      spreadSampleSize180d: 3,
      xauMomentum30d: null,
      xauMomentum7d: 0.01
    });
    expect(result.signal).toBe("BUY_DCA");
    expect(result.score).toBeGreaterThanOrEqual(65);
  });

  it("does not return BUY_DCA when percentile history and momentum are unavailable", () => {
    const result = generateDecisionSignal({
      ...baseInput,
      premiumPercentile180d: null,
      spreadPercentile180d: null,
      premiumSampleSize180d: 0,
      spreadSampleSize180d: 0,
      xauMomentum30d: null,
      xauMomentum7d: null
    });
    expect(result.signal).toBe("HOLD");
  });

  it("does not return BUY_DCA when world gold drops more than 3%", () => {
    const result = generateDecisionSignal({
      ...baseInput,
      premiumPercentile180d: 10,
      spreadPct: 0.02,
      xauMomentum7d: -0.04,
      xauMomentum30d: null
    });
    expect(result.signal).toBe("HOLD");
  });

  it("can trigger AVOID from premium percentile with partial history", () => {
    const result = generateDecisionSignal({
      ...baseInput,
      premiumSellPct: 0.1,
      spreadPct: 0.02,
      premiumPercentile180d: 92,
      premiumSampleSize180d: 5
    });
    expect(result.signal).toBe("AVOID");
  });

  it("returns TAKE_PROFIT for high premium, fast domestic momentum, wide spread", () => {
    const result = generateDecisionSignal({
      ...baseInput,
      premiumPercentile180d: 88,
      spreadPercentile180d: 85,
      spreadPct: 0.03,
      domesticMomentum7d: 0.04
    });
    expect(result.signal).toBe("TAKE_PROFIT");
    expect(result.score).toBeGreaterThanOrEqual(20);
    expect(result.score).toBeLessThanOrEqual(35);
  });

  it("returns HOLD for a normal mid-range case", () => {
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

describe("explainDecisionSignal", () => {
  it("matches generateDecisionSignal output", () => {
    const input: SignalInput = {
      ...baseInput,
      productCode: "DOJI_RING_9999",
      premiumPercentile180d: 55,
      spreadPercentile180d: 50,
      domesticMomentum7d: 0.01
    };

    expect(explainDecisionSignal(input).output).toEqual(generateDecisionSignal(input));
  });

  it("shows HOLD with a contextual score for mid-range premium", () => {
    const explanation = explainDecisionSignal({
      ...baseInput,
      productCode: "DOJI_RING_9999",
      premiumPercentile180d: 55,
      spreadPercentile180d: 50,
      domesticMomentum7d: 0.01
    });

    expect(explanation.matchedRuleId).toBe("HOLD");
    expect(explanation.output.score).toBeGreaterThanOrEqual(48);
    expect(explanation.output.score).toBeLessThanOrEqual(58);
    expect(explanation.rules.at(-1)?.scoreFormula).toContain("premium lịch sử");
  });

  it("evaluates rules sequentially and stops at the first match", () => {
    const explanation = explainDecisionSignal({
      ...baseInput,
      premiumSellPct: 0.2
    });

    expect(explanation.matchedRuleId).toBe("AVOID");
    expect(explanation.rules).toHaveLength(1);
    expect(explanation.rules[0]?.matched).toBe(true);
  });

  it("includes prior non-matching rules before the matched rule", () => {
    const explanation = explainDecisionSignal({
      ...baseInput,
      premiumPercentile180d: 25,
      spreadPct: 0.02,
      xauMomentum30d: 0.01
    });

    expect(explanation.matchedRuleId).toBe("BUY_DCA");
    expect(explanation.rules.map((rule) => rule.id)).toEqual(["AVOID", "BUY_DCA"]);
    expect(explanation.rules[0]?.matched).toBe(false);
    expect(explanation.rules[1]?.matched).toBe(true);
  });

  it("marks failed conditions on non-matching rules", () => {
    const explanation = explainDecisionSignal({
      ...baseInput,
      premiumPercentile180d: 55,
      spreadPercentile180d: 50,
      domesticMomentum7d: 0.01
    });

    const buyDcaRule = explanation.rules.find((rule) => rule.id === "BUY_DCA");
    expect(buyDcaRule?.matched).toBe(false);
    expect(buyDcaRule?.conditions.some((condition) => !condition.passed)).toBe(true);
  });

  it("marks all AVOID triggers as failed when the market is not in avoid territory", () => {
    const explanation = explainDecisionSignal({
      ...baseInput,
      productCode: "DOJI_RING_9999",
      premiumSellPct: 0.0976,
      premiumPercentile180d: 0,
      spreadPct: 0.0204,
      xauMomentum7d: -0.0234,
      xauMomentum30d: null,
      xauMomentum7dDays: 5
    });

    const avoidRule = explanation.rules.find((rule) => rule.id === "AVOID");
    expect(avoidRule?.matched).toBe(false);
    expect(avoidRule?.conditions.every((condition) => !condition.passed)).toBe(true);
  });

  it("marks only the triggered AVOID conditions as passed when avoid fires", () => {
    const explanation = explainDecisionSignal({
      ...baseInput,
      premiumSellPct: 0.1,
      spreadPct: 0.02,
      premiumPercentile180d: 92,
      premiumSampleSize180d: 100
    });

    expect(explanation.matchedRuleId).toBe("AVOID");
    const avoidRule = explanation.rules[0];
    expect(avoidRule?.conditions.find((c) => c.label.includes("Premium percentile"))?.passed).toBe(
      true
    );
    expect(avoidRule?.conditions.find((c) => c.label.includes("Premium bán"))?.passed).toBe(false);
  });

  it("uses absolute spread threshold instead of spread percentile for BUY_DCA", () => {
    const explanation = explainDecisionSignal({
      ...baseInput,
      premiumPercentile180d: 25,
      spreadPct: 0.02,
      spreadPercentile180d: 78,
      xauMomentum30d: null,
      xauMomentum7d: 0.01
    });

    const buyDcaRule = explanation.rules.find((rule) => rule.id === "BUY_DCA");
    expect(buyDcaRule?.matched).toBe(true);
    expect(
      buyDcaRule?.conditions.find((condition) => condition.label === "Spread (mua–bán)")?.passed
    ).toBe(true);
  });

  it("shows partial momentum lookback when fewer than 7 days are available", () => {
    const explanation = explainDecisionSignal({
      ...baseInput,
      premiumPercentile180d: 25,
      spreadPct: 0.02,
      xauMomentum30d: null,
      xauMomentum7d: 0.01,
      xauMomentum7dDays: 6
    });

    const buyDcaRule = explanation.rules.find((rule) => rule.id === "BUY_DCA");
    expect(buyDcaRule?.matched).toBe(true);
    expect(
      buyDcaRule?.conditions.find((condition) => condition.label === "Momentum XAU 6 ngày")?.requirement
    ).toBe("Dùng 6 ngày hiện có");
  });
});