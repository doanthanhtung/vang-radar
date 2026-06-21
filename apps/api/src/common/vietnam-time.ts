const VIETNAM_TIMEZONE = "Asia/Ho_Chi_Minh";

export function getVietnamTodayRange(now = new Date()): { start: Date; end: Date; dateLabel: string } {
  const dateLabel = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  const start = new Date(`${dateLabel}T00:00:00+07:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return { start, end, dateLabel };
}