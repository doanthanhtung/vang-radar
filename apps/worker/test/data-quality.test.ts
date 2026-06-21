import { describe, expect, it } from "vitest";
import { validateFxQuote } from "../src/validators/data-quality.js";

describe("data quality validators", () => {
  it("rejects USD/VND rates that are likely missing thousand scaling", () => {
    const result = validateFxQuote({ pair: "USDVND", rate: 26.4, quotedAt: new Date() }, null);

    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toContain("usd_vnd is unrealistically low");
  });
});
