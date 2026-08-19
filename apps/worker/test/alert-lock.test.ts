import { describe, expect, it } from "vitest";
import { acquireAlertLock, releaseAlertLock } from "../src/jobs/alert-lock.js";

function createRedis() {
  let value: string | null = null;

  return {
    async set(_key: string, nextValue: string, ...args: string[]) {
      if (args.includes("NX") && value !== null) return null;
      value = nextValue;
      return "OK";
    },
    async eval(_script: string, _keyCount: number, _key: string, token: string) {
      if (value !== token) return 0;
      value = null;
      return 1;
    }
  };
}

describe("buy alert lock", () => {
  it("allows one sender at a time and releases ownership safely", async () => {
    const redis = createRedis();

    expect(await acquireAlertLock(redis as never, "token-a", 60_000)).toBe(true);
    expect(await acquireAlertLock(redis as never, "token-b", 60_000)).toBe(false);
    await releaseAlertLock(redis as never, "token-b");
    expect(await acquireAlertLock(redis as never, "token-b", 60_000)).toBe(false);
    await releaseAlertLock(redis as never, "token-a");
    expect(await acquireAlertLock(redis as never, "token-b", 60_000)).toBe(true);
  });
});
