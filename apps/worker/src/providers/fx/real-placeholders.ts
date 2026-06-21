import type { DataProvider, FxQuote, ProviderResult } from "@vang-radar/domain";

const EXCHANGERATE_URL = "https://api.exchangerate-api.com/v4/latest/USD";
const TWENTY_FOUR_H_GOLD_URL = "https://www.24h.com.vn/gia-vang-hom-nay-c425.html";

function numberFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^\d.,-]/g, "");
  const normalized =
    /^\d{1,3},\d{3}$/.test(cleaned) || /^\d{1,3}\.\d{3}$/.test(cleaned)
      ? cleaned.replace(/[,.]/g, "")
      : cleaned.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
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

function quoteFromTwentyFourH(markup: string): FxQuote | null {
  const text = stripTags(markup);
  const match = /USD\s+Mua\s+([\d,.]+)\s+B[aá]n\s+([\d,.]+)/i.exec(text);
  const rate = numberFrom(match?.[2] ?? match?.[1]);
  return rate ? { pair: "USDVND", rate, quotedAt: new Date() } : null;
}

export class FxProvider implements DataProvider<FxQuote | null> {
  readonly sourceCode = "EXCHANGERATE_API";

  async fetch(): Promise<ProviderResult<FxQuote | null>> {
    console.log("[FX] trying primary exchangerate-api");
    let primaryPayload: unknown = null;
    try {
      const response = await fetch(EXCHANGERATE_URL, {
        headers: { Accept: "application/json", "User-Agent": "vang-radar" }
      });
      primaryPayload = (await response.json().catch(() => null)) as unknown;
      const rate = (primaryPayload as { rates?: { VND?: unknown } } | null)?.rates?.VND;
      if (response.ok && typeof rate === "number" && rate > 1000) {
        console.log("[FX] success primary EXCHANGERATE_API", rate);
        return {
          sourceCode: this.sourceCode,
          fetchedAt: new Date(),
          data: { pair: "USDVND", rate, quotedAt: new Date() },
          rawPayload: primaryPayload,
          health: "healthy"
        };
      }
    } catch (error) {
      console.log("[FX] exchangerate fetch error", String(error));
    }

    console.log("[FX] primary failed, trying 24h HTML scrape fallback");
    const fallbackResponse = await fetch(TWENTY_FOUR_H_GOLD_URL, {
      headers: { Accept: "text/html" }
    });
    const fallbackPayload = await fallbackResponse.text();
    let fallbackData = fallbackResponse.ok ? quoteFromTwentyFourH(fallbackPayload) : null;

    // Safety: reject garbage rates from fragile HTML scrape (e.g. 26 instead of 26k)
    if (fallbackData && fallbackData.rate < 1000) {
      console.log("[FX] 24h scrape gave unrealistic rate", fallbackData.rate, "— rejecting");
      fallbackData = null;
    }

    return {
      sourceCode: this.sourceCode,
      fetchedAt: new Date(),
      data: fallbackData,
      rawPayload: fallbackPayload || primaryPayload,
      health: fallbackResponse.ok && fallbackData ? "healthy" : "degraded",
      ...(fallbackResponse.ok && fallbackData
        ? {}
        : { error: `No USD/VND rate parsed from ${EXCHANGERATE_URL} or ${TWENTY_FOUR_H_GOLD_URL}` })
    };
  }
}
