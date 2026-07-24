import type { PrismaClient } from "@prisma/client";
import { loadConfig } from "@vang-radar/config";
import { DISCLAIMER } from "@vang-radar/domain";
import { createLogger } from "@vang-radar/logger";

const logger = createLogger("buy-alerts");

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
  transitionTime: Date;
  level: "Mua dần";
  reasons: string[];
};

export async function sendBuyAlerts(prisma: PrismaClient) {
  const now = new Date();
  const candidates = await findAlertCandidates(prisma);
  if (candidates.length === 0) {
    return { sent: 0, skipped: "no_candidates" };
  }

  const selected = candidates;
  const latestTransitionTime = new Date(
    Math.max(...selected.map((candidate) => candidate.transitionTime.getTime()))
  );
  const subscribers = await prisma.notificationSubscriber.findMany({
    where: {
      status: "active",
      buyAlertEnabled: true,
      OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: latestTransitionTime } }]
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
      signalSnapshots: { orderBy: { time: "desc" }, take: 2 }
    }
  });

  return selectBuyDcaTransitions(products);
}

type TransitionProduct = {
  code: string;
  name: string;
  brand: string;
  goldMetrics: Array<{
    time: Date;
    domesticSellPriceVnd: unknown;
    premiumSellPct: unknown;
    premiumPercentile180d: unknown | null;
    spreadPct: unknown;
  }>;
  signalSnapshots: Array<{
    time: Date;
    signal: string;
    score: unknown;
    reasons: unknown;
  }>;
};

export function selectBuyDcaTransitions(products: TransitionProduct[]): AlertCandidate[] {
  return products
    .map((product): AlertCandidate | null => {
      const metric = product.goldMetrics[0];
      const currentSignal = product.signalSnapshots[0];
      const previousSignal = product.signalSnapshots[1];
      if (
        !metric ||
        !currentSignal ||
        !previousSignal ||
        metric.time.getTime() !== currentSignal.time.getTime() ||
        currentSignal.signal !== "BUY_DCA" ||
        previousSignal.signal === "BUY_DCA"
      ) {
        return null;
      }

      const score = Number(currentSignal.score);
      const premiumSellPct = Number(metric.premiumSellPct);
      const premiumPercentile =
        metric.premiumPercentile180d === null ? null : Number(metric.premiumPercentile180d);
      const spreadPct = Number(metric.spreadPct);

      return {
        code: product.code,
        name: product.name,
        brand: product.brand,
        sellPrice: Number(metric.domesticSellPriceVnd),
        premiumSellPct,
        premiumPercentile,
        spreadPct,
        score,
        transitionTime: currentSignal.time,
        level: "Mua dần",
        reasons: Array.isArray(currentSignal.reasons)
          ? currentSignal.reasons.map((reason) => String(reason)).slice(0, 3)
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

function buildSubject(candidates: AlertCandidate[]): string {
  return candidates.length > 1
    ? `VangScore: ${candidates.length} sản phẩm vừa chuyển sang mua dần`
    : "VangScore: Có sản phẩm vừa chuyển sang mua dần";
}

function buildText(candidates: AlertCandidate[]): string {
  const lines = [
    "VangScore phát hiện sản phẩm vừa chuyển sang tín hiệu mua dần.",
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
                <p style="margin:0;color:#cbd5e1;font-size:15px;line-height:1.7;">Tín hiệu mới nhất vừa chuyển sang BUY_DCA (mua dần).</p>
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
