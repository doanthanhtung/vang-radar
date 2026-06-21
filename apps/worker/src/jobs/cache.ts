import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import { calculateSpreadPct } from "@vang-radar/domain";

export async function refreshMarketSummaryCache(prisma: PrismaClient, redis: Redis) {
  const products = await prisma.goldProduct.findMany({
    where: { isActive: true },
    include: {
      goldMetrics: { orderBy: { time: "desc" }, take: 1 },
      signalSnapshots: { orderBy: { time: "desc" }, take: 1 }
    }
  });

  const firstMetric = products.find((product) => product.goldMetrics[0])?.goldMetrics[0];
  if (!firstMetric) return null;

  const summary = {
    time: firstMetric.time.toISOString(),
    world: {
      xauUsdPerOz: Number(firstMetric.xauUsdPerOz),
      usdVnd: Number(firstMetric.usdVnd),
      worldVndPerLuong: Number(firstMetric.worldVndPerLuong)
    },
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
          reasons: signal?.reasons ?? []
        };
      })
      .filter(Boolean)
  };

  await redis.set("market:summary:latest:v2", JSON.stringify(summary), "EX", 300);
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
