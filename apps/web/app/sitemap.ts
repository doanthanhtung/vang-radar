import type { MetadataRoute } from "next";
import { absoluteUrl, getPublicSitemapEntries } from "../lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return getPublicSitemapEntries().map((entry) => ({
    url: absoluteUrl(entry.path)
  }));
}
