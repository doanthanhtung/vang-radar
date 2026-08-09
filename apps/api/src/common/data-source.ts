import type { PrismaService } from "./prisma.service.js";

export async function hasUsableLatestInputs(prisma: PrismaService): Promise<boolean> {
  const [domestic, world, fx] = await Promise.all([
    prisma.domesticGoldPrice.findFirst({
      where: { isValid: true, source: { code: { not: { startsWith: "MOCK_" } } } },
      select: { id: true },
      orderBy: { time: "desc" }
    }),
    prisma.worldGoldPrice.findFirst({
      where: {
        isValid: true,
        symbol: "XAUUSD",
        priceUsdPerOz: { gt: 100 },
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      select: { id: true },
      orderBy: { time: "desc" }
    }),
    prisma.fxRate.findFirst({
      where: {
        isValid: true,
        pair: "USDVND",
        rate: { gte: 20_000, lte: 40_000 },
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      select: { id: true },
      orderBy: { time: "desc" }
    })
  ]);

  return Boolean(domestic && world && fx);
}
