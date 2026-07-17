import type { MetadataRoute } from "next";
import { absoluteUrl, getPublicSitemapEntries } from "../lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return getPublicSitemapEntries().map((entry) => ({
    url: absoluteUrl(entry.path),
    lastModified,
    changeFrequency: "hourly",
    priority: entry.priority
  }));
}
