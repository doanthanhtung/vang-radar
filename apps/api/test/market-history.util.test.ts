import { describe, expect, it } from "vitest";
import { latestTickByVietnamDay, vietnamDateKey } from "../src/modules/market/market-history.util.js";

describe("vietnamDateKey", () => {
  it("maps UTC timestamps to Vietnam calendar days", () => {
    expect(vietnamDateKey(new Date("2026-06-21T23:30:00.687Z"))).toBe("2026-06-22");
    expect(vietnamDateKey(new Date("2026-06-21T16:45:00.641Z"))).toBe("2026-06-21");
  });
});

describe("latestTickByVietnamDay", () => {
  it("keeps the latest tick for each Vietnam day", () => {
    const rows = [
      { time: new Date("2026-06-21T02:00:00.000Z"), priceUsdPerOz: 4155.7 },
      { time: new Date("2026-06-21T10:00:00.000Z"), priceUsdPerOz: 4155.7 },
      { time: new Date("2026-06-21T15:00:00.000Z"), priceUsdPerOz: 4156.1 },
      { time: new Date("2026-06-22T00:45:00.697Z"), priceUsdPerOz: 4176.5 }
    ];

    expect(latestTickByVietnamDay(rows, (row) => row.priceUsdPerOz)).toEqual([
      { time: "2026-06-21T15:00:00.000Z", value: 4156.1 },
      { time: "2026-06-22T00:45:00.697Z", value: 4176.5 }
    ]);
  });
});