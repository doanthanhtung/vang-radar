import { PRODUCT_CODES, calculateSpreadPct, type DomesticGoldQuote, type FxQuote, type WorldGoldQuote } from "@vang-radar/domain";

export interface ValidationResult {
  isValid: boolean;
  invalidReason: string | null;
  qualityScore: number;
}

function isFresh(date: Date | undefined, maxAgeMinutes: number): boolean {
  if (!date) return true;
  return Date.now() - date.getTime() <= maxAgeMinutes * 60 * 1000;
}

function jumpTooHigh(current: number, previous: number | null, maxJump: number): boolean {
  if (!previous || previous <= 0) return false;
  return Math.abs(current / previous - 1) > maxJump;
}

export function validateDomesticGoldQuote(quote: DomesticGoldQuote, previousSellPrice: number | null): ValidationResult {
  const reasons: string[] = [];
  if (quote.buyPriceVnd <= 0) reasons.push("buy_price_vnd must be positive");
  if (quote.sellPriceVnd <= 0) reasons.push("sell_price_vnd must be positive");
  if (quote.sellPriceVnd < quote.buyPriceVnd) reasons.push("sell_price_vnd must be >= buy_price_vnd");
  if (!PRODUCT_CODES.includes(quote.productCode)) reasons.push("productCode is not whitelisted");
  if (!isFresh(quote.quotedAt, 60)) reasons.push("timestamp is too old");
  if (quote.sellPriceVnd > quote.buyPriceVnd && calculateSpreadPct(quote.sellPriceVnd, quote.buyPriceVnd) > 0.08) {
    reasons.push("spread_pct is absurdly high");
  }
  if (jumpTooHigh(quote.sellPriceVnd, previousSellPrice, 0.05)) reasons.push("price jump exceeds 5%");

  return { isValid: reasons.length === 0, invalidReason: reasons.join("; ") || null, qualityScore: reasons.length ? 40 : 100 };
}

export function validateWorldGoldQuote(quote: WorldGoldQuote, previousPrice: number | null): ValidationResult {
  const reasons: string[] = [];
  if (quote.priceUsdPerOz <= 0) reasons.push("xau_usd_per_oz must be positive");
  if (!isFresh(quote.quotedAt, 30)) reasons.push("timestamp is too old");
  if (jumpTooHigh(quote.priceUsdPerOz, previousPrice, 0.05)) reasons.push("price jump exceeds 5%");
  return { isValid: reasons.length === 0, invalidReason: reasons.join("; ") || null, qualityScore: reasons.length ? 45 : 100 };
}

export function validateFxQuote(quote: FxQuote, previousRate: number | null): ValidationResult {
  const reasons: string[] = [];
  if (quote.rate <= 0) reasons.push("usd_vnd must be positive");
  if (quote.pair === "USDVND" && quote.rate < 20_000) reasons.push("usd_vnd is unrealistically low");
  if (quote.pair === "USDVND" && quote.rate > 40_000) reasons.push("usd_vnd is outside expected range");
  if (!isFresh(quote.quotedAt, 60)) reasons.push("timestamp is too old");
  if (jumpTooHigh(quote.rate, previousRate, 0.03)) reasons.push("rate jump exceeds 3%");
  return { isValid: reasons.length === 0, invalidReason: reasons.join("; ") || null, qualityScore: reasons.length ? 45 : 100 };
}
