import { describe, expect, it } from "vitest";
import {
  absoluteUrl,
  getPublicSitemapEntries,
  getSiteUrl
} from "./seo";

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

  it("includes homepage and all gold product pages", () => {
    const entries = getPublicSitemapEntries();

    expect(entries[0]).toEqual({ path: "/", priority: 1 });
    expect(entries.length).toBeGreaterThan(1);
    expect(entries.every((entry) => entry.path === "/" || entry.path.startsWith("/gold/"))).toBe(
      true
    );
    expect(entries.find((entry) => entry.path === "/gold/SJC_BAR")).toEqual({
      path: "/gold/SJC_BAR",
      priority: 0.8
    });
  });
});