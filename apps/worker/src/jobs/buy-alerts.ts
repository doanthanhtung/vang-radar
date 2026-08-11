import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { createUnsubscribeToken, loadConfig } from "@vang-radar/config";
import { DISCLAIMER } from "@vang-radar/domain";
import { createLogger } from "@vang-radar/logger";
import { acquireAlertLock, releaseAlertLock } from "./alert-lock.js";

const logger = createLogger("buy-alerts");

type MailerTransport = {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    headers?: Record<string, string>;
  }): Promise<unknown>;
};

type NodemailerModule = {
  default?: {
    createTransport(options: unknown): MailerTransport;
  };
  createTransport?(options: unknown): MailerTransport;
};

type AlertCandidate = {
  eventId?: string;
  eventType?: string;
  episode?: number;
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

export type AlertEventBaseline = {
  score: number;
  premiumSellPct: number;
  episode: number;
};

export type AlertEventSelection = AlertCandidate & {
  type: "ENTERED_BUY_DCA" | "BUY_DCA_IMPROVED" | "PREMIUM_DROP";
  episode: number;
  fingerprint: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_GAP_MS = 8 * 60 * 60 * 1000;
const FRESH_METRIC_MS = 15 * 60 * 1000;
const PREMIUM_DROP_STEP = 0.005;
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const ALERT_LOCK_TTL_MS = 30 * 60 * 1000;
const UNLIMITED_ALERT_EMAIL = "doanthanhtung.pc@gmail.com";

export async function sendBuyAlerts(prisma: PrismaClient, redis?: Redis) {
  if (!redis) return sendBuyAlertsUnlocked(prisma);

  const token = randomUUID();
  if (!(await acquireAlertLock(redis, token, ALERT_LOCK_TTL_MS))) {
    return { sent: 0, skipped: "already_running" };
  }

  try {
    return await sendBuyAlertsUnlocked(prisma, redis);
  } finally {
    await releaseAlertLock(redis, token);
  }
}

async function sendBuyAlertsUnlocked(prisma: PrismaClient, redis?: Redis) {
  const now = new Date();
  const pending = await findPendingAlertEvents(prisma, now, redis);
  if (pending.length === 0) return { sent: 0, skipped: "no_candidates" };
  const subscribers = selectTemporaryAlertRecipients(await prisma.notificationSubscriber.findMany({
    where: { status: "active", buyAlertEnabled: true },
    orderBy: { subscribedAt: "asc" },
    select: { id: true, email: true, unsubscribeVersion: true }
  }));
  if (subscribers.length === 0) return { sent: 0, skipped: "no_eligible_subscribers", candidates: pending.length };

  const transporter = await createTransporter();
  if (!transporter) {
    return { sent: 0, skipped: "email_not_configured", candidates: pending.length };
  }

  const config = loadConfig();
  let sent = 0;
  for (const subscriber of subscribers) {
    try {
      const deliveries = await prisma.buyAlertDelivery.findMany({
        where: { subscriberId: subscriber.id, sentAt: { gte: new Date(now.getTime() - DAY_MS) } },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true }
      });
      if (
        !isUnlimitedAlertRecipient(subscriber.email) &&
        !canDispatchNotification(deliveries.map((delivery) => delivery.sentAt), now)
      ) {
        continue;
      }
      const delivered = await prisma.buyAlertDelivery.findMany({
        where: { subscriberId: subscriber.id, eventId: { in: pending.map((candidate) => candidate.eventId!) } },
        select: { eventId: true }
      });
      const deliveredIds = new Set(delivered.map((delivery) => delivery.eventId));
      const selected = pending.filter((candidate) => candidate.eventId && !deliveredIds.has(candidate.eventId));
      if (selected.length === 0) continue;
      const headers = buildUnsubscribeHeaders(subscriber);
      await transporter.sendMail({
        from: `"VangScore" <${config.EMAIL_SENDER}>`,
        to: subscriber.email,
        subject: buildSubject(selected),
        text: buildText(selected),
        html: buildHtml(selected),
        ...(headers ? { headers } : {})
      });
      await prisma.buyAlertDelivery.createMany({
        data: selected.map((candidate) => ({ eventId: candidate.eventId!, subscriberId: subscriber.id, sentAt: now })),
        skipDuplicates: true
      });
      await prisma.notificationSubscriber.update({ where: { id: subscriber.id }, data: { lastNotifiedAt: now, notificationCount: { increment: 1 } } });
      sent += 1;
    } catch (error) {
      logger.error(
        { error, email: subscriber.email },
        "Unable to send buy alert email to subscriber"
      );
    }
  }

  return { sent, candidates: pending.length };
}

export function canDispatchNotification(sentAt: Date[], now: Date): boolean {
  const recent = sentAt.filter((date) => now.getTime() - date.getTime() < DAY_MS);
  if (recent.length >= 2) return false;
  const latest = recent.sort((left, right) => right.getTime() - left.getTime())[0];
  return !latest || now.getTime() - latest.getTime() >= MIN_GAP_MS;
}

export function isUnlimitedAlertRecipient(email: string): boolean {
  return email.trim().toLowerCase() === UNLIMITED_ALERT_EMAIL;
}

export function selectTemporaryAlertRecipients<T extends { email: string }>(subscribers: T[]): T[] {
  return subscribers.filter((subscriber) => isUnlimitedAlertRecipient(subscriber.email));
}

export function deduplicateAlertCandidates(candidates: AlertCandidate[]): AlertCandidate[] {
  const latestByProduct = new Map<string, AlertCandidate>();
  for (const candidate of candidates) {
    const key = candidate.eventType === "PREMIUM_DROP"
      ? `${candidate.code}:${candidate.eventType}:${candidate.episode ?? 0}`
      : candidate.code;
    const existing = latestByProduct.get(key);
    if (!existing || candidate.transitionTime > existing.transitionTime) {
      latestByProduct.set(key, candidate);
    }
  }
  return [...latestByProduct.values()].sort((left, right) => {
    if (left.transitionTime.getTime() !== right.transitionTime.getTime()) {
      return left.transitionTime.getTime() - right.transitionTime.getTime();
    }
    if (left.premiumSellPct !== right.premiumSellPct) {
      return left.premiumSellPct - right.premiumSellPct;
    }
    if (left.spreadPct !== right.spreadPct) return left.spreadPct - right.spreadPct;
    return right.score - left.score;
  });
}

function buildUnsubscribeHeaders(subscriber: { id: string; unsubscribeVersion: number }): Record<string, string> | undefined {
  const config = loadConfig();
  if (!config.EMAIL_UNSUBSCRIBE_SECRET) return undefined;
  const token = createUnsubscribeToken({
    subscriberId: subscriber.id,
    version: subscriber.unsubscribeVersion,
    secret: config.EMAIL_UNSUBSCRIBE_SECRET
  });
  const baseUrl = config.PUBLIC_API_BASE_URL.replace(/\/$/, "");
  return {
    "List-Unsubscribe": `<${baseUrl}/notifications/unsubscribe/${token}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
  };
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

type PremiumHistoryPoint = {
  time: Date | string;
  premiumSellPct: unknown;
};

type SnapshotReader = {
  get(key: string): Promise<string | null>;
};

function vietnamDate(value: Date): string {
  return new Date(value.getTime() + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
}

function vietnamStartOfToday(now: Date): Date {
  const vietnamNow = new Date(now.getTime() + VIETNAM_OFFSET_MS);
  return new Date(
    Date.UTC(vietnamNow.getUTCFullYear(), vietnamNow.getUTCMonth(), vietnamNow.getUTCDate()) -
      VIETNAM_OFFSET_MS
  );
}

export function findPreviousTradingDayPremium(points: PremiumHistoryPoint[], now: Date): number | null {
  const cutoff = vietnamStartOfToday(now).getTime();
  const previous = points
    .map((point) => ({ time: new Date(point.time), premiumSellPct: Number(point.premiumSellPct) }))
    .filter(
      (point) =>
        !Number.isNaN(point.time.getTime()) &&
        point.time.getTime() < cutoff &&
        Number.isFinite(point.premiumSellPct)
    )
    .sort((left, right) => right.time.getTime() - left.time.getTime())[0];
  return previous?.premiumSellPct ?? null;
}

export async function loadPreviousTradingDayPremiumFromSnapshot(
  redis: SnapshotReader,
  productCode: string,
  now: Date
): Promise<number | null> {
  try {
    const pointer = await redis.get("market:snapshot:current");
    if (!pointer) return null;
    const parsedPointer = JSON.parse(pointer) as { snapshotId?: unknown };
    if (typeof parsedPointer.snapshotId !== "string") return null;
    const history = await redis.get(
      `market:snapshot:${parsedPointer.snapshotId}:product:${productCode}:metrics:history:1y`
    );
    if (!history) return null;
    const parsedHistory = JSON.parse(history);
    return Array.isArray(parsedHistory) ? findPreviousTradingDayPremium(parsedHistory, now) : null;
  } catch {
    return null;
  }
}

export function selectPremiumDropAlertEvent(
  product: TransitionProduct,
  previousDayPremium: number | null,
  now: Date
): AlertEventSelection | null {
  const metric = product.goldMetrics[0];
  const signal = product.signalSnapshots[0];
  if (
    product.code !== "DOJI_RING_9999" ||
    !metric ||
    !signal ||
    previousDayPremium === null ||
    !Number.isFinite(previousDayPremium) ||
    signal.signal !== "BUY_DCA" ||
    metric.time.getTime() !== signal.time.getTime() ||
    now.getTime() - metric.time.getTime() > FRESH_METRIC_MS
  ) {
    return null;
  }

  const premiumSellPct = Number(metric.premiumSellPct);
  if (!Number.isFinite(premiumSellPct)) return null;
  const level = Math.floor((previousDayPremium - premiumSellPct + 1e-12) / PREMIUM_DROP_STEP);
  if (level < 1) return null;

  return {
    code: product.code,
    name: product.name,
    brand: product.brand,
    sellPrice: Number(metric.domesticSellPriceVnd),
    premiumSellPct,
    premiumPercentile:
      metric.premiumPercentile180d === null ? null : Number(metric.premiumPercentile180d),
    spreadPct: Number(metric.spreadPct),
    score: Number(signal.score),
    transitionTime: metric.time,
    level: "Mua dần",
    reasons: Array.isArray(signal.reasons) ? signal.reasons.map(String).slice(0, 3) : [],
    type: "PREMIUM_DROP",
    episode: level,
    fingerprint: `${product.code}:premium-drop:${vietnamDate(metric.time)}:${level}`
  };
}

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

async function findPendingAlertEvents(prisma: PrismaClient, now: Date, redis?: Redis): Promise<AlertCandidate[]> {
  const products = await prisma.goldProduct.findMany({
    where: { isActive: true },
    include: { goldMetrics: { orderBy: { time: "desc" }, take: 1 }, signalSnapshots: { orderBy: { time: "desc" }, take: 2 } }
  });
  for (const product of products) {
    const previous = await prisma.buyAlertEvent.findFirst({
      where: { productId: product.id, type: { in: ["ENTERED_BUY_DCA", "BUY_DCA_IMPROVED"] } },
      orderBy: { occurredAt: "desc" },
      select: { episode: true, score: true, premiumSellPct: true }
    });
    const selection = selectBuyDcaAlertEvent(product, previous ? { episode: previous.episode, score: Number(previous.score), premiumSellPct: Number(previous.premiumSellPct) } : null);
    let premiumSelection: AlertEventSelection | null = null;
    if (product.code === "DOJI_RING_9999") {
      const snapshotPremium = redis
        ? await loadPreviousTradingDayPremiumFromSnapshot(redis, product.code, now)
        : null;
      const fallbackPremium = snapshotPremium === null
        ? await prisma.goldMetric.findFirst({
            where: { productId: product.id, time: { lt: vietnamStartOfToday(now) } },
            orderBy: { time: "desc" },
            select: { premiumSellPct: true }
          })
        : null;
      premiumSelection = selectPremiumDropAlertEvent(
        product,
        snapshotPremium ?? (fallbackPremium ? Number(fallbackPremium.premiumSellPct) : null),
        now
      );
    }
    for (const event of [selection, premiumSelection]) {
      if (!event) continue;
      await prisma.buyAlertEvent.upsert({
        where: { fingerprint: event.fingerprint },
        update: {},
        create: { productId: product.id, episode: event.episode, type: event.type, fingerprint: event.fingerprint, occurredAt: event.transitionTime, score: event.score, premiumSellPct: event.premiumSellPct, spreadPct: event.spreadPct, sellPriceVnd: event.sellPrice, reasons: event.reasons }
      });
    }
  }
  const events = await prisma.buyAlertEvent.findMany({
    where: { occurredAt: { gte: new Date(now.getTime() - DAY_MS) }, product: { isActive: true } },
    include: { product: { include: { goldMetrics: { orderBy: { time: "desc" }, take: 1 }, signalSnapshots: { orderBy: { time: "desc" }, take: 1 } } } }, orderBy: { occurredAt: "asc" }
  });
  const candidates = events.filter((event) => {
    const metric = event.product.goldMetrics[0];
    const signal = event.product.signalSnapshots[0];
    return metric && signal && signal.signal === "BUY_DCA" && metric.time.getTime() === signal.time.getTime() && now.getTime() - metric.time.getTime() <= 15 * 60 * 1000;
  }).map((event) => ({ eventId: event.id, eventType: event.type, episode: event.episode, code: event.product.code, name: event.product.name, brand: event.product.brand, sellPrice: Number(event.sellPriceVnd), premiumSellPct: Number(event.premiumSellPct), premiumPercentile: null, spreadPct: Number(event.spreadPct), score: Number(event.score), transitionTime: event.occurredAt, level: "Mua dần" as const, reasons: Array.isArray(event.reasons) ? event.reasons.map(String).slice(0, 3) : [] }));
  return deduplicateAlertCandidates(candidates);
}

export function selectBuyDcaAlertEvent(
  product: TransitionProduct,
  baseline: AlertEventBaseline | null
): AlertEventSelection | null {
  const metric = product.goldMetrics[0];
  const currentSignal = product.signalSnapshots[0];
  if (!metric || !currentSignal || currentSignal.signal !== "BUY_DCA" || metric.time.getTime() !== currentSignal.time.getTime()) return null;
  const candidate: AlertCandidate = {
    code: product.code,
    name: product.name,
    brand: product.brand,
    sellPrice: Number(metric.domesticSellPriceVnd),
    premiumSellPct: Number(metric.premiumSellPct),
    premiumPercentile: metric.premiumPercentile180d === null ? null : Number(metric.premiumPercentile180d),
    spreadPct: Number(metric.spreadPct),
    score: Number(currentSignal.score),
    transitionTime: currentSignal.time,
    level: "Mua dần",
    reasons: Array.isArray(currentSignal.reasons) ? currentSignal.reasons.map(String).slice(0, 3) : []
  };

  const isTransition = product.signalSnapshots[1]?.signal !== "BUY_DCA";
  if (!baseline || isTransition) {
    return {
      ...candidate,
      type: "ENTERED_BUY_DCA",
      episode: isTransition ? (baseline?.episode ?? 0) + 1 : baseline?.episode ?? 1,
      fingerprint: `${product.code}:episode:${isTransition ? (baseline?.episode ?? 0) + 1 : baseline?.episode ?? 1}:${isTransition ? candidate.transitionTime.toISOString() : "bootstrap"}`
    };
  }

  if (candidate.score < baseline.score + 3 && candidate.premiumSellPct > baseline.premiumSellPct - 0.005) {
    return null;
  }
  return {
    ...candidate,
    type: "BUY_DCA_IMPROVED",
    episode: baseline.episode,
    fingerprint: `${product.code}:episode:${baseline.episode}:improved:${candidate.transitionTime.toISOString()}`
  };
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
  if (candidates.length === 1 && candidates[0]?.eventType === "PREMIUM_DROP") {
    const drop = (candidates[0].episode ?? 1) * 0.5;
    return `VangScore: DOJI premium giảm ít nhất ${drop.toLocaleString("vi-VN")} điểm %`;
  }
  return candidates.length > 1
    ? `VangScore: ${candidates.length} sản phẩm vừa chuyển sang mua dần`
    : "VangScore: Có sản phẩm vừa chuyển sang mua dần";
}

function buildText(candidates: AlertCandidate[]): string {
  const hasPremiumDrop = candidates.some((candidate) => candidate.eventType === "PREMIUM_DROP");
  const lines = [
    hasPremiumDrop
      ? "VangScore phát hiện premium DOJI giảm so với ngày giao dịch gần nhất và tín hiệu đang là mua dần."
      : "VangScore phát hiện sản phẩm vừa chuyển sang tín hiệu mua dần.",
    "",
    ...candidates.flatMap((candidate, index) => [
      `${index + 1}. ${candidate.name} (${candidate.brand})`,
      `Mức: ${candidate.level}`,
      `Giá bán: ${formatVnd(candidate.sellPrice)}`,
      `Premium: ${formatPercent(candidate.premiumSellPct)}`,
      ...(candidate.eventType === "PREMIUM_DROP"
        ? [`Mức giảm premium: ít nhất ${((candidate.episode ?? 1) * 0.5).toLocaleString("vi-VN")} điểm %`]
        : []),
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
              ${candidate.eventType === "PREMIUM_DROP" ? `<tr><td style="padding:5px 0;color:#94a3b8;">Mức giảm premium</td><td align="right" style="padding:5px 0;">Ít nhất ${((candidate.episode ?? 1) * 0.5).toLocaleString("vi-VN")} điểm %</td></tr>` : ""}
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
                <h1 style="margin:18px 0 10px;color:#ffffff;font-size:24px;line-height:1.25;">${candidates.some((candidate) => candidate.eventType === "PREMIUM_DROP") ? "Premium DOJI đang giảm" : "Có tín hiệu mua dần vàng"}</h1>
                <p style="margin:0;color:#cbd5e1;font-size:15px;line-height:1.7;">${candidates.some((candidate) => candidate.eventType === "PREMIUM_DROP") ? "Premium DOJI giảm so với ngày giao dịch gần nhất, đồng thời tín hiệu vẫn là BUY_DCA (mua dần)." : "Tín hiệu mới nhất vừa chuyển sang BUY_DCA (mua dần)."}</p>
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
