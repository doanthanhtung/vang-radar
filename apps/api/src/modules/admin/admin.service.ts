import { Inject, Injectable } from "@nestjs/common";
import { AuditService } from "./audit.service.js";
import { AccessLogService } from "../telemetry/access-log.service.js";
import { PrismaService } from "../../common/prisma.service.js";

@Injectable()
export class AdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(AccessLogService) private readonly accessLogService: AccessLogService
  ) {}

  audit(request: Parameters<AuditService["record"]>[0], action: string, metadata?: Record<string, string | number | boolean | null>) {
    return this.auditService.record(request, {
      action,
      ...(metadata ? { metadata } : {})
    });
  }

  getAuditLogs(params: Parameters<AuditService["list"]>[0]) {
    return this.auditService.list(params);
  }

  getTodayIpAccess() {
    return this.accessLogService.listTodayIpAccess();
  }

  async getSourceHealth() {
    const sources = await this.prisma.source.findMany({ orderBy: { code: "asc" } });
    return Promise.all(
      sources.map(async (source) => {
        const [domesticInvalid, worldInvalid, fxInvalid] = await Promise.all([
          this.prisma.domesticGoldPrice.count({ where: { sourceId: source.id, isValid: false } }),
          this.prisma.worldGoldPrice.count({ where: { sourceId: source.id, isValid: false } }),
          this.prisma.fxRate.count({ where: { sourceId: source.id, isValid: false } })
        ]);
        return {
          code: source.code,
          name: source.name,
          type: source.type,
          health: domesticInvalid + worldInvalid + fxInvalid > 0 ? "degraded" : "healthy"
        };
      })
    );
  }

  async getJobs() {
    return {
      queues: [
        "fetch-domestic-gold",
        "fetch-world-gold",
        "fetch-fx",
        "calculate-metrics",
        "generate-signals",
        "refresh-market-summary-cache"
      ],
      note: "Worker owns BullMQ job execution. This endpoint is the admin read model for MVP."
    };
  }

  runIngestion(requestId?: string, scope = "all") {
    return {
      accepted: true,
      scope,
      requestId: requestId ?? crypto.randomUUID(),
      message: "Manual ingestion requested. In production this enqueues BullMQ jobs."
    };
  }

  async getLatestDataQuality() {
    const [domesticInvalid, worldInvalid, fxInvalid] = await Promise.all([
      this.prisma.domesticGoldPrice.findMany({ where: { isValid: false }, orderBy: { time: "desc" }, take: 20 }),
      this.prisma.worldGoldPrice.findMany({ where: { isValid: false }, orderBy: { time: "desc" }, take: 20 }),
      this.prisma.fxRate.findMany({ where: { isValid: false }, orderBy: { time: "desc" }, take: 20 })
    ]);

    return { domesticInvalid, worldInvalid, fxInvalid };
  }
}
