import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { calculateSpreadPct, calculateWorldVndPerLuong } from "@vang-radar/domain";
import { hasMockLatestInputs } from "../../common/data-source.js";
import { PrismaService } from "../../common/prisma.service.js";
import { RedisService } from "../../common/redis.service.js";
import { latestTickByVietnamDay } from "./market-history.util.js";

type SummaryLike = {
  products?: Array<{
    premiumSellPct?: unknown;
    premiumBuyPct?: unknown;
    previousDayClose?: unknown;
  }>;
};

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

function vietnamStartOfToday(): Date {
  const localNow = new Date(Date.now() + VIETNAM_OFFSET_MS);
  return new Date(
    Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) -
      VIETNAM_OFFSET_MS
  );
}

type MarketSummary = {
  time: string;
  world: {
    xauUsdPerOz: number;
    usdVnd: number;
    worldVndPerLuong: number;
    change7d: number | null;
  };
  macro: {
    dxy: number | null;
  };
  products: Array<{
    code: string;
    name: string;
    brand: string;
    buyPrice: number;
    sellPrice: number;
    premiumSellPct: number;
    premiumBuyPct: number;
    spreadAbsVnd: number;
    spreadPct: number;
    signal: string;
    score: number;
    confidence: number;
    reasons: Prisma.JsonArray;
    premiumPercentile180d: number | null;
    spreadPercentile180d: number | null;
    historySampleSize180d: number;
    xauMomentum7d: number | null;
    xauMomentum30d: number | null;
    xauMomentum7dDays: number | null;
    xauMomentum30dDays: number | null;
    domesticMomentum7d: number | null;
    domesticMomentum7dDays: number | null;
    previousDayClose: {
      buyPriceVnd: number;
      sellPriceVnd: number;
    } | null;
  }>;
};

type MarketSummaryProduct = MarketSummary["products"][number];

function hasUnreasonablePercent(value: unknown): boolean {
  const numeric = Number(value);
  return !Number.isFinite(numeric) || Math.abs(numeric) > 5;
}

function hasUnreasonableSummary(summary: unknown): boolean {
  if (!summary || typeof summary !== "object") return true;
  const products = (summary as SummaryLike).products;
  if (!Array.isArray(products)) return true;
  return products.some(
    (product) =>
      hasUnreasonablePercent(product.premiumSellPct) ||
      hasUnreasonablePercent(product.premiumBuyPct) ||
      !("previousDayClose" in product) ||
      !("historySampleSize180d" in product)
  );
}

@Injectable()
export class MarketService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService
  ) {}

  async getSummary(): Promise<MarketSummary> {
    if (await hasMockLatestInputs(this.prisma)) {
      return {
        time: new Date().toISOString(),
        world: { xauUsdPerOz: 0, usdVnd: 0, worldVndPerLuong: 0, change7d: null },
        macro: { dxy: null },
        products: []
      };
    }

    const cached = await this.redis.getJson<MarketSummary>("market:summary:latest:v3");
    if (cached && !hasUnreasonableSummary(cached)) return cached;

    const latestFx = await this.prisma.fxRate.findFirst({
      where: {
        isValid: true,
        pair: "USDVND",
        rate: { gte: 20_000, lte: 40_000 },
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      orderBy: { time: "desc" }
    });
    const latestWorld = await this.prisma.worldGoldPrice.findFirst({
      where: {
        isValid: true,
        symbol: "XAUUSD",
        priceUsdPerOz: { gt: 100 },
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      orderBy: { time: "desc" }
    });
    const latestDxy = await this.prisma.macroIndicator.findFirst({
      where: { code: "DXY", isValid: true, value: { gt: 0 } },
      orderBy: { time: "desc" },
      select: { value: true }
    });
    const products = await this.prisma.goldProduct
      .findMany({
        where: { isActive: true },
        include: {
          goldMetrics: { orderBy: { time: "desc" }, take: 1 },
          signalSnapshots: { orderBy: { time: "desc" }, take: 1 }
        },
        orderBy: { code: "asc" }
      })
      .catch(() => []);

    const previousDayCutoff = vietnamStartOfToday();
    const since180d = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const [previousDayCloses, historySampleSizes] = await Promise.all([
      Promise.all(
        products.map(async (product) => {
          const close = await this.prisma.domesticGoldPrice.findFirst({
            where: {
              productId: product.id,
              isValid: true,
              time: { lt: previousDayCutoff },
              source: { code: { not: { startsWith: "MOCK_" } } }
            },
            orderBy: { time: "desc" },
            select: { buyPriceVnd: true, sellPriceVnd: true }
          });
          return [product.id, close] as const;
        })
      ).then((entries) => new Map(entries)),
      Promise.all(
        products.map(async (product) => {
          const metric = product.goldMetrics[0];
          if (!metric) return [product.id, 0] as const;
          const count = await this.prisma.goldMetric.count({
            where: {
              productId: product.id,
              time: { gte: since180d, lt: metric.time }
            }
          });
          return [product.id, count] as const;
        })
      ).then((entries) => new Map(entries))
    ]);

    const firstMetric = products.find((product) => product.goldMetrics[0])?.goldMetrics[0];
    const effectiveWorldXau = Number(latestWorld?.priceUsdPerOz ?? firstMetric?.xauUsdPerOz ?? 0);
    const effectiveUsdVnd = Number(latestFx?.rate ?? firstMetric?.usdVnd ?? 0);
    const effectiveWorldVnd =
      latestFx && latestWorld
        ? calculateWorldVndPerLuong(effectiveWorldXau, effectiveUsdVnd)
        : Number(firstMetric?.worldVndPerLuong ?? 0);

    return {
      time:
        (latestFx || latestWorld)?.time?.toISOString() ??
        firstMetric?.time.toISOString() ??
        new Date().toISOString(),
      world: {
        xauUsdPerOz: effectiveWorldXau,
        usdVnd: effectiveUsdVnd,
        worldVndPerLuong: effectiveWorldVnd,
        change7d:
          firstMetric?.xauMomentum7d === null || firstMetric?.xauMomentum7d === undefined
            ? null
            : Number(firstMetric.xauMomentum7d)
      },
      macro: { dxy: latestDxy ? Number(latestDxy.value) : null },
      products: products
        .map((product) => {
          const metric = product.goldMetrics[0];
          const signal = product.signalSnapshots[0];
          if (!metric) return null;

          let buy = Number(metric.domesticBuyPriceVnd);
          let sell = Number(metric.domesticSellPriceVnd);
          let premSell = Number(metric.premiumSellPct);
          let premBuy = Number(metric.premiumBuyPct);
          let spreadAbs = Number(metric.spreadAbsVnd);
          let spreadP = Number(metric.spreadPct);

          const storedUsd = Number(metric.usdVnd);
          const storedWorldVnd = Number(metric.worldVndPerLuong);
          const metricLooksBad =
            !storedUsd ||
            storedUsd < 1000 ||
            !storedWorldVnd ||
            storedWorldVnd < 1_000_000 ||
            hasUnreasonablePercent(premSell) ||
            hasUnreasonablePercent(premBuy);

          if (metricLooksBad && latestFx && latestWorld && effectiveWorldVnd > 0) {
            const w = effectiveWorldVnd;
            premBuy = buy / w - 1;
            premSell = sell / w - 1;
          }

          spreadAbs = sell - buy;
          spreadP = calculateSpreadPct(sell, buy);

          const previousClose = previousDayCloses.get(product.id);
          const previousDayClose =
            previousClose
              ? {
                  buyPriceVnd: Number(previousClose.buyPriceVnd),
                  sellPriceVnd: Number(previousClose.sellPriceVnd)
                }
              : null;

          return {
            code: product.code,
            name: product.name,
            brand: product.brand,
            buyPrice: buy,
            sellPrice: sell,
            premiumSellPct: premSell,
            premiumBuyPct: premBuy,
            spreadAbsVnd: spreadAbs,
            spreadPct: spreadP,
            signal: signal?.signal ?? "DATA_UNRELIABLE",
            score: Number(signal?.score ?? 0),
            confidence: Number(signal?.confidence ?? 0),
            reasons: Array.isArray(signal?.reasons) ? signal.reasons : [],
            premiumPercentile180d:
              metric.premiumPercentile180d === null
                ? null
                : Number(metric.premiumPercentile180d),
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
              metric.domesticMomentum7dDays === null
                ? null
                : Number(metric.domesticMomentum7dDays),
            previousDayClose
          };
        })
        .filter((product): product is MarketSummaryProduct => product !== null)
    };
  }

  async getWorldGoldHistory(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const prices = await this.prisma.worldGoldPrice.findMany({
      where: {
        isValid: true,
        symbol: "XAUUSD",
        time: { gte: since },
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      orderBy: { time: "asc" },
      select: { time: true, priceUsdPerOz: true }
    });
    return latestTickByVietnamDay(prices, (price) => Number(price.priceUsdPerOz)).map(
      ({ time, value }) => ({ time, price: value })
    );
  }

  async getUsdVndHistory(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rates = await this.prisma.fxRate.findMany({
      where: {
        isValid: true,
        pair: "USDVND",
        rate: { gte: 20_000, lte: 40_000 },
        time: { gte: since },
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      orderBy: { time: "asc" },
      select: { time: true, rate: true }
    });
    return latestTickByVietnamDay(rates, (rate) => Number(rate.rate)).map(({ time, value }) => ({
      time,
      rate: value
    }));
  }

  async getDxyHistory(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const values = await this.prisma.macroIndicator.findMany({
      where: { code: "DXY", isValid: true, value: { gt: 0 }, time: { gte: since } },
      orderBy: { time: "asc" },
      select: { time: true, value: true }
    });
    return latestTickByVietnamDay(values, (point) => Number(point.value)).map(({ time, value }) => ({
      time,
      value
    }));
  }
}
