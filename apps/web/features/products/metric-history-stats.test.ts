import { describe, expect, it } from "vitest";
import { groupMetricHistoryByVietnameseDay } from "./metric-history-stats";

describe("groupMetricHistoryByVietnameseDay", () => {
  it("uses one latest record per UTC+7 day", () => {
    const history = [
      {
        time: "2026-07-01T01:00:00.000Z",
        domesticSellPriceVnd: 100,
        premiumSellPct: 0.1,
        spreadPct: 0.01
      },
      {
        time: "2026-07-01T08:00:00.000Z",
        domesticSellPriceVnd: 110,
        premiumSellPct: 0.2,
        spreadPct: 0.02
      },
      {
        time: "2026-07-01T16:00:00.000Z",
        domesticSellPriceVnd: 120,
        premiumSellPct: 0.3,
        spreadPct: 0.03
      },
      {
        time: "2026-07-01T17:00:00.000Z",
        domesticSellPriceVnd: 130,
        premiumSellPct: 0.4,
        spreadPct: 0.04
      }
    ];

    expect(groupMetricHistoryByVietnameseDay(history)).toEqual([
      history[2],
      history[3]
    ]);
  });
});
