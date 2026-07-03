import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type CsvRow = Record<string, string>;

const args = parseArgs(process.argv.slice(2));
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../..");

const from = args.from ?? "2026-01-01";
const to = args.to ?? "2026-06-30";
const productCode = args.product ?? "DOJI_RING_9999";
const sourceCode = args.source ?? "24HMONEY_DOJI";
const dataDir = args["data-dir"] ?? join(repoRoot, "data", "backfill");
const inputPath =
  args.input ?? join(dataDir, `doji-24hmoney-daily-one-price_${from}_${to}.csv`);
const apply = args.apply === "true";

async function main() {
  await loadDotEnv(join(repoRoot, ".env"));
  const { prisma } = await import("@vang-radar/db");

  validateInputs();

  const rows = await readCsv(inputPath);
  const selectedRows = rows.filter((row) => {
    const date = row.date;
    return Boolean(date) && date! >= from && date! <= to;
  });
  const product = await prisma.goldProduct.findUnique({ where: { code: productCode } });
  if (!product) throw new Error(`Gold product not found: ${productCode}`);

  const source = await prisma.source.upsert({
    where: { code: sourceCode },
    update: {},
    create: {
      code: sourceCode,
      name: "24HMoney DOJI historical gold graph",
      type: "external",
      baseUrl: "https://24hmoney.vn/gia-vang/doji"
    }
  });

  const candidatePrices = selectedRows.map((row) => toPrice(row, product.id, source.id));
  const existingSameSource = await prisma.domesticGoldPrice.findMany({
    where: {
      productId: product.id,
      sourceId: source.id,
      time: { in: candidatePrices.map((price) => price.time) }
    },
    select: { time: true }
  });
  const existingTimes = new Set(existingSameSource.map((price) => price.time.toISOString()));
  const pricesToInsert = candidatePrices.filter((price) => !existingTimes.has(price.time.toISOString()));

  const existingAnySource = await prisma.domesticGoldPrice.count({
    where: {
      productId: product.id,
      time: { in: candidatePrices.map((price) => price.time) },
      sourceId: { not: source.id }
    }
  });

  const summary = {
    mode: apply ? "apply" : "dry-run",
    productCode,
    sourceCode,
    from,
    to,
    inputPath,
    inputRows: rows.length,
    selectedRows: selectedRows.length,
    existingSameSourceRows: existingSameSource.length,
    existingOtherSourceRowsAtSameTimes: existingAnySource,
    rowsToInsert: pricesToInsert.length,
    first: pricesToInsert[0] ? previewPrice(pricesToInsert[0]) : null,
    last: pricesToInsert.at(-1) ? previewPrice(pricesToInsert.at(-1)!) : null
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to write domestic_gold_prices.");
    return;
  }

  let inserted = 0;
  for (const price of pricesToInsert) {
    await prisma.domesticGoldPrice.upsert({
      where: {
        productId_sourceId_time: {
          productId: price.productId,
          sourceId: price.sourceId,
          time: price.time
        }
      },
      update: {},
      create: price
    });
    inserted += 1;
  }

  console.log(`Inserted ${inserted} domestic_gold_prices rows.`);
}

function validateInputs() {
  validateIsoDate(from, "--from");
  validateIsoDate(to, "--to");
  if (!existsSync(inputPath)) throw new Error(`Input file not found: ${inputPath}`);
}

function toPrice(row: CsvRow, productId: string, sourceId: string) {
  const date = requiredString(row.date, "date");
  return {
    time: vietnamNoonUtc(date),
    productId,
    sourceId,
    buyPriceVnd: requiredNumber(row.buy_price_vnd, `buy ${date}`),
    sellPriceVnd: requiredNumber(row.sell_price_vnd, `sell ${date}`),
    unit: row.unit || "luong",
    rawPayload: {
      source: row.source,
      sourceUrl: row.source_url,
      sourceSymbol: row.source_symbol,
      priceDate: row.price_date,
      fillMethod: row.fill_method,
      isCarryForward: row.is_carry_forward
    },
    qualityScore: 90,
    isValid: true,
    invalidReason: null
  };
}

function previewPrice(price: ReturnType<typeof toPrice>) {
  return {
    time: price.time.toISOString(),
    buyPriceVnd: price.buyPriceVnd,
    sellPriceVnd: price.sellPriceVnd,
    unit: price.unit
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

function requiredString(value: string | undefined, label: string): string {
  if (!value) throw new Error(`Missing ${label}`);
  return value;
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
    if (!arg?.startsWith("--")) continue;
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

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("@vang-radar/db");
    await prisma.$disconnect();
  });
