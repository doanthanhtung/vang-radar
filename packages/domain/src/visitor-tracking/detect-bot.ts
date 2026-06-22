import { isLikelyDatacenterIp } from "./datacenter-ip.js";
import type { BotDetectionResult, VisitorRequestContext } from "./types.js";

const BOT_UA_PATTERN =
  /bot|crawler|spider|scan|curl|wget|python|go-http-client|httpclient|okhttp|headless|selenium|playwright/i;

const BROWSER_UA_PATTERN = /(?:chrome|crios|chromium|safari|firefox|fxios|edg|edge|opr|opera)/i;

const SCANNER_PATHS = [
  "/credentials",
  "/.env",
  "/wp-admin",
  "/wp-login.php",
  "/phpmyadmin",
  "/adminer",
  "/config",
  "/server-status",
  "/actuator",
  "/.git",
  "/login"
];

const SUSPICIOUS_EXTENSIONS = /\.(env|php|bak|sql|zip|tar|gz|asp|aspx|jsp)$/i;

const ALLOWED_METHODS = new Set(["GET", "POST", "HEAD"]);

export function hasBrowserUserAgent(userAgent: string | null | undefined): boolean {
  const ua = userAgent?.trim();
  if (!ua) return false;
  if (BOT_UA_PATTERN.test(ua)) return false;
  return BROWSER_UA_PATTERN.test(ua);
}

export function hasHumanSignals(context: VisitorRequestContext): boolean {
  return hasBrowserUserAgent(context.userAgent) && Boolean(context.acceptLanguage?.trim());
}

export function isValidVisitorPath(path: string): boolean {
  const normalized = normalizePath(path);
  if (normalized === "/") return true;
  if (normalized === "/gia-vang" || normalized.startsWith("/gia-vang/")) return true;
  if (normalized.startsWith("/gold/")) return true;
  if (normalized === "/admin" || normalized.startsWith("/admin/")) return true;
  return false;
}

/** Classify a request as bot or human using request metadata only. */
export function detectBot(context: VisitorRequestContext): BotDetectionResult {
  const path = normalizePath(context.path);
  const method = (context.method ?? "GET").toUpperCase();
  const userAgent = context.userAgent?.trim() ?? "";

  if (!ALLOWED_METHODS.has(method)) {
    return bot("unsupported_method");
  }

  if (SCANNER_PATHS.some((scannerPath) => matchesScannerPath(path, scannerPath))) {
    return bot("scanner_path");
  }

  if (SUSPICIOUS_EXTENSIONS.test(path)) {
    return bot("suspicious_extension");
  }

  if (!userAgent) {
    return bot("empty_user_agent");
  }

  if (BOT_UA_PATTERN.test(userAgent)) {
    return bot("bot_user_agent");
  }

  const humanSignals = hasHumanSignals(context);

  if (!humanSignals && !isValidVisitorPath(path)) {
    return bot("unknown_path_without_human_signals");
  }

  // Datacenter IPs without browser/language signals are usually scanners, not readers.
  if (context.ipAddress && isLikelyDatacenterIp(context.ipAddress) && !humanSignals) {
    return bot("datacenter_without_human_signals");
  }

  if (!humanSignals && isValidVisitorPath(path)) {
    return bot("missing_human_signals");
  }

  return { isBot: false, botReason: null };
}

export function shouldTrackVisitor(context: VisitorRequestContext): boolean {
  return Boolean(context.ipAddress?.trim()) && Boolean(context.path?.trim());
}

function matchesScannerPath(path: string, scannerPath: string): boolean {
  if (scannerPath.endsWith("/")) return path.startsWith(scannerPath);
  return path === scannerPath || path.startsWith(`${scannerPath}/`);
}

function normalizePath(path: string): string {
  const withoutQuery = path.split("?")[0]?.split("#")[0] ?? path;
  if (!withoutQuery) return "/";
  return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
}

function bot(reason: string): BotDetectionResult {
  return { isBot: true, botReason: reason };
}