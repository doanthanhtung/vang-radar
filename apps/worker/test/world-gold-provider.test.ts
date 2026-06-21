import { describe, expect, it } from "vitest";
import { quoteFromKitcoMarkup } from "../src/providers/world-gold/real-placeholders.js";

describe("Kitco world gold provider", () => {
  it("parses the SSR metal quote from Kitco markup", () => {
    const markup = `<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"dehydratedState":{"queries":[{"state":{"data":{"GetMetalQuoteV3":{"results":[{"ask":4276.8,"bid":4274.8,"mid":4275.8,"timestamp":1781740740}]}}}}]}}}}</script>`;

    const quote = quoteFromKitcoMarkup(markup);

    expect(quote).toEqual({
      symbol: "XAUUSD",
      priceUsdPerOz: 4275.8,
      bid: 4274.8,
      ask: 4276.8,
      quotedAt: new Date(1781740740 * 1000)
    });
  });

  it("returns null when Kitco markup does not contain a metal quote", () => {
    expect(quoteFromKitcoMarkup("<html></html>")).toBeNull();
  });
});
