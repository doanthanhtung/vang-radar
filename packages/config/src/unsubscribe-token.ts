import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

export type UnsubscribeTokenInput = {
  subscriberId: string;
  version: number;
  secret: string;
  now?: Date;
  expiresInMs?: number;
};

export function createUnsubscribeToken({
  subscriberId,
  version,
  secret,
  now = new Date(),
  expiresInMs = DEFAULT_EXPIRY_MS
}: UnsubscribeTokenInput): string {
  const payload = Buffer.from(
    JSON.stringify({ subscriberId, version, expiresAt: now.getTime() + expiresInMs })
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyUnsubscribeToken(
  token: string,
  secret: string,
  now = new Date()
): { subscriberId: string; version: number } | null {
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length > 0 || !safeEqual(signature, sign(payload, secret))) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      subscriberId?: unknown;
      version?: unknown;
      expiresAt?: unknown;
    };
    if (
      typeof decoded.subscriberId !== "string" ||
      typeof decoded.version !== "number" ||
      !Number.isInteger(decoded.version) ||
      typeof decoded.expiresAt !== "number" ||
      decoded.expiresAt <= now.getTime()
    ) {
      return null;
    }
    return { subscriberId: decoded.subscriberId, version: decoded.version };
  } catch {
    return null;
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
