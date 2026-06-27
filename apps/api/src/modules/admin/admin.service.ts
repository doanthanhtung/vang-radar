import { Inject, Injectable, NotFoundException } from "@nestjs/common";
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

  audit(
    request: Parameters<AuditService["record"]>[0],
    action: string,
    metadata?: Record<string, string | number | boolean | null>
  ) {
    return this.auditService.record(request, {
      action,
      ...(metadata ? { metadata } : {})
    });
  }

  getAuditLogs(params: Parameters<AuditService["list"]>[0]) {
    return this.auditService.list(params);
  }

  getTodayIpAccess(audience: "human" | "bot" | "all" = "human", country?: string | undefined) {
    return this.accessLogService.listTodayIpAccess(audience, country);
  }

  async getNotificationSubscribers(params: {
    status?: string | undefined;
    skip?: number | undefined;
    take?: number | undefined;
  }) {
    const status = params.status?.trim() || undefined;
    const skip = Math.max(0, Math.floor(params.skip ?? 0));
    const take = Math.min(100, Math.max(1, Math.floor(params.take ?? 50)));
    const where = status ? { status } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notificationSubscriber.findMany({
        where,
        orderBy: { subscribedAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          email: true,
          status: true,
          buyAlertEnabled: true,
          subscribedAt: true,
          unsubscribedAt: true,
          lastNotifiedAt: true,
          notificationCount: true
        }
      }),
      this.prisma.notificationSubscriber.count({ where })
    ]);

    return { items, total, skip, take };
  }

  async removeNotificationSubscriber(id: string) {
    const subscriber = await this.prisma.notificationSubscriber
      .update({
        where: { id },
        data: {
          status: "unsubscribed",
          buyAlertEnabled: false,
          unsubscribedAt: new Date()
        },
        select: {
          id: true,
          email: true,
          status: true,
          buyAlertEnabled: true,
          unsubscribedAt: true
        }
      })
      .catch(() => null);

    if (!subscriber) {
      throw new NotFoundException("Subscriber not found");
    }

    return {
      ...subscriber,
      unsubscribedAt: subscriber.unsubscribedAt?.toISOString() ?? null
    };
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
        "fetch-macro-indicators",
        "calculate-metrics",
        "generate-signals",
        "send-buy-alerts",
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
      this.prisma.domesticGoldPrice.findMany({
        where: { isValid: false },
        orderBy: { time: "desc" },
        take: 20
      }),
      this.prisma.worldGoldPrice.findMany({
        where: { isValid: false },
        orderBy: { time: "desc" },
        take: 20
      }),
      this.prisma.fxRate.findMany({
        where: { isValid: false },
        orderBy: { time: "desc" },
        take: 20
      })
    ]);

    return { domesticInvalid, worldInvalid, fxInvalid };
  }
}
