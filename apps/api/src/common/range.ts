import type { HistoryRange } from "@vang-radar/domain";

export function rangeToDate(range: HistoryRange): Date {
  const now = Date.now();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "180d" ? 180 : 365;
  return new Date(now - days * 24 * 60 * 60 * 1000);
}
