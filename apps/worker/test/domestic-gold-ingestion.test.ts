import type { DomesticGoldQuote } from "@vang-radar/domain";
import { describe, expect, it } from "vitest";
import { mergeDomesticGoldQuotes } from "../src/jobs/ingestion.js";

const aggregatorDoji: DomesticGoldQuote = {
  productCode: "DOJI_RING_9999",
  brand: "DOJI",
  name: "Nhan 9999",
  buyPriceVnd: 143_500_000,
  sellPriceVnd: 147_500_000,
  unit: "luong",
  sourceCode: "TWENTY_FOUR_MONEY_GOLD"
};

const officialDoji: DomesticGoldQuote = {
  ...aggregatorDoji,
  buyPriceVnd: 142_000_000,
  sellPriceVnd: 146_000_000,
  sourceCode: "DOJI_OFFICIAL"
};

describe("domestic gold quote merge", () => {
  it("replaces only aggregator DOJI when the official quote succeeds", () => {
    const sjc: DomesticGoldQuote = {
      ...aggregatorDoji,
      productCode: "SJC_BAR",
      brand: "SJC"
    };

    expect(mergeDomesticGoldQuotes([sjc, aggregatorDoji], officialDoji)).toEqual([
      sjc,
      officialDoji
    ]);
  });

  it("retains aggregator DOJI when the official quote is unavailable", () => {
    expect(mergeDomesticGoldQuotes([aggregatorDoji], null)).toEqual([aggregatorDoji]);
  });
});
