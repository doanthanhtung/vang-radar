import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculatePremiumPct,
  calculateSpreadAbsVnd,
  calculateSpreadPct,
  calculateWorldVndPerLuong
} from "@vang-radar/domain";

type CsvRow = Record<string, string>;

type JoinedMetricInput = {
  date: string;
  domesticBuyPriceVnd: number;
  domesticSellPriceVnd: number;
  xauUsdPerOz: number;
  usdVnd: number;
  sourceFillMethods: {
    domestic: string;
    worldGold: string;
    usdVnd: string;
  };
};

const args = parseArgs(process.argv.slice(2));
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../..");

const from = args.from ?? "2026-01-01";
const to = args.to ?? "2026-06-29";
const productCode = args.product ?? "SJC_BAR";
const dataDir = args["data-dir"] ?? join(repoRoot, "data", "backfill");
const apply = args.apply === "true";

const sjcPath =
  args.sjc ??
  join(dataDir, `sjc-webgia-daily-one-price_${from}_${to}.csv`);
const worldGoldPath =
  args["world-gold"] ??
  join(dataDir, `world-gold-yahoo-gc-f-daily-one-price_${from}_${to}.csv`);
const usdVndPath =
  args["usd-vnd"] ??
  join(dataDir, `usd-vnd-yahoo-daily-one-price_${from}_${to}.csv`);

async function main() {
  await loadDotEnv(join(repoRoot, ".env"));
  const { prisma } = await import("@vang-radar/db");

  validateInputs();

  const [sjcRows, worldGoldRows, usdVndRows] = await Promise.all([
    readCsv(sjcPath),
    readCsv(worldGoldPath),
    readCsv(usdVndPath)
  ]);

  const joined = joinRows(sjcRows, worldGoldRows, usdVndRows);
  const product = await prisma.goldProduct.findUnique({ where: { code: productCode } });
  if (!product) throw new Error(`Gold product not found: ${productCode}`);

  const metrics = joined.map((row) => toMetric(row, product.id));
  const summary = {
    mode: apply ? "apply" : "dry-run",
    productCode,
    from,
    to,
    inputRows: {
      sjc: sjcRows.length,
      worldGold: worldGoldRows.length,
      usdVnd: usdVndRows.length
    },
    joinedRows: joined.length,
    carryRows: joined.filter(
      (row) =>
        row.sourceFillMethods.domestic !== "actual" ||
        row.sourceFillMethods.worldGold !== "actual" ||
        row.sourceFillMethods.usdVnd !== "actual"
    ).length,
    first: metrics[0] ? previewMetric(metrics[0]) : null,
    last: metrics.at(-1) ? previewMetric(metrics.at(-1)!) : null
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to write gold_metrics.");
    return;
  }

  let upserted = 0;
  for (const metric of metrics) {
    await prisma.goldMetric.upsert({
      where: {
        productId_time: {
          productId: metric.productId,
          time: metric.time
        }
      },
      update: {
        domesticBuyPriceVnd: metric.domesticBuyPriceVnd,
        domesticSellPriceVnd: metric.domesticSellPriceVnd,
        xauUsdPerOz: metric.xauUsdPerOz,
        usdVnd: metric.usdVnd,
        worldVndPerLuong: metric.worldVndPerLuong,
        premiumBuyPct: metric.premiumBuyPct,
        premiumSellPct: metric.premiumSellPct,
        spreadAbsVnd: metric.spreadAbsVnd,
        spreadPct: metric.spreadPct
      },
      create: metric
    });
    upserted += 1;
  }

  console.log(`Upserted ${upserted} historical gold_metrics rows.`);
}

function validateInputs() {
  validateIsoDate(from, "--from");
  validateIsoDate(to, "--to");
  for (const path of [sjcPath, worldGoldPath, usdVndPath]) {
    if (!existsSync(path)) throw new Error(`Input file not found: ${path}`);
  }
}

function joinRows(
  sjcRows: CsvRow[],
  worldGoldRows: CsvRow[],
  usdVndRows: CsvRow[]
): JoinedMetricInput[] {
  const sjcByDate = byDate(sjcRows);
  const worldGoldByDate = byDate(worldGoldRows);
  const usdVndByDate = byDate(usdVndRows);
  const dates = eachDate(from, to);

  return dates.map((date) => {
    const sjc = requiredRow(sjcByDate, date, "SJC");
    const worldGold = requiredRow(worldGoldByDate, date, "world gold");
    const usdVnd = requiredRow(usdVndByDate, date, "USD/VND");

    return {
      date,
      domesticBuyPriceVnd: requiredNumber(sjc.buy_price_vnd, `SJC buy ${date}`),
      domesticSellPriceVnd: requiredNumber(sjc.sell_price_vnd, `SJC sell ${date}`),
      xauUsdPerOz: requiredNumber(worldGold.price_usd_per_oz, `world gold ${date}`),
      usdVnd: requiredNumber(usdVnd.rate, `USD/VND ${date}`),
      sourceFillMethods: {
        domestic: sjc.fill_method ?? "unknown",
        worldGold: worldGold.fill_method ?? "unknown",
        usdVnd: usdVnd.fill_method ?? "unknown"
      }
    };
  });
}

function toMetric(row: JoinedMetricInput, productId: string) {
  const worldVndPerLuong = calculateWorldVndPerLuong(row.xauUsdPerOz, row.usdVnd);
  const premiumBuyPct = calculatePremiumPct(row.domesticBuyPriceVnd, worldVndPerLuong);
  const premiumSellPct = calculatePremiumPct(row.domesticSellPriceVnd, worldVndPerLuong);
  const spreadAbsVnd = calculateSpreadAbsVnd(
    row.domesticSellPriceVnd,
    row.domesticBuyPriceVnd
  );
  const spreadPct = calculateSpreadPct(row.domesticSellPriceVnd, row.domesticBuyPriceVnd);

  return {
    time: vietnamNoonUtc(row.date),
    productId,
    domesticBuyPriceVnd: row.domesticBuyPriceVnd,
    domesticSellPriceVnd: row.domesticSellPriceVnd,
    xauUsdPerOz: row.xauUsdPerOz,
    usdVnd: row.usdVnd,
    worldVndPerLuong,
    premiumBuyPct,
    premiumSellPct,
    spreadAbsVnd,
    spreadPct,
    premiumPercentile180d: null,
    spreadPercentile180d: null,
    xauMomentum7d: null,
    xauMomentum30d: null,
    xauMomentum7dDays: null,
    xauMomentum30dDays: null,
    domesticMomentum7d: null,
    domesticMomentum7dDays: null
  };
}

function previewMetric(metric: ReturnType<typeof toMetric>) {
  return {
    time: metric.time.toISOString(),
    domesticBuyPriceVnd: metric.domesticBuyPriceVnd,
    domesticSellPriceVnd: metric.domesticSellPriceVnd,
    xauUsdPerOz: metric.xauUsdPerOz,
    usdVnd: metric.usdVnd,
    worldVndPerLuong: Math.round(metric.worldVndPerLuong),
    premiumSellPct: metric.premiumSellPct,
    spreadPct: metric.spreadPct
  };
}

async function readCsv(path: string): Promise<CsvRow[]> {
  const text = await readFile(path, "utf8");
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  if (!headerLine) return [];

  const headers = parseCsvLine(headerLine);
  return lines.filter(Boolean).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function byDate(rows: CsvRow[]) {
  return new Map(rows.filter((row) => row.date).map((row) => [row.date!, row]));
}

function requiredRow(rows: Map<string, CsvRow>, date: string, label: string): CsvRow {
  const row = rows.get(date);
  if (!row) throw new Error(`Missing ${label} row for ${date}`);
  return row;
}

function requiredNumber(value: string | undefined, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid number for ${label}: ${value}`);
  return number;
}

function vietnamNoonUtc(date: string): Date {
  return new Date(`${date}T05:00:00.000Z`);
}

function parseArgs(rawArgs: string[]) {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg) continue;
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = rawArgs[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = "true";
    }
  }
  return parsed;
}

function validateIsoDate(value: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
    throw new Error(`${name} must be an ISO date like 2026-01-01`);
  }
}

function eachDate(start: string, end: string) {
  const output: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (cursor > last) throw new Error("--from must be before or equal to --to");

  while (cursor <= last) {
    output.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return output;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("@vang-radar/db");
    await prisma.$disconnect();
  });

async function loadDotEnv(path: string) {
  if (!existsSync(path)) return;
  const text = await readFile(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}
