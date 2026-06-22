export const MIN_MOMENTUM_LOOKBACK_DAYS = 1;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function elapsedWholeDays(from: Date, to: Date): number {
  const elapsedMs = to.getTime() - from.getTime();
  if (elapsedMs < MIN_MOMENTUM_LOOKBACK_DAYS * MS_PER_DAY) return 0;
  return Math.floor(elapsedMs / MS_PER_DAY);
}

export function computeMomentum(
  current: number,
  previous: number | null
): number | null {
  if (!previous || previous <= 0 || !Number.isFinite(current)) return null;
  return current / previous - 1;
}

export function buildMomentum(
  current: number,
  reference: { value: number; time: Date } | null,
  now: Date
): { value: number; days: number } | null {
  if (!reference) return null;

  const days = elapsedWholeDays(reference.time, now);
  if (days < MIN_MOMENTUM_LOOKBACK_DAYS) return null;

  const value = computeMomentum(current, reference.value);
  if (value === null) return null;

  return { value, days };
}