import { describe, expect, it } from "vitest";
import { calculateDailyPercentile } from "../src/calculators/daily-percentile.js";

describe("calculateDailyPercentile", () => {
  it("uses the latest observation from each of the 180 completed Vietnam days", () => {
    const currentTime = new Date("2026-08-10T01:00:00.000Z");
    const history = Array.from({ length: 180 }, (_, index) => ({
      time: new Date(Date.UTC(2026, 1, 11 + index, 10, 0, 0)),
      value: index === 179 ? 0.058 : 0.1
    }));

    history.push({
      time: new Date("2026-08-09T09:30:00.000Z"),
      value: 0.2
    });

    expect(calculateDailyPercentile(history, currentTime, 0.066)).toEqual({
      percentile: 100 / 180,
      sampleSize: 180
    });
  });

  it("ignores days older than the most recent 180 completed days", () => {
    const currentTime = new Date("2026-08-10T01:00:00.000Z");
    const history = Array.from({ length: 181 }, (_, index) => ({
      time: new Date(Date.UTC(2026, 1, 10 + index, 10, 0, 0)),
      value: index === 0 ? 0.01 : 0.1
    }));

    expect(calculateDailyPercentile(history, currentTime, 0.066)).toEqual({
      percentile: 0,
      sampleSize: 180
    });
  });
});
