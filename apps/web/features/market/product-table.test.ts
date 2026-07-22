import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("ProductTable navigation", () => {
  it("links products directly to their analysis page without a history dialog", () => {
    const sourcePath = fileURLToPath(new URL("./product-table.tsx", import.meta.url));
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("href={`/gold/${product.code}`}");
    expect(source).not.toContain("ProductDetailDialog");
    expect(source).not.toContain("getGoldPriceHistory");
    expect(source).not.toContain('aria-haspopup="dialog"');
  });
});
