import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { calculateSpreadPct, calculateWorldVndPerLuong } from "@vang-radar/domain";
import { hasMockLatestInputs } from "../../common/data-source.js";
import { PrismaService } from "../../common/prisma.service.js";
import { RedisService } from "../../common/redis.service.js";

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
      !("previousDayClose" in product)
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
        products: []
      };
    }

    const cached = await this.redis.getJson<MarketSummary>("market:summary:latest:v2");
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
    const world7d = await this.prisma.worldGoldPrice.findFirst({
      where: {
        isValid: true,
        symbol: "XAUUSD",
        time: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      orderBy: { time: "desc" }
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
    const previousDayCloses = new Map(
      await Promise.all(
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
      )
    );

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
          latestWorld && world7d && Number(world7d.priceUsdPerOz) !== 0
            ? Number(latestWorld.priceUsdPerOz) / Number(world7d.priceUsdPerOz) - 1
            : null
      },
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
      select: { time: true, priceUsdPerOz: true },
      take: 1000
    });
    return prices.map((price) => ({ time: price.time.toISOString(), price: Number(price.priceUsdPerOz) }));
  }
}
