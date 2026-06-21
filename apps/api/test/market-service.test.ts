import { describe, expect, it } from "vitest";
import { MarketService } from "../src/modules/market/market.service.js";

describe("MarketService", () => {
  it("ignores absurd cached premium and recalculates stale bad metrics from valid raw inputs", async () => {
    const prisma = {
      domesticGoldPrice: {
        findFirst: async () => ({ source: { code: "TWENTY_FOUR_H_GOLD" } })
      },
      fxRate: {
        findFirst: async () => ({
          rate: 26_000,
          time: new Date("2026-06-16T00:00:00Z"),
          source: { code: "EXCHANGERATE_API" }
        })
      },
      worldGoldPrice: {
        findFirst: async () => ({
          priceUsdPerOz: 2_400,
          time: new Date("2026-06-16T00:00:00Z"),
          source: { code: "GOLDAPI_IO" }
        })
      },
      goldProduct: {
        findMany: async () => [
          {
            code: "SJC_BAR",
            name: "Vang mieng SJC",
            brand: "SJC",
            goldMetrics: [
              {
                time: new Date("2026-06-16T00:00:00Z"),
                domesticBuyPriceVnd: 148_000_000,
                domesticSellPriceVnd: 150_500_000,
                xauUsdPerOz: 2_400,
                usdVnd: 26,
                worldVndPerLuong: 75_000,
                premiumBuyPct: 1972,
                premiumSellPct: 2005,
                spreadAbsVnd: 2_500_000,
                spreadPct: 0.01675
              }
            ],
            signalSnapshots: []
          }
        ]
      }
    };
    const redis = {
      getJson: async () => ({ products: [{ premiumSellPct: 1102.1388 }] })
    };
    const service = new MarketService(prisma as never, redis as never);

    const summary = await service.getSummary();

    expect(summary.products[0]?.premiumSellPct).toBeCloseTo(1.00046, 5);
    expect(summary.products[0]?.spreadPct).toBeCloseTo(2_500_000 / 150_500_000, 5);
  });
});
