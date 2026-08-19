import { afterEach, describe, expect, it, vi } from "vitest";
import { rangeToDate } from "../src/common/range.js";

describe("rangeToDate", () => {
  afterEach(() => vi.useRealTimers());

  it("starts a 7-day range at the UTC+7 midnight of the first calendar day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T10:30:00.000Z"));

    expect(rangeToDate("7d").toISOString()).toBe("2026-08-01T17:00:00.000Z");
  });
});
