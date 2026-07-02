import type {
  DailyGoldPrice,
  DxyHistoryPoint,
  GoldPriceHistory,
  UsdVndHistoryPoint,
  WorldGoldHistoryPoint
} from "./api-client";

export interface FactorHistoryPoint {
  date: string;
  value: number;
  change: number | null;
}

export function toVietnamDateKey(time: string): string {
  return new Date(time).toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
}

function buildLatestValueByDayHistory(
  points: Array<{ time: string; value: number }>
): FactorHistoryPoint[] {
  const latestByDay = new Map<string, number>();
  for (const point of points) {
    latestByDay.set(toVietnamDateKey(point.time), point.value);
  }

  return buildDailySeries(
    [...latestByDay.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, value]) => ({ date, value }))
  );
}

export function buildWorldGoldDailyHistory(points: WorldGoldHistoryPoint[]): FactorHistoryPoint[] {
  return buildLatestValueByDayHistory(
    points.map((point) => ({ time: point.time, value: point.price }))
  );
}

export function buildFxDailyHistory(points: UsdVndHistoryPoint[]): FactorHistoryPoint[] {
  return buildLatestValueByDayHistory(
    points.map((point) => ({ time: point.time, value: point.rate }))
  );
}

export function buildDxyDailyHistory(points: DxyHistoryPoint[]): FactorHistoryPoint[] {
  return buildLatestValueByDayHistory(points.map((point) => ({ time: point.time, value: point.value })));
}

export function buildAverageDailyGoldHistory(
  histories: GoldPriceHistory[],
  field: "premiumPercent" | "spreadPercent"
): FactorHistoryPoint[] {
  const valuesByDay = new Map<string, number[]>();

  for (const history of histories) {
    for (const point of history.data) {
      const value = point[field];
      if (value === null || !Number.isFinite(value)) continue;
      valuesByDay.set(point.date, [...(valuesByDay.get(point.date) ?? []), value]);
    }
  }

  const dailyAverages = [...valuesByDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({
      date,
      value: values.reduce((sum, value) => sum + value, 0) / values.length
    }));

  return buildDailySeries(dailyAverages);
}

function buildDailySeries(points: Array<{ date: string; value: number }>): FactorHistoryPoint[] {
  let previous: number | null = null;

  return points.map((point) => {
      const change = previous === null ? null : point.value - previous;
      previous = point.value;
      return {
        date: point.date,
        value: point.value,
        change
      };
    });
}

export function applyLiveTodayValue(
  points: FactorHistoryPoint[],
  todayKey: string,
  liveValue: number | null | undefined
): FactorHistoryPoint[] {
  if (liveValue === null || liveValue === undefined || !Number.isFinite(liveValue)) {
    return points;
  }

  if (points.length === 0) {
    return [{ date: todayKey, value: liveValue, change: null }];
  }

  const latest = points[points.length - 1]!;
  const previous = points[points.length - 2];

  if (latest.date === todayKey) {
    const previousValue = previous?.value ?? null;
    const change = previousValue === null ? null : liveValue - previousValue;
    return [...points.slice(0, -1), { date: todayKey, value: liveValue, change }];
  }

  const change = liveValue - latest.value;
  return [...points, { date: todayKey, value: liveValue, change }];
}

export function applyLiveGoldPriceHistory(
  history: GoldPriceHistory,
  todayKey: string,
  live: { buyPrice?: number; sellPrice: number; premiumSellPct: number; spreadPct: number }
): GoldPriceHistory {
  if (!Number.isFinite(live.sellPrice) || live.sellPrice <= 0) return history;

  const lastPoint = history.data[history.data.length - 1];
  const hasToday = lastPoint?.date === todayKey;
  const buyPrice =
    live.buyPrice !== undefined && Number.isFinite(live.buyPrice)
      ? live.buyPrice
      : live.sellPrice * (1 - live.spreadPct);
  const previousBuyClose = hasToday
    ? history.data[history.data.length - 2]?.buyClose
    : lastPoint?.buyClose;
  const previousClose = hasToday ? history.data[history.data.length - 2]?.close : lastPoint?.close;
  const buyChangeVnd =
    previousBuyClose === undefined ? null : buyPrice - previousBuyClose;
  const sellChangeVnd =
    previousClose === undefined ? null : live.sellPrice - previousClose;
  const changePercent =
    previousClose && previousClose > 0 ? (live.sellPrice - previousClose) / previousClose : null;
  const today: DailyGoldPrice = {
    date: todayKey,
    open: hasToday ? lastPoint.open : previousClose ?? live.sellPrice,
    high: hasToday
      ? Math.max(lastPoint.high, buyPrice, live.sellPrice)
      : Math.max(previousBuyClose ?? buyPrice, previousClose ?? live.sellPrice, buyPrice, live.sellPrice),
    low: hasToday
      ? Math.min(lastPoint.low, buyPrice, live.sellPrice)
      : Math.min(previousBuyClose ?? buyPrice, previousClose ?? live.sellPrice, buyPrice, live.sellPrice),
    buyClose: buyPrice,
    close: live.sellPrice,
    isToday: true,
    isTemporaryClose: true,
    buyChangeVnd,
    sellChangeVnd,
    changePercent,
    intradayRangePercent: null,
    spreadPercent: live.spreadPct,
    premiumPercent: live.premiumSellPct
  };

  return {
    ...history,
    data: hasToday ? [...history.data.slice(0, -1), today] : [...history.data, today]
  };
}
