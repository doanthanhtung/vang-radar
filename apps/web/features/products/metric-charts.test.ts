import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("MetricCharts detail analysis", () => {
  it("does not render the very-high threshold parameter", () => {
    const sourcePath = fileURLToPath(new URL("./metric-charts.tsx", import.meta.url));
    const source = readFileSync(sourcePath, "utf8");

    expect(source).not.toContain("Rất cao");
    expect(source).not.toContain("p95");
  });
});
