import type { MetricPoint } from "../../lib/api-client";

const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

const vietnamDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: VIETNAM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function groupMetricHistoryByVietnameseDay(history: MetricPoint[]): MetricPoint[] {
  const latestByDay = new Map<string, { point: MetricPoint; timestamp: number }>();

  for (const point of history) {
    const timestamp = Date.parse(point.time);
    if (!Number.isFinite(timestamp)) continue;

    const day = vietnamDateFormatter.format(new Date(timestamp));
    const current = latestByDay.get(day);
    if (!current || timestamp >= current.timestamp) {
      latestByDay.set(day, { point, timestamp });
    }
  }

  return [...latestByDay.values()]
    .sort((left, right) => left.timestamp - right.timestamp)
    .map(({ point }) => point);
}
