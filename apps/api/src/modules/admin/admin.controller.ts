import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { ApiBasicAuth, ApiTags } from "@nestjs/swagger";
import { AdminBasicAuthGuard } from "../../common/admin-basic-auth.guard.js";
import { AdminService } from "./admin.service.js";

@ApiTags("admin")
@ApiBasicAuth()
@Controller("admin")
@UseGuards(AdminBasicAuthGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Get("sources/health")
  async getSourceHealth(@Req() request: AdminRequest) {
    const result = await this.adminService.getSourceHealth();
    await this.adminService.audit(request, "source_health.viewed");
    return result;
  }

  @Get("jobs")
  async getJobs(@Req() request: AdminRequest) {
    const result = await this.adminService.getJobs();
    await this.adminService.audit(request, "jobs.viewed");
    return result;
  }

  @Post("jobs/run-ingestion")
  async runIngestion(
    @Req() request: AdminRequest,
    @Headers("x-request-id") requestId?: string,
    @Body() body?: { scope?: string }
  ) {
    const result = this.adminService.runIngestion(requestId, body?.scope);
    await this.adminService.audit(request, "ingestion.requested", { scope: result.scope ?? "all" });
    return result;
  }

  @Get("data-quality/latest")
  async getLatestDataQuality(@Req() request: AdminRequest) {
    const result = await this.adminService.getLatestDataQuality();
    await this.adminService.audit(request, "data_quality.viewed");
    return result;
  }

  @Get("audit")
  async getAuditLogs(
    @Req() request: AdminRequest,
    @Query("action") action?: string,
    @Query("skip") skip?: string,
    @Query("take") take?: string
  ) {
    const result = await this.adminService.getAuditLogs({
      ...(action ? { action } : {}),
      ...(numberQuery(skip) !== undefined ? { skip: numberQuery(skip) } : {}),
      ...(numberQuery(take) !== undefined ? { take: numberQuery(take) } : {})
    });
    await this.adminService.audit(request, "audit.viewed", { action: action ?? "all" });
    return result;
  }

  @Get("access/today")
  async getTodayAccess(
    @Req() request: AdminRequest,
    @Query("audience") audience?: string,
    @Query("country") country?: string
  ) {
    const result = await this.adminService.getTodayIpAccess(parseAudience(audience), country);
    await this.adminService.audit(request, "access_today.viewed", {
      audience: result.audience,
      country: result.country ?? "all"
    });
    return result;
  }

  @Get("notifications/subscribers")
  async getNotificationSubscribers(
    @Req() request: AdminRequest,
    @Query("status") status?: string,
    @Query("skip") skip?: string,
    @Query("take") take?: string
  ) {
    const result = await this.adminService.getNotificationSubscribers({
      ...(status ? { status } : {}),
      ...(numberQuery(skip) !== undefined ? { skip: numberQuery(skip) } : {}),
      ...(numberQuery(take) !== undefined ? { take: numberQuery(take) } : {})
    });
    await this.adminService.audit(request, "notification_subscribers.viewed", {
      status: status ?? "all",
      take: result.take
    });
    return result;
  }

  @Delete("notifications/subscribers/:id")
  async removeNotificationSubscriber(@Req() request: AdminRequest, @Param("id") id: string) {
    const result = await this.adminService.removeNotificationSubscriber(id);
    await this.adminService.audit(request, "notification_subscriber.removed", {
      id,
      email: result.email
    });
    return result;
  }
}

type AdminRequest = {
  adminUsername?: string;
  headers: Record<string, string | string[] | undefined>;
  id?: string;
  ip?: string;
};

function numberQuery(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseAudience(value?: string): "human" | "bot" | "all" {
  if (value === "bot" || value === "all") return value;
  return "human";
}
