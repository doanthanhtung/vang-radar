const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

export function vietnamDateKey(time: Date): string {
  const local = new Date(time.getTime() + VIETNAM_OFFSET_MS);
  return local.toISOString().slice(0, 10);
}

export function latestTickByVietnamDay<T extends { time: Date }>(
  rows: T[],
  pickValue: (row: T) => number
): Array<{ time: string; value: number }> {
  const latest = new Map<string, { time: Date; value: number }>();

  for (const row of rows) {
    const day = vietnamDateKey(row.time);
    const current = latest.get(day);
    if (!current || row.time > current.time) {
      latest.set(day, { time: row.time, value: pickValue(row) });
    }
  }

  return [...latest.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, point]) => ({ time: point.time.toISOString(), value: point.value }));
}