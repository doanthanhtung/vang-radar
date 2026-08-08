import { describe, expect, it } from "vitest";
import { metricHistory, publishMarketSnapshot } from "../src/jobs/market-snapshot.js";

type StoredValue = { value: string; ttl: number };

function createRedis() {
  const values = new Map<string, StoredValue>();
  const transactions: string[][] = [];

  return {
    values,
    transactions,
    multi() {
      const commands: Array<() => void> = [];
      const keys: string[] = [];
      const transaction = {
        set(key: string, value: string, _mode: "EX", ttl: number) {
          keys.push(key);
          commands.push(() => values.set(key, { value, ttl }));
          return transaction;
        },
        async exec() {
          commands.forEach((command) => command());
          transactions.push(keys);
          return keys.map(() => [null, "OK"]);
        }
      };
      return transaction;
    }
  };
}

function createPrisma({ includeDxy = true, includeSignal = true } = {}) {
  const at = new Date("2026-08-08T08:00:00.000Z");
  const product = {
    id: "sjc",
    code: "SJC_BAR",
    name: "Vàng miếng SJC",
    brand: "SJC",
    goldMetrics: [
      {
        time: at,
        domesticBuyPriceVnd: 140_000_000,
        domesticSellPriceVnd: 142_000_000,
        xauUsdPerOz: 2_400,
        usdVnd: 26_000,
        worldVndPerLuong: 75_000_000,
        premiumBuyPct: 0.86,
        premiumSellPct: 0.893333,
        spreadAbsVnd: 2_000_000,
        spreadPct: 0.014085,
        premiumPercentile180d: 30,
        spreadPercentile180d: 40,
        xauMomentum7d: 0.01,
        xauMomentum30d: 0.03,
        xauMomentum7dDays: 7,
        xauMomentum30dDays: 30,
        domesticMomentum7d: 0.02,
        domesticMomentum7dDays: 7
      }
    ],
    signalSnapshots: includeSignal
      ? [
          {
            time: at,
            signal: "HOLD",
            score: 55,
            confidence: 0.9,
            reasons: ["Fixture signal"]
          }
        ]
      : []
  };

  return {
    fxRate: {
      findFirst: async () => ({ rate: 26_000, time: at, source: { code: "FX" } }),
      findMany: async () => [{ rate: 26_000, time: at }]
    },
    worldGoldPrice: {
      findFirst: async () => ({ priceUsdPerOz: 2_400, time: at, source: { code: "WORLD" } }),
      findMany: async () => [{ priceUsdPerOz: 2_400, time: at }]
    },
    macroIndicator: {
      findFirst: async () => (includeDxy ? { value: 100.2, time: at } : null),
      findMany: async () => (includeDxy ? [{ value: 100.2, time: at }] : [])
    },
    goldProduct: { findMany: async () => [product] },
    goldMetric: {
      count: async () => 1,
      findMany: async () => product.goldMetrics
    },
    domesticGoldPrice: {
      findFirst: async () => ({
        time: at,
        buyPriceVnd: 140_000_000,
        sellPriceVnd: 142_000_000,
        source: { code: "DOMESTIC" }
      }),
      findMany: async () => [
        { time: at, buyPriceVnd: 140_000_000, sellPriceVnd: 142_000_000 }
      ]
    },
    signalSnapshot: { findFirst: async () => product.signalSnapshots[0] ?? null }
  };
}

describe("publishMarketSnapshot", () => {
  it("publishes a complete version and switches the pointer atomically when DXY is absent", async () => {
    const redis = createRedis();

    const snapshotId = await publishMarketSnapshot(createPrisma({ includeDxy: false }) as never, redis as never);

    expect(snapshotId).toBe("2026-08-08T08:00:00.000Z");
    expect(JSON.parse(redis.values.get(`market:snapshot:${snapshotId}:summary`)!.value)).toMatchObject({
      macro: { dxy: null },
      products: [{ code: "SJC_BAR", score: 55 }]
    });
    expect(JSON.parse(redis.values.get("market:snapshot:current")!.value)).toEqual({ snapshotId });
    expect(redis.values.get("market:snapshot:current")!.ttl).toBe(24 * 60 * 60);
    expect(redis.transactions[0]!.at(-1)).toBe("market:snapshot:current");
  });

  it("keeps the existing pointer when an active product has no matching signal", async () => {
    const redis = createRedis();
    redis.values.set("market:snapshot:current", {
      value: JSON.stringify({ snapshotId: "previous" }),
      ttl: 3600
    });

    const snapshotId = await publishMarketSnapshot(createPrisma({ includeSignal: false }) as never, redis as never);

    expect(snapshotId).toBeNull();
    expect(JSON.parse(redis.values.get("market:snapshot:current")!.value)).toEqual({
      snapshotId: "previous"
    });
    expect(redis.transactions).toHaveLength(0);
  });
});

describe("metricHistory", () => {
  it("keeps the last metric observed on each UTC+7 calendar day", () => {
    const history = metricHistory([
      { time: new Date("2026-08-01T16:00:00.000Z"), domesticBuyPriceVnd: 1, domesticSellPriceVnd: 2 },
      { time: new Date("2026-08-02T02:00:00.000Z"), domesticBuyPriceVnd: 3, domesticSellPriceVnd: 4 },
      { time: new Date("2026-08-02T08:00:00.000Z"), domesticBuyPriceVnd: 5, domesticSellPriceVnd: 6 }
    ]);

    expect(history).toHaveLength(2);
    expect(history.map((point) => point.domesticSellPriceVnd)).toEqual([2, 6]);
  });
});
