import { GRAMS_PER_LUONG, GRAMS_PER_TROY_OUNCE } from "../constants/gold.js";

export function calculateWorldVndPerLuong(xauUsdPerOz: number, usdVnd: number): number {
  return (xauUsdPerOz * usdVnd * GRAMS_PER_LUONG) / GRAMS_PER_TROY_OUNCE;
}

export function calculatePremiumPct(domesticPriceVnd: number, worldVndPerLuong: number): number {
  return domesticPriceVnd / worldVndPerLuong - 1;
}

export function calculateSpreadAbsVnd(
  domesticSellPriceVnd: number,
  domesticBuyPriceVnd: number
): number {
  return domesticSellPriceVnd - domesticBuyPriceVnd;
}

export function calculateSpreadPct(
  domesticSellPriceVnd: number,
  domesticBuyPriceVnd: number
): number {
  return calculateSpreadAbsVnd(domesticSellPriceVnd, domesticBuyPriceVnd) / domesticSellPriceVnd;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
