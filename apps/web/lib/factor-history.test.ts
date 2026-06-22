import { describe, expect, it } from "vitest";
import type { GoldPriceHistory } from "./api-client";
import {
  applyLiveTodayValue,
  buildAverageDailyGoldHistory,
  buildFxDailyHistory,
  buildWorldGoldDailyHistory
} from "./factor-history";

describe("buildWorldGoldDailyHistory", () => {
  it("deduplicates by Vietnam day and computes day-over-day change", () => {
    const history = buildWorldGoldDailyHistory([
      { time: "2026-06-19T02:00:00.000Z", price: 2300 },
      { time: "2026-06-19T10:00:00.000Z", price: 2310 },
      { time: "2026-06-20T02:00:00.000Z", price: 2320 }
    ]);

    expect(history).toHaveLength(2);
    expect(history[0]?.date).toBe("2026-06-20");
    expect(history[0]?.value).toBe(2320);
    expect(history[0]?.change).toBeCloseTo(10);
    expect(history[1]?.date).toBe("2026-06-19");
    expect(history[1]?.value).toBe(2310);
    expect(history[1]?.change).toBeNull();
  });
});

describe("buildFxDailyHistory", () => {
  it("deduplicates by Vietnam day and computes day-over-day change", () => {
    const history = buildFxDailyHistory([
      { time: "2026-06-19T02:00:00.000Z", rate: 26_000 },
      { time: "2026-06-19T10:00:00.000Z", rate: 26_050 },
      { time: "2026-06-20T02:00:00.000Z", rate: 26_120 }
    ]);

    expect(history).toHaveLength(2);
    expect(history[0]?.date).toBe("2026-06-20");
    expect(history[0]?.value).toBe(26_120);
    expect(history[0]?.change).toBe(70);
    expect(history[1]?.date).toBe("2026-06-19");
    expect(history[1]?.value).toBe(26_050);
    expect(history[1]?.change).toBeNull();
  });
});

describe("applyLiveTodayValue", () => {
  it("updates today's row with the latest live value", () => {
    const history = applyLiveTodayValue(
      [
        { date: "2026-06-22", value: 2300, change: 10 },
        { date: "2026-06-21", value: 2290, change: null }
      ],
      "2026-06-22",
      2315
    );

    expect(history[0]?.value).toBe(2315);
    expect(history[0]?.change).toBe(25);
    expect(history[1]?.value).toBe(2290);
  });

  it("prepends today when history only has previous days", () => {
    const history = applyLiveTodayValue(
      [{ date: "2026-06-21", value: 2290, change: null }],
      "2026-06-22",
      2315
    );

    expect(history).toHaveLength(2);
    expect(history[0]?.date).toBe("2026-06-22");
    expect(history[0]?.value).toBe(2315);
    expect(history[0]?.change).toBe(25);
  });

  it("returns the original history when live value is missing", () => {
    const points = [{ date: "2026-06-22", value: 2300, change: null }];
    expect(applyLiveTodayValue(points, "2026-06-22", null)).toBe(points);
  });
});

describe("buildAverageDailyGoldHistory", () => {
  it("averages daily close premium across products", () => {
    const histories: GoldPriceHistory[] = [
      {
        type: "SJC_BAR",
        days: 7,
        data: [
          {
            date: "2026-06-19",
            open: 1,
            high: 1,
            low: 1,
            close: 1,
            isToday: false,
            isTemporaryClose: false,
            changePercent: null,
            intradayRangePercent: null,
            spreadPercent: 0.02,
            premiumPercent: 0.1
          },
          {
            date: "2026-06-20",
            open: 1,
            high: 1,
            low: 1,
            close: 1,
            isToday: false,
            isTemporaryClose: false,
            changePercent: 0,
            intradayRangePercent: null,
            spreadPercent: 0.03,
            premiumPercent: 0.12
          }
        ]
      },
      {
        type: "PNJ_RING_9999",
        days: 7,
        data: [
          {
            date: "2026-06-19",
            open: 1,
            high: 1,
            low: 1,
            close: 1,
            isToday: false,
            isTemporaryClose: false,
            changePercent: null,
            intradayRangePercent: null,
            spreadPercent: 0.025,
            premiumPercent: 0.08
          },
          {
            date: "2026-06-20",
            open: 1,
            high: 1,
            low: 1,
            close: 1,
            isToday: false,
            isTemporaryClose: false,
            changePercent: 0,
            intradayRangePercent: null,
            spreadPercent: 0.035,
            premiumPercent: 0.16
          }
        ]
      }
    ];

    const history = buildAverageDailyGoldHistory(histories, "premiumPercent");

    expect(history[0]?.date).toBe("2026-06-20");
    expect(history[0]?.value).toBeCloseTo(0.14);
    expect(history[0]?.change).toBeCloseTo(0.05);
    expect(history[1]?.date).toBe("2026-06-19");
    expect(history[1]?.value).toBeCloseTo(0.09);
    expect(history[1]?.change).toBeNull();
  });
});