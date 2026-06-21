import { Inject, Injectable, Logger } from "@nestjs/common";
import { isValidVisitorIp } from "@vang-radar/domain";
import { PrismaService } from "../../common/prisma.service.js";
import { getVietnamTodayRange } from "../../common/vietnam-time.js";

type AccessRecord = {
  ipAddress: string;
  path?: string | null;
  userAgent?: string | null;
};

export type TodayIpAccess = {
  ipAddress: string;
  visitCount: number;
  firstAccessAt: string;
  lastAccessAt: string;
  lastPath: string | null;
};

@Injectable()
export class AccessLogService {
  private readonly logger = new Logger(AccessLogService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(record: AccessRecord): Promise<void> {
    const ipAddress = record.ipAddress.trim();
    if (!isValidVisitorIp(ipAddress)) return;

    try {
      await this.prisma.siteAccessLog.create({
        data: {
          ipAddress,
          path: record.path?.trim().slice(0, 512) ?? null,
          userAgent: record.userAgent?.trim().slice(0, 512) ?? null
        }
      });
    } catch (error) {
      this.logger.error("Unable to persist site access event", error instanceof Error ? error.stack : undefined);
    }
  }

  async listTodayIpAccess(): Promise<{ date: string; items: TodayIpAccess[]; totalVisits: number }> {
    const { start, end, dateLabel } = getVietnamTodayRange();
    const logs = await this.prisma.siteAccessLog.findMany({
      where: {
        accessedAt: {
          gte: start,
          lt: end
        }
      },
      select: {
        ipAddress: true,
        accessedAt: true,
        path: true
      },
      orderBy: { accessedAt: "desc" }
    });

    const grouped = new Map<string, TodayIpAccess>();

    for (const log of logs) {
      if (!isValidVisitorIp(log.ipAddress)) continue;

      const existing = grouped.get(log.ipAddress);
      if (!existing) {
        grouped.set(log.ipAddress, {
          ipAddress: log.ipAddress,
          visitCount: 1,
          firstAccessAt: log.accessedAt.toISOString(),
          lastAccessAt: log.accessedAt.toISOString(),
          lastPath: log.path
        });
        continue;
      }

      existing.visitCount += 1;
      existing.firstAccessAt = log.accessedAt.toISOString();
    }

    const items = [...grouped.values()].sort(
      (left, right) => new Date(right.lastAccessAt).getTime() - new Date(left.lastAccessAt).getTime()
    );

    const totalVisits = items.reduce((sum, entry) => sum + entry.visitCount, 0);

    return {
      date: dateLabel,
      items,
      totalVisits
    };
  }
}