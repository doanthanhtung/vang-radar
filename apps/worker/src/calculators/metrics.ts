import type { PrismaClient } from "@prisma/client";
import {
  calculatePremiumPct,
  calculateSpreadAbsVnd,
  calculateSpreadPct,
  calculateWorldVndPerLuong
} from "@vang-radar/domain";

function percentileRank(values: number[], current: number): number | null {
  if (values.length === 0) return null;
  const count = values.filter((value) => value <= current).length;
  return (count / values.length) * 100;
}

function momentum(current: number, previous: number | null): number | null {
  if (!previous || previous <= 0) return null;
  return current / previous - 1;
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
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
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

    const world7d = await prisma.worldGoldPrice.findFirst({
      where: {
        isValid: true,
        symbol: "XAUUSD",
        time: { lte: since7d },
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      orderBy: { time: "desc" }
    });
    const world30d = await prisma.worldGoldPrice.findFirst({
      where: {
        isValid: true,
        symbol: "XAUUSD",
        time: { lte: since30d },
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      orderBy: { time: "desc" }
    });
    const domestic7d = await prisma.domesticGoldPrice.findFirst({
      where: {
        productId: product.id,
        isValid: true,
        time: { lte: since7d },
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      orderBy: { time: "desc" }
    });
    const xauMomentum7d = momentum(
      Number(world.priceUsdPerOz),
      world7d ? Number(world7d.priceUsdPerOz) : null
    );
    const xauMomentum30d = momentum(
      Number(world.priceUsdPerOz),
      world30d ? Number(world30d.priceUsdPerOz) : null
    );
    const domesticMomentum7d = momentum(
      Number(domestic.sellPriceVnd),
      domestic7d ? Number(domestic7d.sellPriceVnd) : null
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
        xauMomentum7d,
        xauMomentum30d,
        domesticMomentum7d
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
        xauMomentum7d,
        xauMomentum30d,
        domesticMomentum7d
      }
    });
    created.push(metric);
  }

  return created;
}
