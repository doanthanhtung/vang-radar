import type { PrismaService } from "./prisma.service.js";

export async function hasMockLatestInputs(prisma: PrismaService): Promise<boolean> {
  const [domestic, world, fx] = await Promise.all([
    prisma.domesticGoldPrice.findFirst({
      where: { isValid: true, source: { code: { not: { startsWith: "MOCK_" } } } },
      include: { source: true },
      orderBy: { time: "desc" }
    }),
    prisma.worldGoldPrice.findFirst({
      where: {
        isValid: true,
        symbol: "XAUUSD",
        priceUsdPerOz: { gt: 100 },
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      include: { source: true },
      orderBy: { time: "desc" }
    }),
    prisma.fxRate.findFirst({
      where: {
        isValid: true,
        pair: "USDVND",
        rate: { gte: 20_000, lte: 40_000 },
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      include: { source: true },
      orderBy: { time: "desc" }
    })
  ]);

  return !domestic || !world || !fx;
}
