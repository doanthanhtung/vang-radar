import type { DataProvider, ProviderResult, WorldGoldQuote } from "@vang-radar/domain";

type JsonRecord = Record<string, unknown>;

const TWENTY_FOUR_H_GOLD_URL = "https://www.24h.com.vn/gia-vang-hom-nay-c425.html";
const KITCO_GOLD_URL = "https://www.kitco.com/charts/gold";

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^\d.,-]/g, "");
  const normalized =
    cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const parsed = Number(normalized);
  if (
    Number.isFinite(parsed) &&
    parsed > 0 &&
    parsed < 100 &&
    /^\d{1,3}\.\d{3}$/.test(cleaned)
  ) {
    return Number(cleaned.replace(/\./g, ""));
  }
  return Number.isFinite(parsed) ? parsed : null;
}

function dateFrom(value: unknown): Date | null {
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

function getPath(payload: unknown, path: string[]): unknown {
  let current = payload;
  for (const part of path) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function quote(
  priceUsdPerOz: number | null,
  payload: unknown,
  sourceTime?: unknown
): WorldGoldQuote | null {
  if (!priceUsdPerOz || priceUsdPerOz <= 0) return null;
  const bid = numberFrom(getPath(payload, ["bid"]));
  const ask = numberFrom(getPath(payload, ["ask"]));
  const quotedAt = dateFrom(
    sourceTime ?? getPath(payload, ["timestamp"]) ?? getPath(payload, ["updatedAt"])
  );

  return {
    symbol: "XAUUSD",
    priceUsdPerOz,
    ...(bid ? { bid } : {}),
    ...(ask ? { ask } : {}),
    ...(quotedAt ? { quotedAt } : {})
  };
}

function htmlEntityDecode(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function quoteFromKitcoMarkup(markup: string): WorldGoldQuote | null {
  const scriptMatch = /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(
    markup
  );
  if (!scriptMatch?.[1]) return null;

  try {
    const nextData = JSON.parse(htmlEntityDecode(scriptMatch[1])) as JsonRecord;
    const queries = getPath(nextData, ["props", "pageProps", "dehydratedState", "queries"]);
    if (!Array.isArray(queries)) return null;

    for (const query of queries) {
      const result = getPath(query, ["state", "data", "GetMetalQuoteV3", "results"]);
      const firstQuote = Array.isArray(result) ? result.find(isRecord) : null;
      if (!firstQuote) continue;

      const mid = numberFrom(firstQuote.mid);
      const bid = numberFrom(firstQuote.bid);
      const ask = numberFrom(firstQuote.ask);
      const priceUsdPerOz = mid ?? (bid && ask ? (bid + ask) / 2 : ask ?? bid);
      if (!priceUsdPerOz) continue;

      return quote(priceUsdPerOz, firstQuote, firstQuote.timestamp ?? firstQuote.originalTime);
    }
  } catch {
    return null;
  }

  return null;
}

export class GoldApiIoProvider implements DataProvider<WorldGoldQuote | null> {
  readonly sourceCode = "GOLDAPI_IO";

  async fetch(): Promise<ProviderResult<WorldGoldQuote | null>> {
    if (!process.env.GOLDAPI_KEY) {
      return {
        sourceCode: this.sourceCode,
        fetchedAt: new Date(),
        data: null,
        rawPayload: null,
        health: "degraded",
        error: "GOLDAPI_KEY is not configured"
      };
    }

    const response = await fetch("https://www.goldapi.io/api/XAU/USD", {
      headers: {
        Accept: "application/json",
        "x-access-token": process.env.GOLDAPI_KEY
      }
    });
    const payload = (await response.json().catch(() => null)) as unknown;
    const data = response.ok ? quote(numberFrom(getPath(payload, ["price"])), payload) : null;

    return {
      sourceCode: this.sourceCode,
      fetchedAt: new Date(),
      data,
      rawPayload: payload,
      health: response.ok && data ? "healthy" : "degraded",
      ...(response.ok && data
        ? {}
        : { error: "GoldAPI.io response did not contain an XAU/USD price" })
    };
  }
}

export class MetalsDevProvider implements DataProvider<WorldGoldQuote | null> {
  readonly sourceCode = "METALS_DEV";

  async fetch(): Promise<ProviderResult<WorldGoldQuote | null>> {
    if (!process.env.METALS_DEV_API_KEY) {
      return {
        sourceCode: this.sourceCode,
        fetchedAt: new Date(),
        data: null,
        rawPayload: null,
        health: "degraded",
        error: "METALS_DEV_API_KEY is not configured"
      };
    }

    const url = new URL("https://api.metals.dev/v1/latest");
    url.searchParams.set("api_key", process.env.METALS_DEV_API_KEY);
    url.searchParams.set("currency", "USD");
    url.searchParams.set("unit", "toz");

    const response = await fetch(url, { headers: { Accept: "application/json" } });
    const payload = (await response.json().catch(() => null)) as unknown;
    const directPrice =
      numberFrom(getPath(payload, ["metals", "gold"])) ??
      numberFrom(getPath(payload, ["rates", "gold"])) ??
      numberFrom(getPath(payload, ["gold"])) ??
      numberFrom(getPath(payload, ["price"]));
    const inverseXauRate = numberFrom(getPath(payload, ["rates", "XAU"]));
    const priceUsdPerOz =
      directPrice ?? (inverseXauRate && inverseXauRate > 0 ? 1 / inverseXauRate : null);
    const data = response.ok
      ? quote(priceUsdPerOz, payload, getPath(payload, ["timestamp"]))
      : null;

    return {
      sourceCode: this.sourceCode,
      fetchedAt: new Date(),
      data,
      rawPayload: payload,
      health: response.ok && data ? "healthy" : "degraded",
      ...(response.ok && data
        ? {}
        : { error: "Metals.dev response did not contain an XAU/USD price" })
    };
  }
}

export class KitcoWorldGoldProvider implements DataProvider<WorldGoldQuote | null> {
  readonly sourceCode = "KITCO_WORLD_GOLD";

  async fetch(): Promise<ProviderResult<WorldGoldQuote | null>> {
    const response = await fetch(KITCO_GOLD_URL, {
      headers: { Accept: "text/html", "User-Agent": "vang-radar" }
    });
    const payload = await response.text();
    const data = response.ok ? quoteFromKitcoMarkup(payload) : null;

    return {
      sourceCode: this.sourceCode,
      fetchedAt: new Date(),
      data,
      rawPayload: data ? { url: KITCO_GOLD_URL, quote: data } : payload,
      health: response.ok && data ? "healthy" : "degraded",
      ...(response.ok && data
        ? {}
        : { error: `No XAU/USD price parsed from ${KITCO_GOLD_URL}` })
    };
  }
}

export class TwentyFourHWorldGoldProvider implements DataProvider<WorldGoldQuote | null> {
  readonly sourceCode = "TWENTY_FOUR_H_WORLD_GOLD";

  async fetch(): Promise<ProviderResult<WorldGoldQuote | null>> {
    const response = await fetch(TWENTY_FOUR_H_GOLD_URL, {
      headers: { Accept: "text/html" }
    });
    const payload = await response.text();
    const normalizedPayload = payload.replace(/&nbsp;/g, " ");
    const match = /m[uứ]c\s+([\d,.]+)\s+USD\/ounce/i.exec(normalizedPayload);
    const priceUsdPerOz = numberFrom(match?.[1]);
    const data = response.ok
      ? quote(priceUsdPerOz, { url: TWENTY_FOUR_H_GOLD_URL }, new Date().toISOString())
      : null;

    return {
      sourceCode: this.sourceCode,
      fetchedAt: new Date(),
      data,
      rawPayload: payload,
      health: response.ok && data ? "healthy" : "degraded",
      ...(response.ok && data
        ? {}
        : { error: `No XAU/USD price parsed from ${TWENTY_FOUR_H_GOLD_URL}` })
    };
  }
}
