import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatHistoryPosition } from "./metric-charts";

describe("MetricCharts detail analysis", () => {
  it("does not render the very-high threshold parameter", () => {
    const sourcePath = fileURLToPath(new URL("./metric-charts.tsx", import.meta.url));
    const source = readFileSync(sourcePath, "utf8");

    expect(source).not.toContain("Rất cao");
    expect(source).not.toContain("p95");
  });

  it("does not repeat current values in chart headers", () => {
    const sourcePath = fileURLToPath(new URL("./metric-charts.tsx", import.meta.url));
    const source = readFileSync(sourcePath, "utf8");

    expect(source).not.toMatch(
      /title="Giá bán ra"[\s\S]{0,120}primary=\{formatVnd\(latest\.sell\)\}/
    );
    expect(source).not.toMatch(/title="Spread mua bán"[\s\S]{0,160}primary=\{latest\.spreadAbs/);
    expect(source).not.toContain('{ label: "Hiện tại", value: formatPercent(latest.spread) }');
  });

  it("describes a buy gradually signal as lower than the complementary share of days", () => {
    expect(formatHistoryPosition(20, "BUY_DCA")).toBe("Thấp hơn 80% số ngày");
    expect(formatHistoryPosition(20, "HOLD")).toBe("Cao hơn 20% số ngày");
  });
});
