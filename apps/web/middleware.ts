import {
  getClientIp,
  getCloudflareGeo,
  isStaticAsset,
  isValidVisitorIp,
  shouldTrackVisitor
} from "@vang-radar/domain";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase();
  if (host === "www.vangscore.com") {
    const url = request.nextUrl.clone();
    url.protocol = "https";
    url.host = "vangscore.com";
    return NextResponse.redirect(url, 308);
  }

  const pathname = request.nextUrl.pathname;
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const ipAddress = getClientIp(request.headers) ?? null;
  const geo = getCloudflareGeo(request.headers);
  const context = {
    ipAddress,
    path: pathname,
    method: request.method,
    userAgent: request.headers.get("user-agent"),
    acceptLanguage: request.headers.get("accept-language"),
    referer: request.headers.get("referer"),
    country: geo.country,
    city: geo.city
  };

  if (isValidVisitorIp(ipAddress) && shouldTrackVisitor(context)) {
    const apiBaseUrl =
      process.env.PUBLIC_API_BASE_URL ??
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      "http://localhost:4000/api/v1";

    void fetch(`${apiBaseUrl}/telemetry/access`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        ipAddress,
        path: pathname,
        method: request.method,
        userAgent: context.userAgent,
        acceptLanguage: context.acceptLanguage,
        referer: context.referer,
        country: context.country,
        city: context.city
      })
    }).catch(() => undefined);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"]
};
