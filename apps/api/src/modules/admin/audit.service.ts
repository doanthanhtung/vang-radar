import { Injectable, Inject, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { resolveClientIp } from "../../common/client-ip.js";
import { PrismaService } from "../../common/prisma.service.js";

type AdminRequest = {
  adminUsername?: string;
  headers: Record<string, string | string[] | undefined>;
  id?: string;
  ip?: string;
};

type AuditRecord = {
  action: string;
  metadata?: Record<string, string | number | boolean | null>;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(request: AdminRequest, record: AuditRecord): Promise<void> {
    const userAgent = headerValue(request.headers["user-agent"]);

    try {
      await this.prisma.adminAuditLog.create({
        data: {
          actor: request.adminUsername ?? "unknown",
          action: record.action,
          outcome: "success",
          requestId: headerValue(request.headers["x-request-id"]) ?? request.id ?? null,
          ipAddress: request.ip ?? resolveClientIp(request) ?? null,
          userAgent: userAgent?.slice(0, 512) ?? null,
          ...(record.metadata
            ? { metadata: record.metadata as Prisma.InputJsonValue }
            : {})
        }
      });
    } catch (error) {
      this.logger.error("Unable to persist admin audit event", error instanceof Error ? error.stack : undefined);
    }
  }

  async list(params: { action?: string | undefined; skip?: number | undefined; take?: number | undefined }) {
    const action = params.action?.trim() || undefined;
    const skip = Math.max(0, Math.floor(params.skip ?? 0));
    const take = Math.min(100, Math.max(1, Math.floor(params.take ?? 50)));
    const where = action ? { action } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          occurredAt: true,
          actor: true,
          action: true,
          outcome: true,
          requestId: true,
          ipAddress: true,
          userAgent: true,
          metadata: true
        }
      }),
      this.prisma.adminAuditLog.count({ where })
    ]);

    return { items, total, skip, take };
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
