import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runHistoricalSignalCli } from "../src/signals/historical-cli.js";

describe("historical signal CLI", () => {
  test("writes a versioned batch result with production output and audit input", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vangscore-history-"));
    const inputPath = join(directory, "input.json");
    const outputPath = join(directory, "output.json");
    await writeFile(
      inputPath,
      JSON.stringify({
        rows: [
          {
            date: "2025-01-01",
            productCode: "SJC_BAR",
            domesticBuyPriceVnd: 82_000_000,
            domesticSellPriceVnd: 84_000_000,
            xauUsdPerOz: 2_000,
            usdVnd: 25_000
          }
        ]
      })
    );

    await runHistoricalSignalCli(["--input", inputPath, "--output", outputPath]);

    const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
      engineVersion: string;
      rows: Array<{
        output: { signal: string; score: number; confidence: number };
        input: { premiumSampleSize180d: number };
      }>;
    };
    expect(payload.engineVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0]?.output.signal).toBeTruthy();
    expect(payload.rows[0]?.output.score).toEqual(expect.any(Number));
    expect(payload.rows[0]?.output.confidence).toEqual(expect.any(Number));
    expect(payload.rows[0]?.input.premiumSampleSize180d).toBe(0);
  });

  test("rejects an input envelope without rows", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vangscore-history-"));
    const inputPath = join(directory, "input.json");
    await writeFile(inputPath, JSON.stringify({ data: [] }));

    await expect(runHistoricalSignalCli(["--input", inputPath])).rejects.toThrow(
      "Input JSON must contain a rows array"
    );
  });
});
