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
      domesticGoldPrice: {
        findFirst: async () => {
          throw new Error("PostgreSQL must not be queried");
        }
      },
      worldGoldPrice: {
        findFirst: async () => {
          throw new Error("PostgreSQL must not be queried");
        }
      },
      fxRate: {
        findFirst: async () => {
          throw new Error("PostgreSQL must not be queried");
        }
      }
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

  it("returns the latest metric from Redis without checking PostgreSQL first", async () => {
    const snapshotId = "2026-08-08T08:00:00.000Z";
    const metric = { time: snapshotId, domesticBuyPriceVnd: 140_000_000 };
    const prisma = {
      domesticGoldPrice: {
        findFirst: async () => {
          throw new Error("PostgreSQL must not be queried");
        }
      },
      worldGoldPrice: {
        findFirst: async () => {
          throw new Error("PostgreSQL must not be queried");
        }
      },
      fxRate: {
        findFirst: async () => {
          throw new Error("PostgreSQL must not be queried");
        }
      }
    };
    const redis = {
      getJson: async (key: string) => {
        if (key === "market:snapshot:current") return { snapshotId };
        if (key === `market:snapshot:${snapshotId}:product:SJC_BAR:metric`) return metric;
        return null;
      },
      setJson: async () => undefined
    };
    const service = new MetricsService(prisma as never, redis as never);

    await expect(service.getLatest("SJC_BAR")).resolves.toEqual(metric);
  });

  it("returns an empty history when Redis misses and real inputs are unavailable", async () => {
    let historyQueries = 0;
    const prisma = {
      domesticGoldPrice: { findFirst: async () => null },
      worldGoldPrice: { findFirst: async () => null },
      fxRate: { findFirst: async () => null },
      goldMetric: {
        findMany: async () => {
          historyQueries += 1;
          return [];
        }
      }
    };
    const redis = {
      getJson: async () => null,
      setJson: async () => undefined
    };
    const service = new MetricsService(prisma as never, redis as never);

    await expect(service.getHistory("SJC_BAR", "180d")).resolves.toEqual([]);
    expect(historyQueries).toBe(0);
  });
});
