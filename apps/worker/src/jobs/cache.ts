import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import { calculateSpreadPct } from "@vang-radar/domain";

const SUMMARY_CACHE_KEY = "market:summary:latest:v3";
const SUMMARY_CACHE_TTL_SECONDS = 300;

export async function refreshMarketSummaryCache(prisma: PrismaClient, redis: Redis) {
  const [latestFx, latestWorld, latestDxy, products] = await Promise.all([
    prisma.fxRate.findFirst({
      where: {
        isValid: true,
        pair: "USDVND",
        rate: { gte: 20_000, lte: 40_000 },
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      orderBy: { time: "desc" }
    }),
    prisma.worldGoldPrice.findFirst({
      where: {
        isValid: true,
        symbol: "XAUUSD",
        priceUsdPerOz: { gt: 100 },
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      orderBy: { time: "desc" }
    }),
    prisma.macroIndicator.findFirst({
      where: { code: "DXY", isValid: true, value: { gt: 0 } },
      orderBy: { time: "desc" },
      select: { value: true }
    }),
    prisma.goldProduct.findMany({
      where: { isActive: true },
      include: {
        goldMetrics: { orderBy: { time: "desc" }, take: 1 },
        signalSnapshots: { orderBy: { time: "desc" }, take: 1 }
      }
    })
  ]);

  const firstMetric = products.find((product) => product.goldMetrics[0])?.goldMetrics[0];
  if (!firstMetric) return null;
  const since180d = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const historySampleSizes = new Map(
    await Promise.all(
      products.map(async (product) => {
        const metric = product.goldMetrics[0];
        if (!metric) return [product.id, 0] as const;
        const count = await prisma.goldMetric.count({
          where: { productId: product.id, time: { gte: since180d, lt: metric.time } }
        });
        return [product.id, count] as const;
      })
    )
  );

  const summary = {
    time: (latestFx || latestWorld)?.time?.toISOString() ?? firstMetric.time.toISOString(),
    world: {
      xauUsdPerOz: Number(latestWorld?.priceUsdPerOz ?? firstMetric.xauUsdPerOz),
      usdVnd: Number(latestFx?.rate ?? firstMetric.usdVnd),
      worldVndPerLuong: Number(firstMetric.worldVndPerLuong),
      change7d:
        firstMetric.xauMomentum7d === null || firstMetric.xauMomentum7d === undefined
          ? null
          : Number(firstMetric.xauMomentum7d)
    },
    macro: { dxy: latestDxy ? Number(latestDxy.value) : null },
    products: products
      .map((product) => {
        const metric = product.goldMetrics[0];
        const signal = product.signalSnapshots[0];
        if (!metric) return null;
        const buyPrice = Number(metric.domesticBuyPriceVnd);
        const sellPrice = Number(metric.domesticSellPriceVnd);
        const spreadPct = calculateSpreadPct(sellPrice, buyPrice);
        return {
          code: product.code,
          name: product.name,
          brand: product.brand,
          buyPrice,
          sellPrice,
          premiumSellPct: Number(metric.premiumSellPct),
          premiumBuyPct: Number(metric.premiumBuyPct),
          spreadAbsVnd: sellPrice - buyPrice,
          spreadPct,
          signal: signal?.signal ?? "DATA_UNRELIABLE",
          score: Number(signal?.score ?? 0),
          confidence: Number(signal?.confidence ?? 0),
          reasons: signal?.reasons ?? [],
          premiumPercentile180d:
            metric.premiumPercentile180d === null ? null : Number(metric.premiumPercentile180d),
          spreadPercentile180d:
            metric.spreadPercentile180d === null ? null : Number(metric.spreadPercentile180d),
          historySampleSize180d: historySampleSizes.get(product.id) ?? 0,
          xauMomentum7d: metric.xauMomentum7d === null ? null : Number(metric.xauMomentum7d),
          xauMomentum30d: metric.xauMomentum30d === null ? null : Number(metric.xauMomentum30d),
          xauMomentum7dDays:
            metric.xauMomentum7dDays === null ? null : Number(metric.xauMomentum7dDays),
          xauMomentum30dDays:
            metric.xauMomentum30dDays === null ? null : Number(metric.xauMomentum30dDays),
          domesticMomentum7d:
            metric.domesticMomentum7d === null ? null : Number(metric.domesticMomentum7d),
          domesticMomentum7dDays:
            metric.domesticMomentum7dDays === null ? null : Number(metric.domesticMomentum7dDays),
          previousDayClose: null
        };
      })
      .filter(Boolean)
  };

  await redis.set(SUMMARY_CACHE_KEY, JSON.stringify(summary), "EX", SUMMARY_CACHE_TTL_SECONDS);
  for (const product of products) {
    const metric = product.goldMetrics[0];
    const signal = product.signalSnapshots[0];
    if (metric)
      await redis.set(`product:${product.code}:metrics:latest:v2`, JSON.stringify(metric), "EX", 300);
    if (signal)
      await redis.set(`product:${product.code}:signal:latest`, JSON.stringify(signal), "EX", 300);
  }
  return summary;
}
