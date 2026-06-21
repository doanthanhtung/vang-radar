import {
  GOLD_PRODUCTS,
  type DataProvider,
  type DomesticGoldQuote,
  type ProductCode,
  type ProviderResult
} from "@vang-radar/domain";

type JsonRecord = Record<string, unknown>;

const productMatchers: Array<{ code: ProductCode; patterns: string[] }> = [
  { code: "SJC_BAR", patterns: ["sjc", "vang mieng"] },
  { code: "DOJI_RING_9999", patterns: ["doji"] },
  { code: "PNJ_RING_9999", patterns: ["pnj"] },
  { code: "BTMC_RING_9999", patterns: ["btmc", "btmh", "bao tin minh chau", "bao tin"] }
];

const TWENTY_FOUR_MONEY_GOLD_URL = "https://24hmoney.vn/gia-vang";
const TWENTY_FOUR_H_GOLD_URL = "https://www.24h.com.vn/gia-vang-hom-nay-c425.html";
const BAOMOI_BTMC_GOLD_URL = "https://baomoi.com/tien-ich-gia-vang-btmc.epi";

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return normalizeVnd(value);
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/[^\d.,-]/g, "");
  const separatorCount = (cleaned.match(/[,.]/g) ?? []).length;
  const normalized =
    separatorCount > 1 || /^\d{1,3}([,.]\d{3})+$/.test(cleaned)
      ? cleaned.replace(/[,.]/g, "")
      : cleaned.replace(/\./g, "").replace(",", ".");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? normalizeVnd(numeric) : null;
}

function normalizeVnd(value: number): number {
  if (value > 0 && value < 1_000) return Math.round(value * 1_000_000);
  if (value > 0 && value < 1_000_000) return Math.round(value * 1_000);
  return Math.round(value);
}

function stringFrom(row: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function parseDate(value: unknown): Date | null {
  if (typeof value === "number") {
    const date = new Date(value < 10_000_000_000 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function rowsFrom(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];

  for (const key of ["data", "results", "prices", "items"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }

  const nested = Object.values(payload).find((value) => Array.isArray(value));
  return Array.isArray(nested) ? nested.filter(isRecord) : [];
}

function rowsFromMarkup(markup: string): JsonRecord[] {
  const rows: JsonRecord[] = [];
  for (const match of markup.matchAll(/<item\b[^>]*>/gi)) {
    const row: JsonRecord = {};
    for (const attr of match[0].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) {
      row[attr[1] ?? ""] = attr[2] ?? "";
    }
    if (Object.keys(row).length > 0) rows.push(row);
  }
  return rows;
}

function stripTags(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function quoteFromText(
  text: string,
  productCode: ProductCode,
  brand: string,
  name: string,
  pattern: RegExp,
  quotedAt: Date,
  sourceCode?: string
): DomesticGoldQuote | null {
  const match = pattern.exec(text);
  const buyPriceVnd = numberFrom(match?.[1]);
  const sellPriceVnd = numberFrom(match?.[2]);
  if (!buyPriceVnd || !sellPriceVnd) return null;

  return {
    productCode,
    brand,
    name,
    buyPriceVnd,
    sellPriceVnd,
    unit: "luong",
    quotedAt,
    ...(sourceCode ? { sourceCode } : {})
  };
}

function quotesFromTwentyFourMoney(markup: string): DomesticGoldQuote[] {
  const quotedAt = new Date();
  const specs: Array<{
    productCode: ProductCode;
    brand: string;
    name: string;
    pattern: RegExp;
  }> = [
    {
      productCode: "SJC_BAR",
      brand: "SJC",
      name: "Vang mieng SJC",
      pattern: /brand-name[^>]*>[^<]*Mi[^<]*SJC[^<]*<\/div>[\s\S]*?price-today[^>]*>\s*([\d,.]+)\s*<\/div>[\s\S]*?price-today[^>]*>\s*([\d,.]+)\s*<\/div>/i
    },
    {
      productCode: "DOJI_RING_9999",
      brand: "DOJI",
      name: "Nhan 9999",
      pattern: /brand-name[^>]*>[^<]*Nh[^<]*DOJI[^<]*<\/div>[\s\S]*?price-today[^>]*>\s*([\d,.]+)\s*<\/div>[\s\S]*?price-today[^>]*>\s*([\d,.]+)\s*<\/div>/i
    },
    {
      productCode: "PNJ_RING_9999",
      brand: "PNJ",
      name: "Nhan 9999",
      pattern: /brand-name[^>]*>[^<]*Nh[^<]*PNJ[^<]*<\/div>[\s\S]*?price-today[^>]*>\s*([\d,.]+)\s*<\/div>[\s\S]*?price-today[^>]*>\s*([\d,.]+)\s*<\/div>/i
    },
    {
      productCode: "BTMC_RING_9999",
      brand: "BTMC",
      name: "Nhan 9999",
      pattern: /gold-bao-tin-manh-hai[\s\S]{0,800}?price-today[^>]*>\s*([\d,.]+)\s*<\/div>[\s\S]*?price-today[^>]*>\s*([\d,.]+)\s*<\/div>/i
    }
  ];

  return specs
    .map((spec) =>
      quoteFromText(markup, spec.productCode, spec.brand, spec.name, spec.pattern, quotedAt)
    )
    .filter((quote): quote is DomesticGoldQuote => quote !== null);
}

function quotesFromBaoMoiBtmc(markup: string): DomesticGoldQuote[] {
  const text = stripTags(markup);
  const quote = quoteFromText(
    text,
    "BTMC_RING_9999",
    "BTMC",
    "Nhan tron tron Bao Tin Minh Chau 9999",
    /NH[AẪ]N\s+TR[OÒ]N\s+TR[OƠ]N\s+B[AẢ]O\s+T[IÍ]N\s+MINH\s+CH[AÂ]U\s+([\d,.]+)\s+([\d,.]+)/i,
    new Date(),
    "BAOMOI_BTMC_GOLD"
  );
  return quote ? [quote] : [];
}

function quotesFromTwentyFourH(markup: string): DomesticGoldQuote[] {
  const text = stripTags(markup);
  const quotedAt = new Date();
  const quotes: DomesticGoldQuote[] = [];
  const productRows: Array<{
    productCode: ProductCode;
    brand: string;
    name: string;
    label: string;
  }> = [
    { productCode: "SJC_BAR", brand: "SJC", name: "Vang mieng SJC", label: "SJC" },
    { productCode: "BTMC_RING_9999", brand: "BTMC", name: "Nhan 9999", label: "BTMH" },
    { productCode: "DOJI_RING_9999", brand: "DOJI", name: "Nhan 9999", label: "DOJI" },
    { productCode: "PNJ_RING_9999", brand: "PNJ", name: "Nhan 9999", label: "PNJ" }
  ];

  for (const product of productRows) {
    const quote = quoteFromText(
      text,
      product.productCode,
      product.brand,
      product.name,
      new RegExp(`${product.label}[\\s\\w]*?\\s+Mua\\s+([\\d,.]+)\\s+B[aá]n\\s+([\\d,.]+)`, "i"),
      quotedAt
    );
    if (quote) quotes.push(quote);

    if (product.productCode === "BTMC_RING_9999") {
      // keep only for BTMC itself; DOJI/PNJ will be populated more accurately from table below if possible
    }
  }

  // Additional pass: parse the detailed table in stripped text for per-brand accuracy
  // Table often looks like "DOJI HN 148.000 150.500" or "PNJ TP.HCM 147.500 150.500"
  const tableRegex = /(SJC|DOJI|PNJ|BTMH|BTMC)[^\d]*?([\d,.]+)[^\d]+([\d,.]+)/gi;
  let tmatch: RegExpExecArray | null;
  while ((tmatch = tableRegex.exec(text)) !== null) {
    const brandTok = tmatch[1]?.toUpperCase();
    const buy = numberFrom(tmatch[2]);
    const sell = numberFrom(tmatch[3]);
    if (!brandTok || !buy || !sell) continue;

    let pc: ProductCode | null = null;
    if (brandTok === "SJC") pc = "SJC_BAR";
    else if (brandTok === "BTMH" || brandTok === "BTMC") pc = "BTMC_RING_9999";
    else if (brandTok === "DOJI") pc = "DOJI_RING_9999";
    else if (brandTok === "PNJ") pc = "PNJ_RING_9999";

    if (pc && !quotes.some((q) => q.productCode === pc)) {
      const brandName = brandTok === "SJC" ? "SJC" : brandTok;
      const nm = pc.includes("SJC") ? "Vang mieng SJC" : "Nhan 9999";
      quotes.push({
        productCode: pc,
        brand: brandName,
        name: nm,
        buyPriceVnd: buy,
        sellPriceVnd: sell,
        unit: "luong",
        quotedAt
      });
    }
  }

  return quotes;
}

function productCodeFrom(row: JsonRecord): ProductCode | null {
  const explicitCode = stringFrom(row, [
    "productCode",
    "product_code",
    "code",
    "symbol"
  ]).toUpperCase();
  if (GOLD_PRODUCTS.some((product) => product.code === explicitCode))
    return explicitCode as ProductCode;

  const text = [
    stringFrom(row, ["brand", "company", "name", "type"]),
    stringFrom(row, ["product", "gold_type", "goldType"])
  ]
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return (
    productMatchers.find((matcher) => matcher.patterns.some((pattern) => text.includes(pattern)))
      ?.code ?? null
  );
}

function quoteFrom(row: JsonRecord): DomesticGoldQuote | null {
  const productCode = productCodeFrom(row);
  const buyPriceVnd = numberFrom(
    row.buyPriceVnd ?? row.buy_price_vnd ?? row.buy ?? row.buyPrice ?? row.buy_price
  );
  const sellPriceVnd = numberFrom(
    row.sellPriceVnd ?? row.sell_price_vnd ?? row.sell ?? row.sellPrice ?? row.sell_price
  );
  if (!productCode || !buyPriceVnd || !sellPriceVnd) return null;

  const product = GOLD_PRODUCTS.find((item) => item.code === productCode);
  const quotedAt = parseDate(
    row.quotedAt ?? row.quoted_at ?? row.time ?? row.updatedAt ?? row.updated_at
  );

  return {
    productCode,
    brand: stringFrom(row, ["brand", "company"]) || product?.brand || productCode,
    name:
      stringFrom(row, ["name", "product", "gold_type", "goldType"]) || product?.name || productCode,
    buyPriceVnd,
    sellPriceVnd,
    unit: "luong",
    ...(quotedAt ? { quotedAt } : {})
  };
}

export class VietnamGoldApiProvider implements DataProvider<DomesticGoldQuote[]> {
  readonly sourceCode = "TWENTY_FOUR_MONEY_GOLD";

  async fetch(): Promise<ProviderResult<DomesticGoldQuote[]>> {
    const url = process.env.VIETNAM_GOLD_API_URL || TWENTY_FOUR_MONEY_GOLD_URL;

    const headers: Record<string, string> = {
      Accept: "text/html, application/json, application/xml, text/xml",
      "User-Agent": "vang-radar"
    };
    if (process.env.VIETNAM_GOLD_API_KEY) {
      headers.Authorization = `Bearer ${process.env.VIETNAM_GOLD_API_KEY}`;
      headers["x-api-key"] = process.env.VIETNAM_GOLD_API_KEY;
    }

    let response = await fetch(url, { headers });
    let body = await response.text();
    let payload = tryJson(body) ?? body;
    let rows = typeof payload === "string" ? rowsFromMarkup(payload) : rowsFrom(payload);
    const genericQuotes = rows
      .map(quoteFrom)
      .filter((quote): quote is DomesticGoldQuote => quote !== null);
    let scrapedQuotes =
      typeof payload === "string"
        ? url.includes("24hmoney.vn")
          ? quotesFromTwentyFourMoney(payload)
          : quotesFromTwentyFourH(payload)
        : [];
    let data = response.ok ? [...scrapedQuotes, ...genericQuotes] : [];

    if (!process.env.VIETNAM_GOLD_API_URL) {
      const btmcResponse = await fetch(BAOMOI_BTMC_GOLD_URL, { headers });
      const btmcBody = await btmcResponse.text();
      const btmcQuotes = btmcResponse.ok ? quotesFromBaoMoiBtmc(btmcBody) : [];
      if (btmcQuotes.length > 0) {
        const merged = new Map(data.map((quote) => [quote.productCode, quote]));
        for (const quote of btmcQuotes) merged.set(quote.productCode, quote);
        data = [...merged.values()];
      }
    }

    if (!process.env.VIETNAM_GOLD_API_URL && data.length < GOLD_PRODUCTS.length) {
      response = await fetch(TWENTY_FOUR_H_GOLD_URL, { headers });
      body = await response.text();
      payload = tryJson(body) ?? body;
      rows = typeof payload === "string" ? rowsFromMarkup(payload) : rowsFrom(payload);
      scrapedQuotes = typeof payload === "string" ? quotesFromTwentyFourH(payload) : [];
      const fallbackQuotes = rows
        .map(quoteFrom)
        .filter((quote): quote is DomesticGoldQuote => quote !== null);
      const merged = new Map(data.map((quote) => [quote.productCode, quote]));
      for (const quote of [...scrapedQuotes, ...fallbackQuotes]) {
        if (!merged.has(quote.productCode)) merged.set(quote.productCode, quote);
      }
      data = [...merged.values()];
    }

    return {
      sourceCode: this.sourceCode,
      fetchedAt: new Date(),
      data,
      rawPayload: payload,
      health: response.ok && data.length > 0 ? "healthy" : "degraded",
      ...(response.ok && data.length > 0
        ? {}
        : { error: `No domestic gold quotes parsed from ${url}` })
    };
  }
}

function tryJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
