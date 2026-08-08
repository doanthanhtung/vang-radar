import type { FactorHistoryPoint } from "./factor-history";

export type MarketFactor = "xau" | "usd" | "dxy";

type FactorHistoryLoaders = Record<MarketFactor, () => Promise<FactorHistoryPoint[]>>;

export async function loadMarketFactorHistories(
  loaders: FactorHistoryLoaders
): Promise<Partial<Record<MarketFactor, FactorHistoryPoint[]>>> {
  const factors: MarketFactor[] = ["xau", "usd", "dxy"];
  const results = await Promise.allSettled(factors.map((factor) => loaders[factor]()));

  return results.reduce<Partial<Record<MarketFactor, FactorHistoryPoint[]>>>(
    (histories, result, index) => {
      if (result.status === "fulfilled") histories[factors[index]!] = result.value;
      return histories;
    },
    {}
  );
}
