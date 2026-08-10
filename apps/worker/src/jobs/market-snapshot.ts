import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import { calculateSpreadPct, calculateWorldVndPerLuong } from "@vang-radar/domain";

const SNAPSHOT_POINTER_KEY = "market:snapshot:current";
const SNAPSHOT_TTL_SECONDS = 24 * 60 * 60;
const HISTORY_RANGES = ["7d", "30d", "180d", "1y"] as const;
const MARKET_HISTORY_DAYS = [7, 30] as const;
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

type SnapshotProduct = {
  id: string;
  code: string;
  name: string;
  brand: string;
  goldMetrics: Array<Record<string, unknown> & { time: Date }>;
  signalSnapshots: Array<Record<string, unknown> & { time: Date }>;
};

function vietnamDate(value: Date): string {
  return new Date(value.getTime() + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
}

function rangeStart(range: (typeof HISTORY_RANGES)[number]): Date {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "180d" ? 180 : 365;
  const vietnamNow = new Date(Date.now() + VIETNAM_OFFSET_MS);
  const vietnamStartOfToday = Date.UTC(
    vietnamNow.getUTCFullYear(),
    vietnamNow.getUTCMonth(),
    vietnamNow.getUTCDate()
  );
  return new Date(vietnamStartOfToday - (days - 1) * 24 * 60 * 60 * 1000 - VIETNAM_OFFSET_MS);
}

function snapshotKey(snapshotId: string, suffix: string): string {
  return `market:snapshot:${snapshotId}:${suffix}`;
}

export async function cleanupStaleMarketSnapshots(
  redis: Redis,
  currentSnapshotId: string
): Promise<number> {
  let cursor = "0";
  let deleted = 0;
  const currentPrefix = `market:snapshot:${currentSnapshotId}:`;

  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "market:snapshot:*", "COUNT", 500);
    const staleKeys = keys.filter(
      (key) => key !== SNAPSHOT_POINTER_KEY && !key.startsWith(currentPrefix)
    );
    if (staleKeys.length > 0) {
      deleted += await redis.unlink(...staleKeys);
    }
    cursor = nextCursor;
  } while (cursor !== "0");

  return deleted;
}

function numberValue(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function latestByVietnamDay<T extends { time: Date }>(
  points: T[],
  value: (point: T) => number | null
): Array<{ time: string; value: number }> {
  const byDay = new Map<string, { time: Date; value: number }>();
  for (const point of points) {
    const numeric = value(point);
    if (numeric === null) continue;
    const key = vietnamDate(point.time);
    const current = byDay.get(key);
    if (!current || point.time > current.time) byDay.set(key, { time: point.time, value: numeric });
  }
  return [...byDay.values()]
    .sort((left, right) => left.time.getTime() - right.time.getTime())
    .map((point) => ({ time: point.time.toISOString(), value: point.value }));
}

export function metricHistory(points: Array<Record<string, unknown> & { time: Date }>) {
  const byDay = new Map<string, (typeof points)[number]>();
  for (const point of points) {
    const day = vietnamDate(point.time);
    const existing = byDay.get(day);
    if (!existing || point.time > existing.time) byDay.set(day, point);
  }
  return [...byDay.values()]
    .sort((left, right) => left.time.getTime() - right.time.getTime())
    .map((point) => ({
      time: point.time.toISOString(),
      domesticBuyPriceVnd: point.domesticBuyPriceVnd,
      domesticSellPriceVnd: point.domesticSellPriceVnd,
      premiumSellPct: point.premiumSellPct,
      spreadPct: calculateSpreadPct(
        Number(point.domesticSellPriceVnd),
        Number(point.domesticBuyPriceVnd)
      )
    }));
}

export async function publishMarketSnapshot(prisma: PrismaClient, redis: Redis): Promise<string | null> {
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
      select: { time: true, value: true }
    }),
    prisma.goldProduct.findMany({
      where: { isActive: true },
      include: {
        goldMetrics: { orderBy: { time: "desc" }, take: 1 },
        signalSnapshots: { orderBy: { time: "desc" }, take: 1 }
      },
      orderBy: { code: "asc" }
    })
  ]);

  if (!latestFx || !latestWorld || products.length === 0) return null;
  const snapshotTime = new Date(Math.max(latestFx.time.getTime(), latestWorld.time.getTime()));
  const snapshotId = snapshotTime.toISOString();
  const typedProducts = products as unknown as SnapshotProduct[];

  const productRows = [];
  for (const product of typedProducts) {
    const metric = product.goldMetrics[0];
    const signal = product.signalSnapshots[0];
    const domestic = await prisma.domesticGoldPrice.findFirst({
      where: {
        productId: product.id,
        isValid: true,
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      orderBy: { time: "desc" }
    });
    if (!metric || !signal || !domestic || metric.time.getTime() !== snapshotTime.getTime() || signal.time.getTime() !== metric.time.getTime()) {
      return null;
    }
    const buyPrice = numberValue(metric.domesticBuyPriceVnd);
    const sellPrice = numberValue(metric.domesticSellPriceVnd);
    if (buyPrice === null || sellPrice === null || buyPrice <= 0 || sellPrice <= 0) return null;
    productRows.push({ product, metric, signal, buyPrice, sellPrice });
  }

  const worldVndPerLuong = calculateWorldVndPerLuong(
    Number(latestWorld.priceUsdPerOz),
    Number(latestFx.rate)
  );
  const historySampleSizes = new Map(
    await Promise.all(
      productRows.map(async ({ product, metric }) =>
        [
          product.id,
          metricHistory(
            (await prisma.goldMetric.findMany({
              where: {
                productId: product.id,
                time: { gte: new Date(Date.now() - 180 * 86_400_000), lt: metric.time }
              },
              orderBy: { time: "asc" }
            })) as never
          ).length
        ] as const
      )
    )
  );
  const summary = {
    time: snapshotId,
    world: {
      xauUsdPerOz: Number(latestWorld.priceUsdPerOz),
      usdVnd: Number(latestFx.rate),
      worldVndPerLuong,
      change7d: numberValue(productRows[0]?.metric.xauMomentum7d) ?? null
    },
    macro: { dxy: latestDxy ? Number(latestDxy.value) : null },
    products: productRows.map(({ product, metric, signal, buyPrice, sellPrice }) => ({
      code: product.code,
      name: product.name,
      brand: product.brand,
      buyPrice,
      sellPrice,
      premiumSellPct: Number(metric.premiumSellPct),
      premiumBuyPct: Number(metric.premiumBuyPct),
      spreadAbsVnd: sellPrice - buyPrice,
      spreadPct: calculateSpreadPct(sellPrice, buyPrice),
      signal: signal.signal,
      score: Number(signal.score),
      confidence: Number(signal.confidence),
      reasons: Array.isArray(signal.reasons) ? signal.reasons : [],
      premiumPercentile180d: numberValue(metric.premiumPercentile180d),
      spreadPercentile180d: numberValue(metric.spreadPercentile180d),
      historySampleSize180d: historySampleSizes.get(product.id) ?? 0,
      xauMomentum7d: numberValue(metric.xauMomentum7d),
      xauMomentum30d: numberValue(metric.xauMomentum30d),
      xauMomentum7dDays: numberValue(metric.xauMomentum7dDays),
      xauMomentum30dDays: numberValue(metric.xauMomentum30dDays),
      domesticMomentum7d: numberValue(metric.domesticMomentum7d),
      domesticMomentum7dDays: numberValue(metric.domesticMomentum7dDays),
      previousDayClose: null
    }))
  };

  const transaction = redis.multi();
  transaction.set(snapshotKey(snapshotId, "summary"), JSON.stringify(summary), "EX", SNAPSHOT_TTL_SECONDS);
  for (const { product, metric, signal } of productRows) {
    transaction.set(snapshotKey(snapshotId, `product:${product.code}:metric`), JSON.stringify(metric), "EX", SNAPSHOT_TTL_SECONDS);
    transaction.set(snapshotKey(snapshotId, `product:${product.code}:signal`), JSON.stringify(signal), "EX", SNAPSHOT_TTL_SECONDS);

    for (const range of HISTORY_RANGES) {
      const rows = await prisma.goldMetric.findMany({
        where: { productId: product.id, time: { gte: rangeStart(range) } },
        orderBy: { time: "asc" }
      });
      transaction.set(snapshotKey(snapshotId, `product:${product.code}:metrics:history:${range}`), JSON.stringify(metricHistory(rows as never)), "EX", SNAPSHOT_TTL_SECONDS);
    }

  }

  for (const days of MARKET_HISTORY_DAYS) {
    const since = new Date(Date.now() - days * 86_400_000);
    const [world, fx, dxy] = await Promise.all([
      prisma.worldGoldPrice.findMany({ where: { isValid: true, symbol: "XAUUSD", time: { gte: since } }, orderBy: { time: "asc" } }),
      prisma.fxRate.findMany({ where: { isValid: true, pair: "USDVND", time: { gte: since } }, orderBy: { time: "asc" } }),
      prisma.macroIndicator.findMany({ where: { isValid: true, code: "DXY", time: { gte: since } }, orderBy: { time: "asc" } })
    ]);
    transaction.set(snapshotKey(snapshotId, `market:world-gold:${days}`), JSON.stringify(latestByVietnamDay(world, (point) => numberValue(point.priceUsdPerOz)).map(({ time, value }) => ({ time, price: value }))), "EX", SNAPSHOT_TTL_SECONDS);
    transaction.set(snapshotKey(snapshotId, `market:usd-vnd:${days}`), JSON.stringify(latestByVietnamDay(fx, (point) => numberValue(point.rate)).map(({ time, value }) => ({ time, rate: value }))), "EX", SNAPSHOT_TTL_SECONDS);
    transaction.set(snapshotKey(snapshotId, `market:dxy:${days}`), JSON.stringify(latestByVietnamDay(dxy, (point) => numberValue(point.value))), "EX", SNAPSHOT_TTL_SECONDS);
  }

  transaction.set(SNAPSHOT_POINTER_KEY, JSON.stringify({ snapshotId }), "EX", SNAPSHOT_TTL_SECONDS);
  const result = await transaction.exec();
  if (!result || result.some(([error]) => error)) throw new Error("Failed to publish market snapshot");
  await cleanupStaleMarketSnapshots(redis, snapshotId);
  return snapshotId;
}
