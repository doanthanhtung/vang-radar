import { isValidVisitorIp } from "@vang-radar/domain";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const SKIP_PREFIXES = ["/_next", "/favicon", "/dashboard-gold.png"];

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (SKIP_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const apiBaseUrl =
    process.env.PUBLIC_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://localhost:4000/api/v1";
  const ipAddress = resolveClientIp(request.headers);

  if (isValidVisitorIp(ipAddress)) {
    void fetch(`${apiBaseUrl}/telemetry/access`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        ipAddress,
        path: pathname,
        userAgent: request.headers.get("user-agent")
      })
    }).catch(() => undefined);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"]
};

function resolveClientIp(headers: Headers): string | undefined {
  const cfConnectingIp = headers.get("cf-connecting-ip")?.trim();
  if (cfConnectingIp) return cfConnectingIp;

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const firstHop = forwarded.split(",")[0]?.trim();
    if (firstHop) return firstHop;
  }

  return undefined;
}