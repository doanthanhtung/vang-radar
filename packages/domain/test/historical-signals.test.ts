import { describe, expect, test } from "vitest";
import {
  generateDecisionSignal,
  recomputeHistoricalSignals,
  type HistoricalSignalRow
} from "../src/index.js";

function row(
  date: string,
  overrides: Partial<HistoricalSignalRow> = {}
): HistoricalSignalRow {
  return {
    date,
    productCode: "SJC_BAR",
    domesticBuyPriceVnd: 82_000_000,
    domesticSellPriceVnd: 84_000_000,
    xauUsdPerOz: 2_000,
    usdVnd: 25_000,
    ...overrides
  };
}

describe("recomputeHistoricalSignals", () => {
  test("sorts rows and excludes the current observation from percentile history", () => {
    const results = recomputeHistoricalSignals([
      row("2025-01-03", { domesticSellPriceVnd: 86_000_000 }),
      row("2025-01-01"),
      row("2025-01-02", { domesticSellPriceVnd: 85_000_000 })
    ]);

    expect(results.map((item) => item.date)).toEqual([
      "2025-01-01T00:00:00.000Z",
      "2025-01-02T00:00:00.000Z",
      "2025-01-03T00:00:00.000Z"
    ]);
    expect(results[0]?.input.premiumSampleSize180d).toBe(0);
    expect(results[0]?.input.premiumPercentile180d).toBeNull();
    expect(results[1]?.input.premiumSampleSize180d).toBe(1);
    expect(results[1]?.input.premiumPercentile180d).toBe(100);
    expect(results[2]?.input.premiumSampleSize180d).toBe(2);
    expect(results[2]?.input.premiumPercentile180d).toBe(100);
  });

  test("drops observations older than 180 calendar days from percentile history", () => {
    const results = recomputeHistoricalSignals([
      row("2025-01-01"),
      row("2025-07-01", { domesticSellPriceVnd: 85_000_000 })
    ]);

    expect(results[1]?.input.premiumSampleSize180d).toBe(0);
    expect(results[1]?.input.spreadSampleSize180d).toBe(0);
  });

  test("uses production-compatible past references for momentum", () => {
    const results = recomputeHistoricalSignals([
      row("2025-01-01", {
        domesticSellPriceVnd: 80_000_000,
        xauUsdPerOz: 2_000
      }),
      row("2025-01-05", {
        domesticSellPriceVnd: 84_000_000,
        xauUsdPerOz: 2_100
      }),
      row("2025-01-10", {
        domesticSellPriceVnd: 88_000_000,
        xauUsdPerOz: 2_200
      })
    ]);

    expect(results[2]?.input.xauMomentum7d).toBeCloseTo(0.1);
    expect(results[2]?.input.xauMomentum7dDays).toBe(9);
    expect(results[2]?.input.xauMomentum30d).toBeCloseTo(0.1);
    expect(results[2]?.input.xauMomentum30dDays).toBe(9);
    expect(results[2]?.input.domesticMomentum7d).toBeCloseTo(0.1);
    expect(results[2]?.input.domesticMomentum7dDays).toBe(9);
  });

  test("does not change earlier inputs or outputs when future rows are appended", () => {
    const past = [
      row("2025-01-01"),
      row("2025-01-05", { xauUsdPerOz: 2_050 }),
      row("2025-01-10", { xauUsdPerOz: 2_100 })
    ];
    const baseline = recomputeHistoricalSignals(past);
    const withFuture = recomputeHistoricalSignals([
      ...past,
      row("2025-12-31", {
        domesticBuyPriceVnd: 120_000_000,
        domesticSellPriceVnd: 125_000_000,
        xauUsdPerOz: 3_000
      })
    ]);

    expect(withFuture.slice(0, baseline.length)).toEqual(baseline);
  });

  test("isolates percentile and momentum history by product", () => {
    const results = recomputeHistoricalSignals([
      row("2025-01-01", {
        productCode: "SJC_BAR",
        domesticSellPriceVnd: 80_000_000,
        xauUsdPerOz: 2_000
      }),
      row("2025-01-02", {
        productCode: "DOJI_RING_9999",
        domesticSellPriceVnd: 120_000_000,
        xauUsdPerOz: 3_000
      }),
      row("2025-01-10", {
        productCode: "SJC_BAR",
        domesticSellPriceVnd: 88_000_000,
        xauUsdPerOz: 2_200
      })
    ]);

    expect(results[2]?.input.premiumSampleSize180d).toBe(1);
    expect(results[2]?.input.spreadSampleSize180d).toBe(1);
    expect(results[2]?.input.xauMomentum7d).toBeCloseTo(0.1);
    expect(results[2]?.input.xauMomentum7dDays).toBe(9);
    expect(results[2]?.input.domesticMomentum7d).toBeCloseTo(0.1);
    expect(results[2]?.input.domesticMomentum7dDays).toBe(9);
  });

  test("returns exactly the production engine output for every reconstructed input", () => {
    const [result] = recomputeHistoricalSignals([row("2025-01-01")]);

    expect(result?.output).toEqual(generateDecisionSignal(result!.input));
  });
});
