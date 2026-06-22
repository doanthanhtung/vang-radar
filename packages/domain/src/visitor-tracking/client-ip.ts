import type { HeaderMap } from "./types.js";

/** Resolve the visitor IP behind Cloudflare or reverse proxies. */
export function getClientIp(headers: HeaderMap, remoteAddress?: string | null): string | undefined {
  const cfConnectingIp = headerValue(headers, "cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp;

  const forwarded = headerValue(headers, "x-forwarded-for");
  if (forwarded) {
    const firstHop = forwarded.split(",")[0]?.trim();
    if (firstHop) return firstHop;
  }

  const remote = remoteAddress?.trim();
  return remote || undefined;
}

export function getCloudflareGeo(headers: HeaderMap): { country: string | null; city: string | null } {
  const country = headerValue(headers, "cf-ipcountry") ?? null;
  const city = headerValue(headers, "cf-ipcity") ?? null;
  return { country, city };
}

function headerValue(headers: HeaderMap, name: string): string | undefined {
  if (typeof (headers as { get?: unknown }).get === "function") {
    const value = (headers as { get(name: string): string | null }).get(name);
    return value?.trim() || undefined;
  }

  const record = headers as Record<string, string | string[] | undefined>;
  const raw = record[name] ?? record[name.toLowerCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed || undefined;
}