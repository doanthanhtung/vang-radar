import { describe, expect, it } from "vitest";
import type { ScoreExplanationInput } from "./vang-score";
import type { MarketSummaryProduct } from "./api-client";
import {
  average,
  buildScoreExplanation,
  calculateVangScore,
  enrichProductWithLiveSignal,
  getVangDecision
} from "./vang-score";

describe("calculateVangScore", () => {
  it("returns the rounded average of product scores", () => {
    expect(calculateVangScore([65, 75, 80])).toBe(73);
  });

  it("clamps the result between 0 and 100", () => {
    expect(calculateVangScore([120, 130])).toBe(100);
    expect(calculateVangScore([-10, 0])).toBe(0);
  });

  it("returns 0 when there are no valid scores", () => {
    expect(calculateVangScore([])).toBe(0);
  });
});

describe("average", () => {
  it("ignores non-finite values", () => {
    expect(average([10, Number.NaN, 20])).toBe(15);
  });
});

describe("getVangDecision", () => {
  it("returns a waiting state when data is not ready", () => {
    expect(getVangDecision(false, 80, 1_000_000, 0.1)).toEqual({
      title: "ĐANG CHỜ THÊM DỮ LIỆU",
      score: null,
      reason:
        "Chưa có đủ giá vàng trong nước, giá thế giới hoặc tỷ giá để đưa ra kết luận đáng tin.",
      action: "Chờ dữ liệu đầy đủ trước khi quyết định mua."
    });
  });

  it.each([
    [75, "CÓ THỂ MUA"],
    [55, "CÂN NHẮC"],
    [35, "NÊN CHỜ THÊM"]
  ])("maps score %d to title %s", (score, title) => {
    expect(getVangDecision(true, score, 2_000_000, 0.12).title).toBe(title);
  });

  it("uses boundary thresholds inclusively", () => {
    expect(getVangDecision(true, 70, 0, 0).title).toBe("CÓ THỂ MUA");
    expect(getVangDecision(true, 69, 0, 0).title).toBe("CÂN NHẮC");
    expect(getVangDecision(true, 40, 0, 0).title).toBe("CÂN NHẮC");
    expect(getVangDecision(true, 39, 0, 0).title).toBe("NÊN CHỜ THÊM");
  });
});

describe("buildScoreExplanation", () => {
  const doji: ScoreExplanationInput = {
    code: "DOJI_RING_9999",
    name: "Nhẫn 9999 DOJI",
    premiumBuyPct: 0.09,
    premiumSellPct: 0.11,
    spreadPct: 0.02,
    buyPrice: 144_000_000,
    sellPrice: 147_200_000,
    xauUsdPerOz: 2_400,
    usdVnd: 26_000,
    worldVndPerLuong: 132_000_000,
    premiumPercentile180d: 55,
    spreadPercentile180d: 50,
    historySampleSize180d: 100,
    xauMomentum7d: 0.01,
    xauMomentum30d: 0.02,
    xauMomentum7dDays: 7,
    xauMomentum30dDays: 30,
    domesticMomentum7d: 0.01,
    domesticMomentum7dDays: 7
  };

  it("explains only the provided DOJI product with algorithm steps", () => {
    const explanation = buildScoreExplanation(doji);

    expect(explanation.ready).toBe(true);
    expect(explanation.productName).toBe("Nhẫn 9999 DOJI");
    expect(explanation.score).toBe(55);
    expect(explanation.signal).toBe("HOLD");
    expect(explanation.summary).toContain("Nhẫn 9999 DOJI");
    expect(explanation.summary).toContain("55/100");
    expect(explanation.reasons).toEqual(explanation.algorithm?.output.reasons);
    expect(explanation.algorithm?.matchedRuleId).toBe("HOLD");
    expect(explanation.algorithm?.rules.at(-1)?.scoreFormula).toContain("55");
  });

  it("derives score from live engine output instead of stale API snapshot fields", () => {
    const explanation = buildScoreExplanation({
      ...doji,
      premiumPercentile180d: 0,
      spreadPct: 0.02,
      xauMomentum7d: -0.02,
      xauMomentum30d: null,
      xauMomentum7dDays: 5
    });

    expect(explanation.signal).toBe("BUY_DCA");
    expect(explanation.score).toBeGreaterThanOrEqual(75);
    expect(explanation.summary).toContain(`${explanation.score}/100`);
    expect(explanation.algorithm?.output.score).toBe(explanation.score);
  });

  it("returns empty explanation when DOJI data is unavailable", () => {
    const explanation = buildScoreExplanation(null);

    expect(explanation.ready).toBe(false);
    expect(explanation.summary).toContain("Chưa có dữ liệu DOJI");
  });
});

describe("enrichProductWithLiveSignal", () => {
  const world = {
    xauUsdPerOz: 2_400,
    usdVnd: 26_000,
    worldVndPerLuong: 132_000_000,
    change7d: -0.02
  };

  const product: MarketSummaryProduct = {
    code: "DOJI_RING_9999",
    name: "Nhẫn 9999 DOJI",
    brand: "DOJI",
    buyPrice: 144_000_000,
    sellPrice: 147_000_000,
    premiumBuyPct: 0.09,
    premiumSellPct: 0.0976,
    spreadAbsVnd: 3_000_000,
    spreadPct: 0.0204,
    signal: "HOLD",
    score: 55,
    confidence: 0.95,
    reasons: ["Snapshot cũ"],
    premiumPercentile180d: 0,
    spreadPercentile180d: 79,
    historySampleSize180d: 100,
    xauMomentum7d: -0.0234,
    xauMomentum30d: null,
    xauMomentum7dDays: 5,
    xauMomentum30dDays: null,
    domesticMomentum7d: -0.02,
    domesticMomentum7dDays: 5,
    previousDayClose: null
  };

  it("overrides stale API snapshot with live engine output", () => {
    const enriched = enrichProductWithLiveSignal(product, world);

    expect(enriched.signal).toBe("BUY_DCA");
    expect(enriched.score).toBeGreaterThanOrEqual(75);
    expect(enriched.reasons).not.toEqual(["Snapshot cũ"]);
  });
});