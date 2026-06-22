import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  detectBot,
  isValidVisitorIp,
  type VisitorAudience,
  type VisitorRequestContext
} from "@vang-radar/domain";
import { PrismaService } from "../../common/prisma.service.js";
import { getVietnamTodayRange } from "../../common/vietnam-time.js";

const BOT_LOG_TTL_DAYS = 7;

export type AccessRecord = VisitorRequestContext;

export type TodayIpAccess = {
  ipAddress: string;
  visitCount: number;
  firstAccessAt: string;
  lastAccessAt: string;
  lastPath: string | null;
  country: string | null;
  userAgent: string | null;
  audience: "human" | "bot";
};

type PersistedAccessRow = {
  ipAddress: string;
  accessedAt: Date;
  path: string | null;
  userAgent: string | null;
  country: string | null;
};

@Injectable()
export class AccessLogService {
  private readonly logger = new Logger(AccessLogService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(record: AccessRecord): Promise<{ recorded: boolean; audience: "human" | "bot" | "skipped"; reason?: string }> {
    const ipAddress = record.ipAddress?.trim();
    if (!ipAddress || !isValidVisitorIp(ipAddress)) {
      return { recorded: false, audience: "skipped", reason: "invalid_ip" };
    }

    const context: VisitorRequestContext = {
      ipAddress,
      path: record.path ?? "/",
      method: record.method ?? "GET",
      userAgent: record.userAgent ?? null,
      acceptLanguage: record.acceptLanguage ?? null,
      referer: record.referer ?? null,
      country: record.country ?? null,
      city: record.city ?? null
    };

    const detection = detectBot(context);

    const payload = {
      ipAddress,
      path: trimOrNull(context.path, 512),
      method: trimOrNull(context.method, 16),
      userAgent: trimOrNull(context.userAgent, 512),
      acceptLanguage: trimOrNull(context.acceptLanguage, 128),
      referer: trimOrNull(context.referer, 512),
      country: trimOrNull(context.country, 64),
      city: trimOrNull(context.city, 128)
    };

    try {
      if (detection.isBot) {
        await this.recordBotAccess({
          ...payload,
          botReason: detection.botReason ?? "unknown_bot"
        });
        return { recorded: true, audience: "bot", reason: detection.botReason ?? "unknown_bot" };
      }

      await this.prisma.siteAccessLog.create({
        data: {
          ...payload,
          isBot: false,
          botReason: null
        }
      });

      return { recorded: true, audience: "human" };
    } catch (error) {
      this.logger.error("Unable to persist site access event", error instanceof Error ? error.stack : undefined);
      return { recorded: false, audience: "skipped", reason: "persist_failed" };
    }
  }

  async listTodayIpAccess(audience: VisitorAudience = "human"): Promise<{
    date: string;
    audience: VisitorAudience;
    items: TodayIpAccess[];
    totalVisits: number;
  }> {
    const { start, end, dateLabel } = getVietnamTodayRange();
    const rows =
      audience === "bot"
        ? await this.loadBotRows(start, end)
        : audience === "all"
          ? [...(await this.loadHumanRows(start, end)), ...(await this.loadBotRows(start, end))]
          : await this.loadHumanRows(start, end);

    const grouped = new Map<string, TodayIpAccess>();

    for (const row of rows) {
      if (!isValidVisitorIp(row.ipAddress)) continue;

      const accessedAt = row.accessedAt.toISOString();
      const existing = grouped.get(row.ipAddress);
      if (!existing) {
        grouped.set(row.ipAddress, {
          ipAddress: row.ipAddress,
          visitCount: 1,
          firstAccessAt: accessedAt,
          lastAccessAt: accessedAt,
          lastPath: row.path,
          country: row.country,
          userAgent: row.userAgent,
          audience: row.audience
        });
        continue;
      }

      existing.visitCount += 1;
      if (new Date(accessedAt).getTime() < new Date(existing.firstAccessAt).getTime()) {
        existing.firstAccessAt = accessedAt;
      }
      if (new Date(accessedAt).getTime() >= new Date(existing.lastAccessAt).getTime()) {
        existing.lastAccessAt = accessedAt;
        existing.lastPath = row.path;
        existing.country = row.country ?? existing.country;
        existing.userAgent = row.userAgent ?? existing.userAgent;
      }
    }

    const items = [...grouped.values()].sort(
      (left, right) => new Date(right.lastAccessAt).getTime() - new Date(left.lastAccessAt).getTime()
    );
    const totalVisits = items.reduce((sum, entry) => sum + entry.visitCount, 0);

    return {
      date: dateLabel,
      audience,
      items,
      totalVisits
    };
  }

  private async recordBotAccess(record: {
    ipAddress: string;
    path: string | null;
    method: string | null;
    userAgent: string | null;
    acceptLanguage: string | null;
    referer: string | null;
    country: string | null;
    city: string | null;
    botReason: string;
  }): Promise<void> {
    const expiresAt = new Date(Date.now() + BOT_LOG_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.prisma.botAccessLog.create({
      data: {
        ipAddress: record.ipAddress,
        path: trimOrNull(record.path, 512),
        method: trimOrNull(record.method, 16),
        userAgent: trimOrNull(record.userAgent, 512),
        acceptLanguage: trimOrNull(record.acceptLanguage, 128),
        referer: trimOrNull(record.referer, 512),
        country: trimOrNull(record.country, 64),
        city: trimOrNull(record.city, 128),
        botReason: trimOrNull(record.botReason, 128) ?? "unknown_bot",
        expiresAt
      }
    });

    void this.purgeExpiredBotLogs().catch((error) => {
      this.logger.error("Unable to purge expired bot logs", error instanceof Error ? error.stack : undefined);
    });
  }

  private async purgeExpiredBotLogs(): Promise<void> {
    await this.prisma.botAccessLog.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });
  }

  private async loadHumanRows(start: Date, end: Date): Promise<Array<PersistedAccessRow & { audience: "human" }>> {
    const logs = await this.prisma.siteAccessLog.findMany({
      where: {
        accessedAt: { gte: start, lt: end },
        isBot: false
      },
      select: {
        ipAddress: true,
        accessedAt: true,
        path: true,
        userAgent: true,
        country: true
      },
      orderBy: { accessedAt: "desc" }
    });

    return logs.map((log) => ({ ...log, audience: "human" as const }));
  }

  private async loadBotRows(start: Date, end: Date): Promise<Array<PersistedAccessRow & { audience: "bot" }>> {
    const logs = await this.prisma.botAccessLog.findMany({
      where: { accessedAt: { gte: start, lt: end } },
      select: {
        ipAddress: true,
        accessedAt: true,
        path: true,
        userAgent: true,
        country: true
      },
      orderBy: { accessedAt: "desc" }
    });

    return logs.map((log) => ({ ...log, audience: "bot" as const }));
  }
}

function trimOrNull(value: string | null | undefined, maxLength: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}