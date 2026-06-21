import { Inject, Injectable } from "@nestjs/common";
import { calculateSpreadPct, type HistoryRange, type ProductCode } from "@vang-radar/domain";
import { PrismaService } from "../../common/prisma.service.js";
import { rangeToDate } from "../../common/range.js";

type DailyPrice = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  isToday: boolean;
  isTemporaryClose: boolean;
  changePercent: number | null;
  intradayRangePercent: number | null;
  spreadPercent: number | null;
  premiumPercent: number | null;
};

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

function vietnamDate(value: Date): string {
  const local = new Date(value.getTime() + VIETNAM_OFFSET_MS);
  return local.toISOString().slice(0, 10);
}

function vietnamStartDate(days: number): Date {
  const localNow = new Date(Date.now() + VIETNAM_OFFSET_MS);
  const start = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate());
  return new Date(start - (days - 1) * 86_400_000 - VIETNAM_OFFSET_MS);
}

@Injectable()
export class PricesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getLatest() {
    const products = await this.prisma.goldProduct.findMany({
      where: { isActive: true },
      include: {
        domesticGoldPrices: {
          where: { isValid: true, source: { code: { not: { startsWith: "MOCK_" } } } },
          orderBy: { time: "desc" },
          take: 1
        }
      }
    });

    return products.map((product) => ({
      productCode: product.code,
      name: product.name,
      brand: product.brand,
      latest: product.domesticGoldPrices[0] ?? null
    }));
  }

  async getHistory(productCode: ProductCode, range: HistoryRange) {
    const since = rangeToDate(range);
    return this.prisma.domesticGoldPrice.findMany({
      where: {
        isValid: true,
        time: { gte: since },
        product: { code: productCode },
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      orderBy: { time: "asc" },
      take: 2000
    });
  }

  async getDailyHistory(productCode: ProductCode, days: number) {
    const since = vietnamStartDate(days);
    const product = await this.prisma.goldProduct.findUnique({
      where: { code: productCode },
      select: { id: true, code: true }
    });
    if (!product) return { type: productCode, days, data: [] as DailyPrice[] };

    const [prices, metrics] = await Promise.all([
      this.prisma.domesticGoldPrice.findMany({
        where: {
          productId: product.id,
          isValid: true,
          time: { gte: since },
          source: { code: { not: { startsWith: "MOCK_" } } }
        },
        orderBy: { time: "asc" },
        select: { time: true, buyPriceVnd: true, sellPriceVnd: true }
      }),
      this.prisma.goldMetric.findMany({
        where: { productId: product.id, time: { gte: since } },
        orderBy: { time: "asc" },
        select: { time: true, spreadPct: true, premiumSellPct: true }
      })
    ]);

    const priceDays = new Map<string, typeof prices>();
    for (const price of prices) {
      const date = vietnamDate(price.time);
      priceDays.set(date, [...(priceDays.get(date) ?? []), price]);
    }
    const metricByDay = new Map<string, (typeof metrics)[number]>();
    for (const metric of metrics) metricByDay.set(vietnamDate(metric.time), metric);

    const today = vietnamDate(new Date());
    let previousClose: number | null = null;
    const data: DailyPrice[] = Array.from(priceDays.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, dailyPrices]) => {
        const open = Number(dailyPrices[0]!.sellPriceVnd);
        const latestPrice = dailyPrices[dailyPrices.length - 1]!;
        const close = Number(latestPrice.sellPriceVnd);
        const high = Math.max(...dailyPrices.map((price) => Number(price.sellPriceVnd)));
        const low = Math.min(...dailyPrices.map((price) => Number(price.sellPriceVnd)));
        const metric = metricByDay.get(date);
        const changePercent =
          previousClose && previousClose !== 0 ? (close - previousClose) / previousClose : null;
        previousClose = close;
        return {
          date,
          open,
          high,
          low,
          close,
          isToday: date === today,
          isTemporaryClose: date === today,
          changePercent,
          intradayRangePercent: open === 0 ? null : (high - low) / open,
          spreadPercent: calculateSpreadPct(
            Number(latestPrice.sellPriceVnd),
            Number(latestPrice.buyPriceVnd)
          ),
          premiumPercent: metric ? Number(metric.premiumSellPct) : null
        };
      });

    return { type: product.code, days, data };
  }
}
