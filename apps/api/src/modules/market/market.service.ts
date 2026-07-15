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
const HISTORY_CACHE_TTL_SECONDS = 60;
const DRAWDOWN_PLAN_WINDOW_DAYS = 252;
const DRAWDOWN_PLAN_QUERY_ROWS = 20_000;
const DRAWDOWN_PLAN_LEVELS = [0.03, 0.05, 0.07, 0.1] as const;
const DRAWDOWN_PLAN_STEP_EXPOSURE = 0.2;
const DRAWDOWN_PLAN_MAX_EXPOSURE = 0.5;
const DRAWDOWN_PLAN_PREMIUM_CAP = 0.7;
const DRAWDOWN_PLAN_SPREAD_CAP = 0.8;
const DRAWDOWN_PLAN_EXIT_PREMIUM = 0.8;

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
    experimentalDrawdownPlan?: ExperimentalDrawdownPlan;
  }>;
};

type MarketSummaryProduct = MarketSummary["products"][number];

type ExperimentalDrawdownPlan = {
  enabled: true;
  strategyName: "drawdown_ladder_v1";
  status: "READY" | "WAIT" | "BLOCKED";
  action: "BUY_STEP_1" | "BUY_STEP_2" | "TRIM" | "WAIT" | "BLOCKED";
  currentDrawdownPct: number;
  drawdownWindowDays: number;
  rollingHighPriceVnd: number;
  suggestedExposurePct: number;
  maxExposurePct: number;
  nextBuyLevelPct: number | null;
  premiumPercentile: number | null;
  spreadPercentile: number | null;
  premiumOk: boolean;
  spreadOk: boolean;
  reasons: string[];
  warnings: string[];
};

function isExperimentalDrawdownPlanEnabled(): boolean {
  return process.env.ENABLE_EXPERIMENTAL_DRAWDOWN_PLAN === "true";
}

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

function vietnamDate(value: Date): string {
  const local = new Date(value.getTime() + VIETNAM_OFFSET_MS);
  return local.toISOString().slice(0, 10);
}

function percentileRank(values: number[], current: number): number | null {
  const clean = values.filter(Number.isFinite);
  if (clean.length < 30 || !Number.isFinite(current)) return null;
  return clean.filter((value) => value <= current).length / clean.length;
}

function buildPlanFromDailyMetrics(
  dailyMetrics: Array<{
    domesticBuyPriceVnd: unknown;
    domesticSellPriceVnd: unknown;
    premiumSellPct: unknown;
    spreadPct: unknown;
  }>
): ExperimentalDrawdownPlan | null {
  if (dailyMetrics.length < 30) return null;
  const current = dailyMetrics[0];
  if (!current) return null;
  const domesticMids = dailyMetrics
    .map((metric) => (Number(metric.domesticBuyPriceVnd) + Number(metric.domesticSellPriceVnd)) / 2)
    .filter(Number.isFinite);
  const currentMid = domesticMids[0] ?? Number.NaN;
  if (!Number.isFinite(currentMid)) return null;
  const rollingHigh = Math.max(...domesticMids);
  if (!Number.isFinite(rollingHigh) || rollingHigh <= 0) return null;
  const currentDrawdownPct = currentMid / rollingHigh - 1;
  const premiumValues = dailyMetrics.map((metric) => Number(metric.premiumSellPct));
  const spreadValues = dailyMetrics.map((metric) => Number(metric.spreadPct));
  const premiumPercentile = percentileRank(premiumValues, Number(current.premiumSellPct));
  const spreadPercentile = percentileRank(spreadValues, Number(current.spreadPct));
  const premiumOk = premiumPercentile !== null && premiumPercentile <= DRAWDOWN_PLAN_PREMIUM_CAP;
  const spreadOk = spreadPercentile !== null && spreadPercentile <= DRAWDOWN_PLAN_SPREAD_CAP;
  const crossedLevels = DRAWDOWN_PLAN_LEVELS.filter((level) => currentDrawdownPct <= -level);
  const suggestedExposurePct = Math.min(
    DRAWDOWN_PLAN_MAX_EXPOSURE,
    crossedLevels.length * DRAWDOWN_PLAN_STEP_EXPOSURE
  );
  const nextLevel = DRAWDOWN_PLAN_LEVELS.find((level) => currentDrawdownPct > -level) ?? null;
  const reasons = [
    `Giá đang thấp hơn đỉnh ${DRAWDOWN_PLAN_WINDOW_DAYS} ngày ${Math.abs(currentDrawdownPct * 100).toFixed(1)}%.`,
    premiumOk
      ? "Premium đang trong vùng chấp nhận của chiến lược."
      : "Premium đang cao hơn vùng chấp nhận của chiến lược.",
    spreadOk
      ? "Spread đang trong vùng chấp nhận của chiến lược."
      : "Spread đang rộng hơn vùng chấp nhận của chiến lược."
  ];
  const warnings = ["Chiến lược thử nghiệm, chưa thay thế VangScore chính."];
  if (premiumPercentile !== null && premiumPercentile >= DRAWDOWN_PLAN_EXIT_PREMIUM) {
    return {
      enabled: true,
      strategyName: "drawdown_ladder_v1",
      status: "READY",
      action: "TRIM",
      currentDrawdownPct,
      drawdownWindowDays: DRAWDOWN_PLAN_WINDOW_DAYS,
      rollingHighPriceVnd: rollingHigh,
      suggestedExposurePct: 0,
      maxExposurePct: DRAWDOWN_PLAN_MAX_EXPOSURE,
      nextBuyLevelPct: nextLevel === null ? null : -nextLevel,
      premiumPercentile,
      spreadPercentile,
      premiumOk,
      spreadOk,
      reasons: ["Premium đã hồi lên vùng cao; chiến lược ưu tiên giảm vị thế.", ...reasons],
      warnings
    };
  }
  if (!premiumOk || !spreadOk) {
    return {
      enabled: true,
      strategyName: "drawdown_ladder_v1",
      status: "BLOCKED",
      action: "BLOCKED",
      currentDrawdownPct,
      drawdownWindowDays: DRAWDOWN_PLAN_WINDOW_DAYS,
      rollingHighPriceVnd: rollingHigh,
      suggestedExposurePct: 0,
      maxExposurePct: DRAWDOWN_PLAN_MAX_EXPOSURE,
      nextBuyLevelPct: nextLevel === null ? null : -nextLevel,
      premiumPercentile,
      spreadPercentile,
      premiumOk,
      spreadOk,
      reasons,
      warnings
    };
  }
  const step = Math.min(2, Math.max(1, crossedLevels.length));
  return {
    enabled: true,
    strategyName: "drawdown_ladder_v1",
    status: suggestedExposurePct > 0 ? "READY" : "WAIT",
    action: suggestedExposurePct > 0 ? (`BUY_STEP_${step}` as "BUY_STEP_1" | "BUY_STEP_2") : "WAIT",
    currentDrawdownPct,
    drawdownWindowDays: DRAWDOWN_PLAN_WINDOW_DAYS,
    rollingHighPriceVnd: rollingHigh,
    suggestedExposurePct,
    maxExposurePct: DRAWDOWN_PLAN_MAX_EXPOSURE,
    nextBuyLevelPct: nextLevel === null ? null : -nextLevel,
    premiumPercentile,
    spreadPercentile,
    premiumOk,
    spreadOk,
    reasons,
    warnings
  };
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

    const experimentalDrawdownPlanEnabled = isExperimentalDrawdownPlanEnabled();
    const cacheKey = `market:summary:latest:v7:drawdown-plan:${experimentalDrawdownPlanEnabled ? "on" : "off"}`;
    const cached = await this.redis.getJson<MarketSummary>(cacheKey);
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
    const [previousDayCloses, historySampleSizes, experimentalPlans] = await Promise.all([
      Promise.all(
        products.map(async (product) => {
          const rawPriceClose = await this.prisma.domesticGoldPrice.findFirst({
            where: {
              productId: product.id,
              isValid: true,
              time: { lt: previousDayCutoff },
              source: { code: { not: { startsWith: "MOCK_" } } }
            },
            orderBy: { time: "desc" },
            select: { buyPriceVnd: true, sellPriceVnd: true }
          });

          if (rawPriceClose) return [product.id, rawPriceClose] as const;

          const metricClose = await this.prisma.goldMetric.findFirst({
            where: {
              productId: product.id,
              time: { lt: previousDayCutoff }
            },
            orderBy: { time: "desc" },
            select: { domesticBuyPriceVnd: true, domesticSellPriceVnd: true }
          });

          return [
            product.id,
            metricClose
              ? {
                  buyPriceVnd: metricClose.domesticBuyPriceVnd,
                  sellPriceVnd: metricClose.domesticSellPriceVnd
                }
              : null
          ] as const;
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
      ).then((entries) => new Map(entries)),
      experimentalDrawdownPlanEnabled
        ? Promise.all(
            products.map(async (product) => {
              const rows = await this.prisma.goldMetric.findMany({
                where: { productId: product.id },
                orderBy: { time: "desc" },
                take: DRAWDOWN_PLAN_QUERY_ROWS,
                select: {
                  time: true,
                  domesticBuyPriceVnd: true,
                  domesticSellPriceVnd: true,
                  premiumSellPct: true,
                  spreadPct: true
                }
              });
              const byDay = new Map<string, (typeof rows)[number]>();
              for (const row of rows) {
                const key = vietnamDate(row.time);
                if (!byDay.has(key)) byDay.set(key, row);
                if (byDay.size >= DRAWDOWN_PLAN_WINDOW_DAYS) break;
              }
              return [product.id, buildPlanFromDailyMetrics(Array.from(byDay.values()))] as const;
            })
          ).then((entries) => new Map(entries))
        : Promise.resolve(new Map<string, ExperimentalDrawdownPlan | null>())
    ]);

    const firstMetric = products.find((product) => product.goldMetrics[0])?.goldMetrics[0];
    const effectiveWorldXau = Number(latestWorld?.priceUsdPerOz ?? firstMetric?.xauUsdPerOz ?? 0);
    const effectiveUsdVnd = Number(latestFx?.rate ?? firstMetric?.usdVnd ?? 0);
    const effectiveWorldVnd =
      latestFx && latestWorld
        ? calculateWorldVndPerLuong(effectiveWorldXau, effectiveUsdVnd)
        : Number(firstMetric?.worldVndPerLuong ?? 0);

    const summary: MarketSummary = {
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
          const previousDayClose = previousClose
            ? {
                buyPriceVnd: Number(previousClose.buyPriceVnd),
                sellPriceVnd: Number(previousClose.sellPriceVnd)
              }
            : null;
          const experimentalDrawdownPlan = experimentalPlans.get(product.id) ?? undefined;

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
              metric.premiumPercentile180d === null ? null : Number(metric.premiumPercentile180d),
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
              metric.domesticMomentum7dDays === null ? null : Number(metric.domesticMomentum7dDays),
            previousDayClose,
            ...(experimentalDrawdownPlan ? { experimentalDrawdownPlan } : {})
          };
        })
        .filter((product): product is MarketSummaryProduct => product !== null)
    };

    await this.redis.setJson(cacheKey, summary, 300);
    return summary;
  }

  async getWorldGoldHistory(days: number) {
    const cacheKey = `market:history:world-gold:${days}:v1`;
    const cached = await this.redis.getJson<Array<{ time: string; price: number }>>(cacheKey);
    if (cached) return cached;

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
    const result = latestTickByVietnamDay(prices, (price) => Number(price.priceUsdPerOz)).map(
      ({ time, value }) => ({ time, price: value })
    );
    await this.redis.setJson(cacheKey, result, HISTORY_CACHE_TTL_SECONDS);
    return result;
  }

  async getUsdVndHistory(days: number) {
    const cacheKey = `market:history:usd-vnd:${days}:v1`;
    const cached = await this.redis.getJson<Array<{ time: string; rate: number }>>(cacheKey);
    if (cached) return cached;

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
    const result = latestTickByVietnamDay(rates, (rate) => Number(rate.rate)).map(
      ({ time, value }) => ({
        time,
        rate: value
      })
    );
    await this.redis.setJson(cacheKey, result, HISTORY_CACHE_TTL_SECONDS);
    return result;
  }

  async getDxyHistory(days: number) {
    const cacheKey = `market:history:dxy:${days}:v1`;
    const cached = await this.redis.getJson<Array<{ time: string; value: number }>>(cacheKey);
    if (cached) return cached;

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const values = await this.prisma.macroIndicator.findMany({
      where: { code: "DXY", isValid: true, value: { gt: 0 }, time: { gte: since } },
      orderBy: { time: "asc" },
      select: { time: true, value: true }
    });
    const result = latestTickByVietnamDay(values, (point) => Number(point.value)).map(
      ({ time, value }) => ({
        time,
        value
      })
    );
    await this.redis.setJson(cacheKey, result, HISTORY_CACHE_TTL_SECONDS);
    return result;
  }
}
