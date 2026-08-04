import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MarketService } from "../src/modules/market/market.service.js";

describe("MarketService", () => {
  beforeEach(() => {
    delete process.env.ENABLE_EXPERIMENTAL_DRAWDOWN_PLAN;
  });

  afterEach(() => {
    delete process.env.ENABLE_EXPERIMENTAL_DRAWDOWN_PLAN;
  });

  it("ignores absurd cached premium and recalculates stale bad metrics from valid raw inputs", async () => {
    const prisma = {
      domesticGoldPrice: {
        findFirst: async () => ({
          buyPriceVnd: 147_000_000,
          sellPriceVnd: 149_000_000,
          source: { code: "TWENTY_FOUR_H_GOLD" }
        })
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
      macroIndicator: {
        findFirst: async () => null
      },
      goldMetric: {
        count: async () => 0,
        findFirst: async () => null
      },
      goldProduct: {
        findMany: async () => [
          {
            id: "product-sjc-bar",
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
    const cacheWrites: Array<{ key: string; ttl: number }> = [];
    const redis = {
      getJson: async () => ({ products: [{ premiumSellPct: 1102.1388 }] }),
      setJson: async (key: string, _value: unknown, ttl: number) => {
        cacheWrites.push({ key, ttl });
      }
    };
    const service = new MarketService(prisma as never, redis as never);

    const summary = await service.getSummary();

    expect(summary.products[0]?.premiumSellPct).toBeCloseTo(1.00046, 5);
    expect(summary.products[0]?.spreadPct).toBeCloseTo(2_500_000 / 150_500_000, 5);
    expect(summary.products[0]?.previousDayClose).toEqual({
      buyPriceVnd: 147_000_000,
      sellPriceVnd: 149_000_000
    });
    expect(summary.products[0]?.experimentalDrawdownPlan).toBeUndefined();
    expect(cacheWrites[0]?.ttl).toBe(60);
  });

  it("adds the experimental drawdown plan only when the feature flag is enabled", async () => {
    process.env.ENABLE_EXPERIMENTAL_DRAWDOWN_PLAN = "true";
    const rows = Array.from({ length: 260 }, (_, index) => {
      const time = new Date(Date.UTC(2026, 5, 16 - index));
      const isCurrent = index === 0;
      const sell = isCurrent ? 95_000_000 : 100_000_000 - index * 25_000;
      const buy = sell - 1_000_000;
      return {
        time,
        domesticBuyPriceVnd: buy,
        domesticSellPriceVnd: sell,
        premiumSellPct: isCurrent ? 0.05 : 0.12,
        spreadPct: isCurrent ? 0.005 : 0.01
      };
    });
    const prisma = {
      domesticGoldPrice: {
        findFirst: async () => ({
          buyPriceVnd: 94_000_000,
          sellPriceVnd: 95_000_000
        })
      },
      fxRate: {
        findFirst: async () => ({
          rate: 26_000,
          time: new Date("2026-06-16T00:00:00Z")
        })
      },
      worldGoldPrice: {
        findFirst: async () => ({
          priceUsdPerOz: 2_400,
          time: new Date("2026-06-16T00:00:00Z")
        })
      },
      macroIndicator: {
        findFirst: async () => null
      },
      goldMetric: {
        count: async () => 260,
        findFirst: async () => null,
        findMany: async () => rows
      },
      goldProduct: {
        findMany: async () => [
          {
            id: "product-sjc-bar",
            code: "SJC_BAR",
            name: "Vang mieng SJC",
            brand: "SJC",
            goldMetrics: [
              {
                time: new Date("2026-06-16T00:00:00Z"),
                domesticBuyPriceVnd: 94_000_000,
                domesticSellPriceVnd: 95_000_000,
                xauUsdPerOz: 2_400,
                usdVnd: 26_000,
                worldVndPerLuong: 75_000_000,
                premiumBuyPct: 0.05,
                premiumSellPct: 0.05,
                premiumPercentile180d: null,
                spreadAbsVnd: 1_000_000,
                spreadPct: 0.01,
                spreadPercentile180d: null,
                xauMomentum7d: null,
                xauMomentum30d: null,
                xauMomentum7dDays: null,
                xauMomentum30dDays: null,
                domesticMomentum7d: null,
                domesticMomentum7dDays: null
              }
            ],
            signalSnapshots: []
          }
        ]
      }
    };
    const redis = {
      getJson: async () => null,
      setJson: async () => undefined
    };
    const service = new MarketService(prisma as never, redis as never);

    const summary = await service.getSummary();

    const plan = summary.products[0]?.experimentalDrawdownPlan;
    expect(plan).toBeDefined();
    expect(plan?.strategyName).toBe("drawdown_ladder_v1");
    expect(plan?.drawdownWindowDays).toBe(252);
    expect(plan?.maxExposurePct).toBe(0.5);
    expect(plan?.status).toBe("READY");
    expect(plan?.suggestedExposurePct).toBeGreaterThan(0);
  });

  it("starts independent latest-summary reads before any one database read completes", async () => {
    type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
    const deferred = <T>(): Deferred<T> => {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((accept) => {
        resolve = accept;
      });
      return { promise, resolve };
    };
    const fx = deferred<{ rate: number; time: Date }>();
    const world = deferred<{ priceUsdPerOz: number; time: Date }>();
    const dxy = deferred<null>();
    const products = deferred<
      Array<{
        id: string;
        code: string;
        name: string;
        brand: string;
        goldMetrics: Array<{
          time: Date;
          domesticBuyPriceVnd: number;
          domesticSellPriceVnd: number;
          xauUsdPerOz: number;
          usdVnd: number;
          worldVndPerLuong: number;
          premiumBuyPct: number;
          premiumSellPct: number;
          spreadAbsVnd: number;
          spreadPct: number;
          premiumPercentile180d: null;
          spreadPercentile180d: null;
          xauMomentum7d: null;
          xauMomentum30d: null;
          xauMomentum7dDays: null;
          xauMomentum30dDays: null;
          domesticMomentum7d: null;
          domesticMomentum7dDays: null;
        }>;
        signalSnapshots: [];
      }>
    >();
    const calls: string[] = [];
    const time = new Date("2026-08-04T00:00:00Z");
    let fxCalls = 0;
    let worldCalls = 0;
    const prisma = {
      fxRate: {
        findFirst: () =>
          ++fxCalls === 1
            ? Promise.resolve({ rate: 26_000, time, source: { code: "FX" } })
            : (calls.push("fx"), fx.promise)
      },
      worldGoldPrice: {
        findFirst: () =>
          ++worldCalls === 1
            ? Promise.resolve({ priceUsdPerOz: 2_400, time, source: { code: "WORLD" } })
            : (calls.push("world"), world.promise)
      },
      macroIndicator: { findFirst: () => (calls.push("dxy"), dxy.promise) },
      goldProduct: { findMany: () => (calls.push("products"), products.promise) },
      domesticGoldPrice: { findFirst: async () => ({ source: { code: "DOMESTIC" } }) },
      goldMetric: { count: async () => 0, findFirst: async () => null }
    };
    const service = new MarketService(
      prisma as never,
      {
        getJson: async () => null,
        setJson: async () => undefined
      } as never
    );

    const summary = service.getSummary();
    await new Promise((resolve) => setImmediate(resolve));

    expect(calls).toEqual(["fx", "world", "dxy", "products"]);

    fx.resolve({ rate: 26_000, time });
    world.resolve({ priceUsdPerOz: 2_400, time });
    dxy.resolve(null);
    products.resolve([
      {
        id: "sjc",
        code: "SJC_BAR",
        name: "Vàng miếng SJC",
        brand: "SJC",
        goldMetrics: [
          {
            time,
            domesticBuyPriceVnd: 140_000_000,
            domesticSellPriceVnd: 143_000_000,
            xauUsdPerOz: 2_400,
            usdVnd: 26_000,
            worldVndPerLuong: 75_000_000,
            premiumBuyPct: 0.1,
            premiumSellPct: 0.12,
            spreadAbsVnd: 3_000_000,
            spreadPct: 0.021,
            premiumPercentile180d: null,
            spreadPercentile180d: null,
            xauMomentum7d: null,
            xauMomentum30d: null,
            xauMomentum7dDays: null,
            xauMomentum30dDays: null,
            domesticMomentum7d: null,
            domesticMomentum7dDays: null
          }
        ],
        signalSnapshots: []
      }
    ]);

    await expect(summary).resolves.toMatchObject({ products: [{ code: "SJC_BAR" }] });
  });
});
