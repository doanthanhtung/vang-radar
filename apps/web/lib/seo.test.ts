import { describe, expect, it } from "vitest";
import { absoluteUrl, getPublicSitemapEntries, getSiteUrl } from "./seo";
import sitemap from "../app/sitemap";

describe("seo", () => {
  it("defaults to production site URL", () => {
    expect(getSiteUrl()).toBe("https://vangscore.com");
    expect(absoluteUrl("/")).toBe("https://vangscore.com/");
    expect(absoluteUrl("/sitemap.xml")).toBe("https://vangscore.com/sitemap.xml");
  });

  it("uses the first URL when PUBLIC_WEB_URL is comma-separated", () => {
    const previous = process.env.PUBLIC_WEB_URL;
    process.env.PUBLIC_WEB_URL = "https://vangscore.com,https://www.vangscore.com";

    expect(getSiteUrl()).toBe("https://vangscore.com");
    expect(absoluteUrl("/gold/SJC_BAR")).toBe("https://vangscore.com/gold/SJC_BAR");

    if (previous === undefined) {
      delete process.env.PUBLIC_WEB_URL;
    } else {
      process.env.PUBLIC_WEB_URL = previous;
    }
  });

  it("includes every canonical public page exactly once", () => {
    const entries = getPublicSitemapEntries();

    expect(entries).toEqual([
      { path: "/" },
      { path: "/alerts" },
      { path: "/gold/SJC_BAR" },
      { path: "/gold/DOJI_RING_9999" },
      { path: "/gold/PNJ_RING_9999" },
      { path: "/gold/BTMC_RING_9999" }
    ]);
    expect(new Set(entries.map((entry) => entry.path)).size).toBe(entries.length);
  });

  it("generates only absolute HTTPS URLs on the canonical host", () => {
    const generated = sitemap();

    expect(generated).toEqual(
      getPublicSitemapEntries().map(({ path }) => ({ url: absoluteUrl(path) }))
    );
    expect(
      generated.every(({ url }) => {
        const parsed = new URL(url);
        return parsed.protocol === "https:" && parsed.hostname === "vangscore.com";
      })
    ).toBe(true);
    expect(generated.some(({ url }) => /\/admin|\/stack|api\./.test(url))).toBe(false);
  });
});
