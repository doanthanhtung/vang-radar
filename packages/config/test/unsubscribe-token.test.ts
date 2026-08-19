import { describe, expect, it } from "vitest";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "../src/unsubscribe-token.js";

const secret = "test-unsubscribe-secret-that-is-long-enough";

describe("unsubscribe tokens", () => {
  it("verifies a signed token for the subscriber and version it was issued for", () => {
    const token = createUnsubscribeToken({
      subscriberId: "1d7eeb93-c6b0-41f7-bda8-81347b9f8c34",
      version: 3,
      secret,
      now: new Date("2026-08-08T00:00:00.000Z")
    });

    expect(verifyUnsubscribeToken(token, secret, new Date("2026-08-09T00:00:00.000Z"))).toEqual({
      subscriberId: "1d7eeb93-c6b0-41f7-bda8-81347b9f8c34",
      version: 3
    });
  });

  it("rejects a token whose signature or expiry is invalid", () => {
    const token = createUnsubscribeToken({
      subscriberId: "1d7eeb93-c6b0-41f7-bda8-81347b9f8c34",
      version: 1,
      secret,
      now: new Date("2026-08-08T00:00:00.000Z"),
      expiresInMs: 1_000
    });

    expect(verifyUnsubscribeToken(`${token}x`, secret, new Date("2026-08-08T00:00:00.500Z"))).toBeNull();
    expect(verifyUnsubscribeToken(token, secret, new Date("2026-08-08T00:00:01.001Z"))).toBeNull();
  });
});
