import type { PrismaClient } from "@prisma/client";
import { calculateSpreadPct, generateDecisionSignal, type ProductCode } from "@vang-radar/domain";

export async function generateLatestSignals(prisma: PrismaClient) {
  const products = await prisma.goldProduct.findMany({ where: { isActive: true } });
  const snapshots = [];

  for (const product of products) {
    const metric = await prisma.goldMetric.findFirst({
      where: { productId: product.id },
      orderBy: { time: "desc" }
    });
    if (!metric) continue;

    const buyPrice = Number(metric.domesticBuyPriceVnd);
    const sellPrice = Number(metric.domesticSellPriceVnd);
    const spreadPct = calculateSpreadPct(sellPrice, buyPrice);

    const since180d = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const historicalMetricCount = await prisma.goldMetric.count({
      where: {
        productId: product.id,
        time: { gte: since180d, lt: metric.time }
      }
    });

    const output = generateDecisionSignal({
      productCode: product.code as ProductCode,
      domesticBuyPriceVnd: buyPrice,
      domesticSellPriceVnd: sellPrice,
      xauUsdPerOz: Number(metric.xauUsdPerOz),
      usdVnd: Number(metric.usdVnd),
      worldVndPerLuong: Number(metric.worldVndPerLuong),
      premiumBuyPct: Number(metric.premiumBuyPct),
      premiumSellPct: Number(metric.premiumSellPct),
      spreadAbsVnd: sellPrice - buyPrice,
      spreadPct,
      premiumPercentile180d:
        metric.premiumPercentile180d === null ? null : Number(metric.premiumPercentile180d),
      spreadPercentile180d:
        metric.spreadPercentile180d === null ? null : Number(metric.spreadPercentile180d),
      premiumSampleSize180d: historicalMetricCount,
      spreadSampleSize180d: historicalMetricCount,
      xauMomentum7d: metric.xauMomentum7d === null ? null : Number(metric.xauMomentum7d),
      xauMomentum30d: metric.xauMomentum30d === null ? null : Number(metric.xauMomentum30d),
      domesticMomentum7d:
        metric.domesticMomentum7d === null ? null : Number(metric.domesticMomentum7d),
      dataQualityScore: 100,
      isDataValid: true
    });

    const snapshot = await prisma.signalSnapshot.upsert({
      where: { productId_time: { productId: product.id, time: metric.time } },
      update: output,
      create: {
        time: metric.time,
        productId: product.id,
        signal: output.signal,
        score: output.score,
        confidence: output.confidence,
        reasons: output.reasons,
        metrics: {
          premiumSellPct: Number(metric.premiumSellPct),
          spreadPct
        }
      }
    });
    snapshots.push(snapshot);
  }

  return snapshots;
}
