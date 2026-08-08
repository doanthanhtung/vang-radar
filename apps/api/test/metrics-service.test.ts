import { describe, expect, it } from "vitest";
import { MetricsService } from "../src/modules/metrics/metrics.service.js";

describe("MetricsService", () => {
  it("returns a product history from the same Redis snapshot as the dashboard", async () => {
    const snapshotId = "2026-08-08T08:00:00.000Z";
    const history = [
      {
        time: "2026-08-08T08:00:00.000Z",
        domesticBuyPriceVnd: 140_000_000,
        domesticSellPriceVnd: 142_000_000,
        premiumSellPct: 0.89,
        spreadPct: 0.014
      }
    ];
    const prisma = {
      domesticGoldPrice: { findFirst: async () => ({ source: { code: "DOMESTIC" } }) },
      worldGoldPrice: { findFirst: async () => ({ source: { code: "WORLD" } }) },
      fxRate: { findFirst: async () => ({ source: { code: "FX" } }) }
    };
    const redis = {
      getJson: async (key: string) => {
        if (key === "market:snapshot:current") return { snapshotId };
        if (key === `market:snapshot:${snapshotId}:product:SJC_BAR:metrics:history:180d`) return history;
        return null;
      },
      setJson: async () => undefined
    };
    const service = new MetricsService(prisma as never, redis as never);

    await expect(service.getHistory("SJC_BAR", "180d")).resolves.toEqual(history);
  });
});
