import { describe, expect, it } from "vitest";
import {
  detectBot,
  getClientIp,
  getCloudflareGeo,
  hasBrowserUserAgent,
  isStaticAsset,
  isValidVisitorPath,
  shouldTrackVisitor
} from "../src/visitor-tracking/index.js";

const HUMAN_CONTEXT = {
  ipAddress: "42.114.15.225",
  path: "/",
  method: "GET",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  acceptLanguage: "vi-VN,vi;q=0.9,en-US;q=0.8"
};

describe("isStaticAsset", () => {
  it("skips framework and static files", () => {
    expect(isStaticAsset("/_next/static/chunk.js")).toBe(true);
    expect(isStaticAsset("/favicon.ico")).toBe(true);
    expect(isStaticAsset("/robots.txt")).toBe(true);
    expect(isStaticAsset("/dashboard-gold.png")).toBe(true);
    expect(isStaticAsset("/")).toBe(false);
  });
});

describe("getClientIp", () => {
  it("prefers Cloudflare connecting IP", () => {
    expect(
      getClientIp({
        "cf-connecting-ip": "42.114.15.225",
        "x-forwarded-for": "1.2.3.4"
      })
    ).toBe("42.114.15.225");
  });
});

describe("getCloudflareGeo", () => {
  it("reads country and city headers when present", () => {
    expect(
      getCloudflareGeo({
        "cf-ipcountry": "VN",
        "cf-ipcity": "Hanoi"
      })
    ).toEqual({ country: "VN", city: "Hanoi" });
  });
});

describe("detectBot", () => {
  it("accepts real browser traffic on valid paths", () => {
    expect(detectBot(HUMAN_CONTEXT)).toEqual({ isBot: false, botReason: null });
    expect(isValidVisitorPath("/gold/SJC_BAR")).toBe(true);
    expect(hasBrowserUserAgent(HUMAN_CONTEXT.userAgent)).toBe(true);
  });

  it("rejects scanner paths and bot user agents", () => {
    expect(detectBot({ ...HUMAN_CONTEXT, path: "/credentials" })).toEqual({
      isBot: true,
      botReason: "scanner_path"
    });
    expect(
      detectBot({
        ...HUMAN_CONTEXT,
        userAgent: "python-requests/2.31.0"
      })
    ).toEqual({
      isBot: true,
      botReason: "bot_user_agent"
    });
  });

  it("rejects datacenter traffic without browser signals", () => {
    expect(
      detectBot({
        ipAddress: "3.80.164.232",
        path: "/",
        method: "GET",
        userAgent: "Mozilla/5.0",
        acceptLanguage: null
      })
    ).toEqual({
      isBot: true,
      botReason: "datacenter_without_human_signals"
    });
  });
});

describe("shouldTrackVisitor", () => {
  it("requires ip and path", () => {
    expect(shouldTrackVisitor({ path: "/", ipAddress: "8.8.8.8" })).toBe(true);
    expect(shouldTrackVisitor({ path: "/" })).toBe(false);
  });
});