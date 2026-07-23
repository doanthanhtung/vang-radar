import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Product detail information hierarchy", () => {
  it("keeps current metrics without repeating the quick-take analysis", () => {
    const sourcePath = fileURLToPath(new URL("./[productCode]/page.tsx", import.meta.url));
    const source = readFileSync(sourcePath, "utf8");

    expect(source).not.toContain("Nhận định nhanh");
    expect(source).not.toContain("buildQuickTake");
    expect(source).toContain('title="Điểm tín hiệu"');
    expect(source.match(/<SignalBadge/g)).toHaveLength(1);
  });
});
