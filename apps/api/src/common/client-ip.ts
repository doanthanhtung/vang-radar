type HeaderValue = string | string[] | undefined;

export type RequestWithIp = {
  ip?: string;
  headers: Record<string, HeaderValue>;
};

export function resolveClientIp(request: RequestWithIp): string | undefined {
  const cfConnectingIp = headerValue(request.headers["cf-connecting-ip"]);
  if (cfConnectingIp) return cfConnectingIp;

  const realIp = headerValue(request.headers["x-real-ip"]);
  if (realIp) return realIp;

  const forwarded = headerValue(request.headers["x-forwarded-for"]);
  if (forwarded) {
    const firstHop = forwarded.split(",")[0]?.trim();
    if (firstHop) return firstHop;
  }

  return request.ip?.trim() || undefined;
}

function headerValue(value: HeaderValue): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed || undefined;
}