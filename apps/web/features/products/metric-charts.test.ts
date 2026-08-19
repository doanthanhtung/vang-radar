import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatHistoryPosition, formatSpreadDifference } from "./metric-charts";

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

  it("describes each metric position according to its own percentile", () => {
    expect(formatHistoryPosition(20)).toBe("Thấp hơn 80% số ngày");
    expect(formatHistoryPosition(80)).toBe("Cao hơn 80% số ngày");
    expect(formatHistoryPosition(50)).toBe("Gần mức thường gặp");
  });

  it("describes spread difference as a concrete VND amount", () => {
    expect(formatSpreadDifference(12_000)).toContain("Cao hơn 12.000");
    expect(formatSpreadDifference(-8_000)).toContain("Thấp hơn 8.000");
    expect(formatSpreadDifference(0)).toBe("Gần mức thường gặp");
  });
});
