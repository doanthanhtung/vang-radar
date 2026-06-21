import { Body, Controller, Inject, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { isValidVisitorIp } from "@vang-radar/domain";
import { resolveClientIp } from "../../common/client-ip.js";
import { AccessLogService } from "./access-log.service.js";

type TelemetryRequest = {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
};

type AccessPayload = {
  ipAddress?: string;
  path?: string;
  userAgent?: string;
};

@ApiTags("telemetry")
@Controller("telemetry")
export class TelemetryController {
  constructor(@Inject(AccessLogService) private readonly accessLogService: AccessLogService) {}

  @Post("access")
  async recordAccess(@Req() request: TelemetryRequest, @Body() body: AccessPayload) {
    const ipAddress = body.ipAddress?.trim() || resolveClientIp(request);
    if (!isValidVisitorIp(ipAddress)) {
      return { recorded: false, reason: "invalid_ip" };
    }

    await this.accessLogService.record({
      ipAddress,
      path: body.path ?? null,
      userAgent: body.userAgent ?? headerValue(request.headers["user-agent"]) ?? null
    });

    return { recorded: true };
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}