import { describe, expect, it } from "vitest";
import { syncLatestHistoryPoint } from "./metric-charts-panel";

describe("syncLatestHistoryPoint", () => {
  it("uses the market summary values for the latest detail metric", () => {
    const history = [
      {
        time: "2026-07-24T08:00:00.000Z",
        domesticBuyPriceVnd: 90,
        domesticSellPriceVnd: 100,
        premiumSellPct: 0.1,
        spreadPct: 0.1
      }
    ];

    const result = syncLatestHistoryPoint(history, {
      buyPrice: 95,
      sellPrice: 105,
      premiumSellPct: 0.05,
      spreadPct: 0.095
    });

    expect(result[0]).toMatchObject({
      domesticBuyPriceVnd: 95,
      domesticSellPriceVnd: 105,
      premiumSellPct: 0.05,
      spreadPct: 0.095
    });
  });
});
