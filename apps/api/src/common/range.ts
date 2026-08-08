import type { HistoryRange } from "@vang-radar/domain";

export function rangeToDate(range: HistoryRange): Date {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "180d" ? 180 : 365;
  const vietnamOffsetMs = 7 * 60 * 60 * 1000;
  const vietnamNow = new Date(Date.now() + vietnamOffsetMs);
  const vietnamStartOfToday = Date.UTC(
    vietnamNow.getUTCFullYear(),
    vietnamNow.getUTCMonth(),
    vietnamNow.getUTCDate()
  );
  return new Date(vietnamStartOfToday - (days - 1) * 24 * 60 * 60 * 1000 - vietnamOffsetMs);
}
