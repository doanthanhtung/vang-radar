import { afterEach, describe, expect, it, vi } from "vitest";
import { getApiUrl, getMarketSummary } from "./api-client";

describe("market summary API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the same-origin rewrite and bypasses server caching for the live summary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          time: "2026-08-04T00:00:00.000Z",
          world: { xauUsdPerOz: 2400, usdVnd: 26000, worldVndPerLuong: 75_000_000, change7d: null },
          macro: { dxy: null },
          products: []
        })
      )
    );
    vi.stubGlobal("window", { location: { hostname: "vangscore.com" } });
    vi.stubGlobal("fetch", fetchMock);

    await getMarketSummary();

    expect(getApiUrl("/market/summary/stream")).toBe("/api/v1/market/summary/stream");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/market/summary",
      expect.objectContaining({ cache: "no-store" })
    );
  });
});
