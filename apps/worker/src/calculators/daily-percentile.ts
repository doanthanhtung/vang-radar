const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const HISTORY_DAYS = 180;

export type DailyPercentilePoint = {
  time: Date;
  value: number;
};

function vietnamDate(time: Date): string {
  return new Date(time.getTime() + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
}

export function countCompletedVietnamDays(
  points: Array<{ time: Date }>,
  currentTime: Date
): number {
  const currentDate = vietnamDate(currentTime);
  const dates = new Set<string>();

  for (const point of points) {
    if (Number.isNaN(point.time.getTime())) continue;
    const date = vietnamDate(point.time);
    if (date < currentDate) dates.add(date);
  }

  return Math.min(dates.size, HISTORY_DAYS);
}

export function calculateDailyPercentile(
  history: DailyPercentilePoint[],
  currentTime: Date,
  currentValue: number
): { percentile: number | null; sampleSize: number } {
  if (!Number.isFinite(currentValue)) return { percentile: null, sampleSize: 0 };

  const currentDate = vietnamDate(currentTime);
  const latestByDay = new Map<string, DailyPercentilePoint>();

  for (const point of history) {
    if (!Number.isFinite(point.value)) continue;
    const date = vietnamDate(point.time);
    if (date >= currentDate) continue;
    const existing = latestByDay.get(date);
    if (!existing || point.time > existing.time) latestByDay.set(date, point);
  }

  const values = [...latestByDay.values()]
    .sort((left, right) => left.time.getTime() - right.time.getTime())
    .slice(-HISTORY_DAYS)
    .map((point) => point.value);

  if (values.length === 0) return { percentile: null, sampleSize: 0 };

  return {
    percentile: (values.filter((value) => value <= currentValue).length / values.length) * 100,
    sampleSize: values.length
  };
}
