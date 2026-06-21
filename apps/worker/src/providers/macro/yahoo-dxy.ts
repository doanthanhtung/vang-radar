import type { DataProvider, MacroIndicatorQuote, ProviderResult } from "@vang-radar/domain";

const YAHOO_DXY_CHART_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?range=5d&interval=1d";
const YAHOO_TIMEOUT_MS = 15_000;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberFrom(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function latestClose(payload: unknown): { value: number; quotedAt?: Date } | null {
  if (!isRecord(payload)) return null;
  const chart = payload.chart;
  if (!isRecord(chart) || !Array.isArray(chart.result)) return null;
  const result = chart.result.find(isRecord);
  if (!result) return null;

  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const indicators = isRecord(result.indicators) ? result.indicators : null;
  const quotes = indicators && Array.isArray(indicators.quote) ? indicators.quote : [];
  const quote = quotes.find(isRecord);
  const closes = quote && Array.isArray(quote.close) ? quote.close : [];

  for (let index = closes.length - 1; index >= 0; index -= 1) {
    const value = numberFrom(closes[index]);
    const timestamp = numberFrom(timestamps[index]);
    if (!value) continue;

    return {
      value,
      ...(timestamp ? { quotedAt: new Date(timestamp * 1000) } : {})
    };
  }

  const meta = isRecord(result.meta) ? result.meta : null;
  const value = numberFrom(meta?.regularMarketPrice);
  const timestamp = numberFrom(meta?.regularMarketTime);
  return value
    ? {
        value,
        ...(timestamp ? { quotedAt: new Date(timestamp * 1000) } : {})
      }
    : null;
}

export class YahooDxyProvider implements DataProvider<MacroIndicatorQuote[]> {
  readonly sourceCode = "YAHOO_FINANCE";

  async fetch(): Promise<ProviderResult<MacroIndicatorQuote[]>> {
    const fetchedAt = new Date();

    try {
      const response = await fetch(YAHOO_DXY_CHART_URL, {
        headers: { Accept: "application/json", "User-Agent": "vang-radar" },
        signal: AbortSignal.timeout(YAHOO_TIMEOUT_MS)
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      const close = response.ok ? latestClose(payload) : null;

      return {
        sourceCode: this.sourceCode,
        fetchedAt,
        data: close
          ? [
              {
                code: "DXY",
                value: close.value,
                unit: "index",
                sourceSeriesId: "DX-Y.NYB",
                ...(close.quotedAt ? { quotedAt: close.quotedAt } : {})
              }
            ]
          : [],
        rawPayload: payload,
        health: response.ok && close ? "healthy" : "degraded",
        ...(response.ok && close
          ? {}
          : { error: "Yahoo Finance response did not contain a DXY close" })
      };
    } catch (error) {
      return {
        sourceCode: this.sourceCode,
        fetchedAt,
        data: [],
        rawPayload: null,
        health: "down",
        error: String(error)
      };
    }
  }
}
