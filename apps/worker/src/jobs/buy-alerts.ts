import type { PrismaClient } from "@prisma/client";
import { loadConfig } from "@vang-radar/config";
import { DISCLAIMER } from "@vang-radar/domain";
import { createLogger } from "@vang-radar/logger";

const logger = createLogger("buy-alerts");

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const ALERT_START_MINUTE = 8 * 60 + 30;
const ALERT_END_MINUTE = 16 * 60 + 30;
const MAX_PRODUCTS_PER_EMAIL = 2;

const RULES = {
  minScore: 74,
  minConfidence: 0.9,
  maxPremiumSellPct: 0.112,
  maxPremiumPercentile: 25,
  maxSpreadPct: 0.021,
  minXauMomentum7d: -0.03,
  minXauMomentum30d: -0.06,
  maxDomesticMomentum7d: 0.01
} as const;

type MailerTransport = {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
};

type NodemailerModule = {
  default?: {
    createTransport(options: unknown): MailerTransport;
  };
  createTransport?(options: unknown): MailerTransport;
};

type AlertCandidate = {
  code: string;
  name: string;
  brand: string;
  sellPrice: number;
  premiumSellPct: number;
  premiumPercentile: number | null;
  spreadPct: number;
  score: number;
  confidence: number;
  xauMomentum7d: number | null;
  xauMomentum30d: number | null;
  domesticMomentum7d: number | null;
  level: "Mua dần" | "Cơ hội tốt";
  reasons: string[];
};

export async function sendBuyAlerts(prisma: PrismaClient) {
  const now = new Date();
  if (!isWithinVietnamAlertWindow(now)) {
    return { sent: 0, skipped: "outside_alert_window" };
  }

  const candidates = await findAlertCandidates(prisma);
  if (candidates.length === 0) {
    return { sent: 0, skipped: "no_candidates" };
  }

  const selected = candidates.slice(0, MAX_PRODUCTS_PER_EMAIL);
  const subscribers = await prisma.notificationSubscriber.findMany({
    where: {
      status: "active",
      buyAlertEnabled: true,
      OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: vietnamStartOfToday(now) } }]
    },
    orderBy: { subscribedAt: "asc" },
    select: { id: true, email: true }
  });

  if (subscribers.length === 0) {
    return { sent: 0, skipped: "no_eligible_subscribers", candidates: selected.length };
  }

  const transporter = await createTransporter();
  if (!transporter) {
    return { sent: 0, skipped: "email_not_configured", candidates: selected.length };
  }

  const config = loadConfig();
  let sent = 0;
  for (const subscriber of subscribers) {
    try {
      await transporter.sendMail({
        from: `"VangScore" <${config.EMAIL_SENDER}>`,
        to: subscriber.email,
        subject: buildSubject(selected),
        text: buildText(selected),
        html: buildHtml(selected)
      });
      await prisma.notificationSubscriber.update({
        where: { id: subscriber.id },
        data: {
          lastNotifiedAt: now,
          notificationCount: { increment: 1 }
        }
      });
      sent += 1;
    } catch (error) {
      logger.error(
        { error, email: subscriber.email },
        "Unable to send buy alert email to subscriber"
      );
    }
  }

  return { sent, candidates: selected.length };
}

async function findAlertCandidates(prisma: PrismaClient): Promise<AlertCandidate[]> {
  const products = await prisma.goldProduct.findMany({
    where: { isActive: true },
    include: {
      goldMetrics: { orderBy: { time: "desc" }, take: 1 },
      signalSnapshots: { orderBy: { time: "desc" }, take: 1 }
    }
  });

  return products
    .map((product): AlertCandidate | null => {
      const metric = product.goldMetrics[0];
      const signal = product.signalSnapshots[0];
      if (!metric || !signal || metric.time.getTime() !== signal.time.getTime()) return null;
      if (signal.signal !== "BUY_DCA") return null;

      const score = Number(signal.score);
      const confidence = Number(signal.confidence);
      const premiumSellPct = Number(metric.premiumSellPct);
      const premiumPercentile =
        metric.premiumPercentile180d === null ? null : Number(metric.premiumPercentile180d);
      const spreadPct = Number(metric.spreadPct);
      const xauMomentum7d = metric.xauMomentum7d === null ? null : Number(metric.xauMomentum7d);
      const xauMomentum30d =
        metric.xauMomentum30d === null ? null : Number(metric.xauMomentum30d);
      const domesticMomentum7d =
        metric.domesticMomentum7d === null ? null : Number(metric.domesticMomentum7d);

      const premiumPassed =
        premiumSellPct <= RULES.maxPremiumSellPct ||
        (premiumPercentile !== null && premiumPercentile <= RULES.maxPremiumPercentile);

      if (
        score < RULES.minScore ||
        confidence < RULES.minConfidence ||
        !premiumPassed ||
        spreadPct > RULES.maxSpreadPct ||
        xauMomentum7d === null ||
        xauMomentum7d < RULES.minXauMomentum7d ||
        xauMomentum30d === null ||
        xauMomentum30d < RULES.minXauMomentum30d ||
        domesticMomentum7d === null ||
        domesticMomentum7d > RULES.maxDomesticMomentum7d
      ) {
        return null;
      }

      const level =
        score >= 77 &&
        premiumSellPct <= 0.108 &&
        premiumPercentile !== null &&
        premiumPercentile <= 15 &&
        spreadPct <= 0.0205
          ? "Cơ hội tốt"
          : "Mua dần";

      return {
        code: product.code,
        name: product.name,
        brand: product.brand,
        sellPrice: Number(metric.domesticSellPriceVnd),
        premiumSellPct,
        premiumPercentile,
        spreadPct,
        score,
        confidence,
        xauMomentum7d,
        xauMomentum30d,
        domesticMomentum7d,
        level,
        reasons: Array.isArray(signal.reasons)
          ? signal.reasons.map((reason) => String(reason)).slice(0, 3)
          : []
      };
    })
    .filter((candidate): candidate is AlertCandidate => candidate !== null)
    .sort((left, right) => {
      if (left.premiumSellPct !== right.premiumSellPct) {
        return left.premiumSellPct - right.premiumSellPct;
      }
      if (left.spreadPct !== right.spreadPct) return left.spreadPct - right.spreadPct;
      return right.score - left.score;
    });
}

async function createTransporter(): Promise<MailerTransport | null> {
  const config = loadConfig();
  if (!config.EMAIL_SENDER || !config.EMAIL_PASSWORD) {
    logger.warn("Email SMTP credentials are not configured");
    return null;
  }

  const nodemailer = (await import("nodemailer")) as NodemailerModule;
  const createTransport = nodemailer.default?.createTransport ?? nodemailer.createTransport;
  if (!createTransport) {
    logger.error("Nodemailer createTransport is unavailable");
    return null;
  }

  return createTransport({
    host: config.SMTP_SERVER,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: {
      user: config.EMAIL_SENDER,
      pass: config.EMAIL_PASSWORD
    }
  });
}

function isWithinVietnamAlertWindow(date: Date): boolean {
  const local = new Date(date.getTime() + VIETNAM_OFFSET_MS);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  return minute >= ALERT_START_MINUTE && minute <= ALERT_END_MINUTE;
}

function vietnamStartOfToday(date: Date): Date {
  const local = new Date(date.getTime() + VIETNAM_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - VIETNAM_OFFSET_MS
  );
}

function buildSubject(candidates: AlertCandidate[]): string {
  const best = candidates[0];
  return best?.level === "Cơ hội tốt"
    ? "VangScore: Xuất hiện cơ hội mua vàng tốt"
    : "VangScore: Có tín hiệu mua dần vàng";
}

function buildText(candidates: AlertCandidate[]): string {
  const lines = [
    "VangScore phát hiện vùng mua dần hợp lý theo dữ liệu mới nhất.",
    "",
    ...candidates.flatMap((candidate, index) => [
      `${index + 1}. ${candidate.name} (${candidate.brand})`,
      `Mức: ${candidate.level}`,
      `Giá bán: ${formatVnd(candidate.sellPrice)}`,
      `Premium: ${formatPercent(candidate.premiumSellPct)}`,
      `Spread: ${formatPercent(candidate.spreadPct)}`,
      `VangScore: ${candidate.score}`,
      ""
    ]),
    DISCLAIMER
  ];
  return lines.join("\n");
}

function buildHtml(candidates: AlertCandidate[]): string {
  const productCards = candidates
    .map(
      (candidate) => `
        <tr>
          <td style="padding:16px;border:1px solid rgba(148,163,184,0.18);border-radius:12px;background:#0f172a;">
            <div style="font-size:12px;font-weight:700;color:#facc15;">${escapeHtml(candidate.level)}</div>
            <h2 style="margin:8px 0 6px;color:#ffffff;font-size:18px;line-height:1.3;">${escapeHtml(candidate.name)}</h2>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;">${escapeHtml(candidate.brand)} · ${escapeHtml(candidate.code)}</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;color:#e2e8f0;font-size:14px;">
              <tr><td style="padding:5px 0;color:#94a3b8;">Giá bán</td><td align="right" style="padding:5px 0;font-weight:700;">${formatVnd(candidate.sellPrice)}</td></tr>
              <tr><td style="padding:5px 0;color:#94a3b8;">Premium</td><td align="right" style="padding:5px 0;">${formatPercent(candidate.premiumSellPct)}</td></tr>
              <tr><td style="padding:5px 0;color:#94a3b8;">Spread</td><td align="right" style="padding:5px 0;">${formatPercent(candidate.spreadPct)}</td></tr>
              <tr><td style="padding:5px 0;color:#94a3b8;">VangScore</td><td align="right" style="padding:5px 0;">${candidate.score}</td></tr>
            </table>
          </td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>VangScore Buy Alert</title>
  </head>
  <body style="margin:0;background:#0b1220;color:#e5e7eb;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b1220;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;border:1px solid rgba(250,204,21,0.22);border-radius:14px;background:#111827;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 18px;">
                <div style="display:inline-block;padding:7px 10px;border-radius:8px;background:rgba(250,204,21,0.12);color:#facc15;font-size:13px;font-weight:700;">VangScore Alert</div>
                <h1 style="margin:18px 0 10px;color:#ffffff;font-size:24px;line-height:1.25;">Có tín hiệu mua dần vàng</h1>
                <p style="margin:0;color:#cbd5e1;font-size:15px;line-height:1.7;">Premium và spread đã về vùng hợp lý hơn theo dữ liệu thị trường Việt Nam hiện tại.</p>
              </td>
            </tr>
            <tr><td style="padding:0 28px 18px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-spacing:0 12px;">${productCards}</table></td></tr>
            <tr><td style="padding:0 28px 26px;color:#94a3b8;font-size:12px;line-height:1.6;">${escapeHtml(DISCLAIMER)}</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toLocaleString("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}

function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
