import { Body, Controller, Inject, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { getClientIp, getCloudflareGeo, isStaticAsset, shouldTrackVisitor } from "@vang-radar/domain";
import { AccessLogService } from "./access-log.service.js";

type TelemetryRequest = {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
};

type AccessPayload = {
  ipAddress?: string;
  path?: string;
  method?: string;
  userAgent?: string;
  acceptLanguage?: string;
  referer?: string;
  country?: string;
  city?: string;
};

@ApiTags("telemetry")
@Controller("telemetry")
export class TelemetryController {
  constructor(@Inject(AccessLogService) private readonly accessLogService: AccessLogService) {}

  @Post("access")
  async recordAccess(@Req() request: TelemetryRequest, @Body() body: AccessPayload) {
    const path = body.path?.trim() || "/";
    if (isStaticAsset(path)) {
      return { recorded: false, audience: "skipped", reason: "static_asset" };
    }

    const geo = getCloudflareGeo(request.headers);
    const ipAddress = body.ipAddress?.trim() || getClientIp(request.headers, request.ip) || null;
    const context = {
      ipAddress,
      path,
      method: body.method?.trim() || "GET",
      userAgent: body.userAgent ?? headerValue(request.headers["user-agent"]) ?? null,
      acceptLanguage: body.acceptLanguage ?? headerValue(request.headers["accept-language"]) ?? null,
      referer: body.referer ?? headerValue(request.headers["referer"]) ?? null,
      country: body.country ?? geo.country ?? null,
      city: body.city ?? geo.city ?? null
    };

    if (!shouldTrackVisitor(context)) {
      return { recorded: false, audience: "skipped", reason: "missing_context" };
    }

    return this.accessLogService.record(context);
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}