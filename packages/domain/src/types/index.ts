import type { PRODUCT_CODES } from "../constants/gold.js";

export type ProductCode = (typeof PRODUCT_CODES)[number];
export type ProviderHealth = "healthy" | "degraded" | "down";
export type GoldUnit = "luong" | "chi";
export type DecisionSignal = "BUY_DCA" | "HOLD" | "AVOID" | "TAKE_PROFIT" | "DATA_UNRELIABLE";
export type MacroIndicatorCode = "DXY" | "US10Y_YIELD" | "FED_RATE";

export interface ProviderResult<T> {
  sourceCode: string;
  fetchedAt: Date;
  data: T;
  rawPayload: unknown;
  health: ProviderHealth;
  error?: string;
}

export interface DataProvider<T> {
  sourceCode: string;
  fetch(): Promise<ProviderResult<T>>;
}

export interface DomesticGoldQuote {
  productCode: ProductCode;
  brand: string;
  name: string;
  buyPriceVnd: number;
  sellPriceVnd: number;
  unit: GoldUnit;
  quotedAt?: Date;
  sourceCode?: string;
}

export interface WorldGoldQuote {
  symbol: "XAUUSD";
  priceUsdPerOz: number;
  bid?: number;
  ask?: number;
  quotedAt?: Date;
}

export interface FxQuote {
  pair: "USDVND";
  rate: number;
  quotedAt?: Date;
}

export interface MacroIndicatorQuote {
  code: MacroIndicatorCode;
  value: number;
  unit: string;
  quotedAt?: Date;
  sourceSeriesId?: string;
}

export interface SignalInput {
  productCode: ProductCode;
  domesticBuyPriceVnd: number;
  domesticSellPriceVnd: number;
  xauUsdPerOz: number;
  usdVnd: number;
  worldVndPerLuong: number;
  premiumBuyPct: number;
  premiumSellPct: number;
  spreadAbsVnd: number;
  spreadPct: number;
  premiumPercentile180d: number | null;
  spreadPercentile180d: number | null;
  premiumSampleSize180d: number;
  spreadSampleSize180d: number;
  xauMomentum7d: number | null;
  xauMomentum30d: number | null;
  xauMomentum7dDays: number | null;
  xauMomentum30dDays: number | null;
  domesticMomentum7d: number | null;
  domesticMomentum7dDays: number | null;
  dataQualityScore: number;
  isDataValid: boolean;
}

export interface SignalOutput {
  signal: DecisionSignal;
  score: number;
  confidence: number;
  reasons: string[];
}
