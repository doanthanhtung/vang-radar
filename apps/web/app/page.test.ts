import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Home market summary freshness", () => {
  it("does not wrap the live summary in a 60-second server cache", () => {
    const sourcePath = fileURLToPath(new URL("./page.tsx", import.meta.url));
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("getMarketSummary()");
    expect(source).not.toContain("unstable_cache");
    expect(source).not.toContain("getCachedMarketSummary");
  });
});
