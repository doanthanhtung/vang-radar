import type { PrismaClient } from "@prisma/client";
import {
  calculatePremiumPct,
  calculateSpreadAbsVnd,
  calculateSpreadPct,
  calculateWorldVndPerLuong
} from "@vang-radar/domain";
import { computeDomesticGoldMomentum, computeWorldGoldMomentum } from "./momentum-lookup.js";

function percentileRank(values: number[], current: number): number | null {
  if (values.length === 0) return null;
  const count = values.filter((value) => value <= current).length;
  return (count / values.length) * 100;
}

export async function calculateLatestMetrics(prisma: PrismaClient) {
  const [world, fx, products] = await Promise.all([
    prisma.worldGoldPrice.findFirst({
      where: {
        isValid: true,
        symbol: "XAUUSD",
        priceUsdPerOz: { gt: 100 },
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      orderBy: { time: "desc" }
    }),
    prisma.fxRate.findFirst({
      where: {
        isValid: true,
        pair: "USDVND",
        rate: { gte: 20_000, lte: 40_000 },
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      orderBy: { time: "desc" }
    }),
    prisma.goldProduct.findMany({ where: { isActive: true } })
  ]);

  if (!world || !fx) return [];

  const now = new Date(Math.max(world.time.getTime(), fx.time.getTime()));
  const worldVndPerLuong = calculateWorldVndPerLuong(Number(world.priceUsdPerOz), Number(fx.rate));
  const since180d = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const currentXau = Number(world.priceUsdPerOz);
  const [xauMomentum7d, xauMomentum30d] = await Promise.all([
    computeWorldGoldMomentum(prisma, currentXau, 7, now),
    computeWorldGoldMomentum(prisma, currentXau, 30, now)
  ]);
  const created = [];

  for (const product of products) {
    const domestic = await prisma.domesticGoldPrice.findFirst({
      where: {
        productId: product.id,
        isValid: true,
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      orderBy: { time: "desc" }
    });
    if (!domestic) continue;

    const historicalMetrics = await prisma.goldMetric.findMany({
      where: { productId: product.id, time: { gte: since180d } },
      orderBy: { time: "asc" },
      take: 5000
    });
    const premiumSellPct = calculatePremiumPct(Number(domestic.sellPriceVnd), worldVndPerLuong);
    const premiumBuyPct = calculatePremiumPct(Number(domestic.buyPriceVnd), worldVndPerLuong);
    const spreadAbsVnd = calculateSpreadAbsVnd(
      Number(domestic.sellPriceVnd),
      Number(domestic.buyPriceVnd)
    );
    const spreadPct = calculateSpreadPct(
      Number(domestic.sellPriceVnd),
      Number(domestic.buyPriceVnd)
    );
    const premiumPercentile180d = percentileRank(
      historicalMetrics.map((item) => Number(item.premiumSellPct)),
      premiumSellPct
    );
    const spreadPercentile180d = percentileRank(
      historicalMetrics.map((item) => Number(item.spreadPct)),
      spreadPct
    );

    const domesticMomentum7d = await computeDomesticGoldMomentum(
      prisma,
      product.id,
      Number(domestic.sellPriceVnd),
      7,
      now
    );

    const metric = await prisma.goldMetric.upsert({
      where: { productId_time: { productId: product.id, time: now } },
      update: {
        domesticBuyPriceVnd: domestic.buyPriceVnd,
        domesticSellPriceVnd: domestic.sellPriceVnd,
        xauUsdPerOz: world.priceUsdPerOz,
        usdVnd: fx.rate,
        worldVndPerLuong,
        premiumBuyPct,
        premiumSellPct,
        spreadAbsVnd,
        spreadPct,
        premiumPercentile180d,
        spreadPercentile180d,
        xauMomentum7d: xauMomentum7d?.value ?? null,
        xauMomentum30d: xauMomentum30d?.value ?? null,
        xauMomentum7dDays: xauMomentum7d?.days ?? null,
        xauMomentum30dDays: xauMomentum30d?.days ?? null,
        domesticMomentum7d: domesticMomentum7d?.value ?? null,
        domesticMomentum7dDays: domesticMomentum7d?.days ?? null
      },
      create: {
        time: now,
        productId: product.id,
        domesticBuyPriceVnd: domestic.buyPriceVnd,
        domesticSellPriceVnd: domestic.sellPriceVnd,
        xauUsdPerOz: world.priceUsdPerOz,
        usdVnd: fx.rate,
        worldVndPerLuong,
        premiumBuyPct,
        premiumSellPct,
        spreadAbsVnd,
        spreadPct,
        premiumPercentile180d,
        spreadPercentile180d,
        xauMomentum7d: xauMomentum7d?.value ?? null,
        xauMomentum30d: xauMomentum30d?.value ?? null,
        xauMomentum7dDays: xauMomentum7d?.days ?? null,
        xauMomentum30dDays: xauMomentum30d?.days ?? null,
        domesticMomentum7d: domesticMomentum7d?.value ?? null,
        domesticMomentum7dDays: domesticMomentum7d?.days ?? null
      }
    });
    created.push(metric);
  }

  return created;
}