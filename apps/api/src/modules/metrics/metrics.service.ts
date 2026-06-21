import { Inject, Injectable } from "@nestjs/common";
import { calculateSpreadPct, type HistoryRange, type ProductCode } from "@vang-radar/domain";
import { hasMockLatestInputs } from "../../common/data-source.js";
import { PrismaService } from "../../common/prisma.service.js";
import { RedisService } from "../../common/redis.service.js";
import { rangeToDate } from "../../common/range.js";

const HISTORY_CACHE_TTL_SECONDS = 60;
const HISTORY_MAX_POINTS: Record<HistoryRange, number> = {
  "7d": 200,
  "30d": 240,
  "180d": 180,
  "1y": 365
};

type MetricHistoryPoint = {
  time: Date;
  domesticBuyPriceVnd: unknown;
  domesticSellPriceVnd: unknown;
  premiumSellPct: unknown;
  spreadPct: unknown;
};

function downsampleHistory(points: MetricHistoryPoint[], maxPoints: number): MetricHistoryPoint[] {
  if (points.length <= maxPoints) return points;

  return Array.from({ length: maxPoints }, (_, index) => {
    const end = Math.floor(((index + 1) * points.length) / maxPoints);
    return points[Math.max(0, end - 1)]!;
  });
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

    const cacheKey = `product:${productCode}:metrics:history:${range}:v3`;
    const cached = await this.redis.getJson<MetricHistoryPoint[]>(cacheKey);
    if (cached) return cached;

    const history = await this.prisma.goldMetric.findMany({
      where: { product: { code: productCode }, time: { gte: rangeToDate(range) } },
      orderBy: { time: "asc" },
      take: 2000,
      select: {
        time: true,
        domesticBuyPriceVnd: true,
        domesticSellPriceVnd: true,
        premiumSellPct: true,
        spreadPct: true
      }
    });

    const result = downsampleHistory(history, HISTORY_MAX_POINTS[range]).map((point) => {
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
