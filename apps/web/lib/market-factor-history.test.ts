import { describe, expect, it, vi } from "vitest";
import type { FactorHistoryPoint } from "./factor-history";
import { loadMarketFactorHistories } from "./market-factor-history";

const points: FactorHistoryPoint[] = [
  { date: "2026-08-07", value: 100, change: null },
  { date: "2026-08-08", value: 101, change: 1 }
];

describe("loadMarketFactorHistories", () => {
  it("loads XAU/USD, USD/VND and DXY in parallel", async () => {
    const xau = vi.fn().mockResolvedValue(points);
    const usd = vi.fn().mockResolvedValue(points);
    const dxy = vi.fn().mockResolvedValue(points);

    await expect(loadMarketFactorHistories({ xau, usd, dxy })).resolves.toEqual({
      xau: points,
      usd: points,
      dxy: points
    });

    expect(xau).toHaveBeenCalledOnce();
    expect(usd).toHaveBeenCalledOnce();
    expect(dxy).toHaveBeenCalledOnce();
  });

  it("keeps successful histories when one source fails", async () => {
    const xau = vi.fn().mockResolvedValue(points);
    const usd = vi.fn().mockRejectedValue(new Error("USD/VND unavailable"));
    const dxy = vi.fn().mockResolvedValue(points);

    await expect(loadMarketFactorHistories({ xau, usd, dxy })).resolves.toEqual({
      xau: points,
      dxy: points
    });
  });
});
