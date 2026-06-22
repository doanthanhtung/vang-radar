import type { PrismaClient } from "@prisma/client";
import { buildMomentum } from "@vang-radar/domain";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NON_MOCK_SOURCE = { code: { not: { startsWith: "MOCK_" } } } as const;

type PriceReference = { value: number; time: Date };

export type MomentumResult = { value: number; days: number } | null;

async function findWorldGoldReference(
  prisma: PrismaClient,
  targetDays: number,
  now: Date
): Promise<PriceReference | null> {
  const sinceTarget = new Date(now.getTime() - targetDays * MS_PER_DAY);

  const atTarget = await prisma.worldGoldPrice.findFirst({
    where: {
      isValid: true,
      symbol: "XAUUSD",
      time: { lte: sinceTarget },
      source: NON_MOCK_SOURCE
    },
    orderBy: { time: "desc" },
    select: { time: true, priceUsdPerOz: true }
  });
  if (atTarget) {
    return { value: Number(atTarget.priceUsdPerOz), time: atTarget.time };
  }

  const oldest = await prisma.worldGoldPrice.findFirst({
    where: {
      isValid: true,
      symbol: "XAUUSD",
      time: { lt: now },
      source: NON_MOCK_SOURCE
    },
    orderBy: { time: "asc" },
    select: { time: true, priceUsdPerOz: true }
  });
  if (!oldest) return null;

  return { value: Number(oldest.priceUsdPerOz), time: oldest.time };
}

async function findDomesticGoldReference(
  prisma: PrismaClient,
  productId: string,
  targetDays: number,
  now: Date
): Promise<PriceReference | null> {
  const sinceTarget = new Date(now.getTime() - targetDays * MS_PER_DAY);

  const atTarget = await prisma.domesticGoldPrice.findFirst({
    where: {
      productId,
      isValid: true,
      time: { lte: sinceTarget },
      source: NON_MOCK_SOURCE
    },
    orderBy: { time: "desc" },
    select: { time: true, sellPriceVnd: true }
  });
  if (atTarget) {
    return { value: Number(atTarget.sellPriceVnd), time: atTarget.time };
  }

  const oldest = await prisma.domesticGoldPrice.findFirst({
    where: {
      productId,
      isValid: true,
      time: { lt: now },
      source: NON_MOCK_SOURCE
    },
    orderBy: { time: "asc" },
    select: { time: true, sellPriceVnd: true }
  });
  if (!oldest) return null;

  return { value: Number(oldest.sellPriceVnd), time: oldest.time };
}

export async function computeWorldGoldMomentum(
  prisma: PrismaClient,
  currentPrice: number,
  targetDays: 7 | 30,
  now: Date
): Promise<MomentumResult> {
  const reference = await findWorldGoldReference(prisma, targetDays, now);
  return buildMomentum(currentPrice, reference, now);
}

export async function computeDomesticGoldMomentum(
  prisma: PrismaClient,
  productId: string,
  currentSellPrice: number,
  targetDays: 7,
  now: Date
): Promise<MomentumResult> {
  const reference = await findDomesticGoldReference(prisma, productId, targetDays, now);
  return buildMomentum(currentSellPrice, reference, now);
}