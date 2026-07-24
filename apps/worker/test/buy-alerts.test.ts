import { describe, expect, it } from "vitest";
import { selectBuyDcaTransitions } from "../src/jobs/buy-alerts.js";

function productWithSignals(current: string, previous: string) {
  const currentTime = new Date("2026-07-24T08:00:00.000Z");
  return {
    code: "DOJI_RING_9999",
    name: "Nhẫn 9999 DOJI",
    brand: "DOJI",
    goldMetrics: [
      {
        time: currentTime,
        domesticSellPriceVnd: 100_000_000,
        premiumSellPct: 0.5,
        premiumPercentile180d: 99,
        spreadPct: 0.2
      }
    ],
    signalSnapshots: [
      {
        time: currentTime,
        signal: current,
        score: 1,
        confidence: 0.01,
        reasons: []
      },
      {
        time: new Date("2026-07-24T07:55:00.000Z"),
        signal: previous,
        score: 99,
        confidence: 0.99,
        reasons: []
      }
    ]
  };
}

describe("selectBuyDcaTransitions", () => {
  it("selects a product solely when its signal transitions to BUY_DCA", () => {
    const candidates = selectBuyDcaTransitions([productWithSignals("BUY_DCA", "HOLD")]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.code).toBe("DOJI_RING_9999");
    expect(candidates[0]?.transitionTime).toEqual(new Date("2026-07-24T08:00:00.000Z"));
  });

  it.each([
    ["BUY_DCA", "BUY_DCA"],
    ["HOLD", "BUY_DCA"],
    ["HOLD", "HOLD"]
  ])("does not select an unchanged or non-buy signal (%s after %s)", (current, previous) => {
    expect(selectBuyDcaTransitions([productWithSignals(current, previous)])).toEqual([]);
  });
});
