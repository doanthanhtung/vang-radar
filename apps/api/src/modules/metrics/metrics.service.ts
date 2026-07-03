import { Inject, Injectable } from "@nestjs/common";
import { calculateSpreadPct, type HistoryRange, type ProductCode } from "@vang-radar/domain";
import { hasMockLatestInputs } from "../../common/data-source.js";
import { PrismaService } from "../../common/prisma.service.js";
import { RedisService } from "../../common/redis.service.js";
import { rangeToDate } from "../../common/range.js";

const HISTORY_CACHE_TTL_SECONDS = 60;
const HISTORY_MAX_POINTS: Record<HistoryRange, number> = {
  "7d": 7,
  "30d": 30,
  "180d": 180,
  "1y": 365
};
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

type MetricHistoryPoint = {
  time: Date;
  domesticBuyPriceVnd: unknown;
  domesticSellPriceVnd: unknown;
  premiumSellPct: unknown;
  spreadPct: unknown;
};

function vietnamDate(value: Date): string {
  const local = new Date(value.getTime() + VIETNAM_OFFSET_MS);
  return local.toISOString().slice(0, 10);
}

function isHistoricalBackfillPoint(point: MetricHistoryPoint): boolean {
  return (
    point.time.getUTCHours() === 5 &&
    point.time.getUTCMinutes() === 0 &&
    point.time.getUTCSeconds() === 0 &&
    point.time.getUTCMilliseconds() === 0
  );
}

function pickDailyHistory(points: MetricHistoryPoint[]): MetricHistoryPoint[] {
  const byDate = new Map<string, MetricHistoryPoint>();
  const today = vietnamDate(new Date());

  for (const point of points) {
    const date = vietnamDate(point.time);
    const existing = byDate.get(date);
    if (!existing) {
      byDate.set(date, point);
      continue;
    }

    if (date === today) {
      if (point.time > existing.time) byDate.set(date, point);
      continue;
    }

    const pointIsBackfill = isHistoricalBackfillPoint(point);
    const existingIsBackfill = isHistoricalBackfillPoint(existing);

    if (pointIsBackfill && !existingIsBackfill) {
      byDate.set(date, point);
    } else if (pointIsBackfill === existingIsBackfill && point.time > existing.time) {
      byDate.set(date, point);
    }
  }

  return [...byDate.values()].sort((left, right) => left.time.getTime() - right.time.getTime());
}

function limitDailyHistory(points: MetricHistoryPoint[], maxPoints: number): MetricHistoryPoint[] {
  if (points.length <= maxPoints) return points;
  return points.slice(points.length - maxPoints);
}

@Injectable()
export class MetricsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService
  ) {}

  async getLatest(productCode: ProductCode) {
    if (await hasMockLatestInputs(this.prisma)) return null;

    const cached = await this.redis.getJson(`product:${productCode}:metrics:latest:v2`);
    if (cached) return cached;

    return this.prisma.goldMetric.findFirst({
      where: { product: { code: productCode } },
      orderBy: { time: "desc" }
    });
  }

  async getHistory(productCode: ProductCode, range: HistoryRange) {
    if (await hasMockLatestInputs(this.prisma)) return [];

    const cacheKey = `product:${productCode}:metrics:history:${range}:v6`;
    const cached = await this.redis.getJson<MetricHistoryPoint[]>(cacheKey);
    if (cached) return cached;

    const history = await this.prisma.goldMetric.findMany({
      where: { product: { code: productCode }, time: { gte: rangeToDate(range) } },
      orderBy: { time: "asc" },
      select: {
        time: true,
        domesticBuyPriceVnd: true,
        domesticSellPriceVnd: true,
        premiumSellPct: true,
        spreadPct: true
      }
    });

    const points = limitDailyHistory(pickDailyHistory(history), HISTORY_MAX_POINTS[range]);

    const result = points.map((point) => {
      return {
        ...point,
        spreadPct: calculateSpreadPct(
          Number(point.domesticSellPriceVnd),
          Number(point.domesticBuyPriceVnd)
        )
      };
    });
    await this.redis.setJson(cacheKey, result, HISTORY_CACHE_TTL_SECONDS);
    return result;
  }
}
