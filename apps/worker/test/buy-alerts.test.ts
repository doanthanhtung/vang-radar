import { describe, expect, it } from "vitest";
import {
  canDispatchNotification,
  deduplicateAlertCandidates,
  findPreviousTradingDayPremium,
  isUnlimitedAlertRecipient,
  loadPreviousTradingDayPremiumFromSnapshot,
  selectPremiumDropAlertEvent,
  selectTemporaryAlertRecipients,
} from "../src/jobs/buy-alerts.js";

describe("deduplicateAlertCandidates", () => {
  it("keeps distinct premium-drop levels for the same product", () => {
    const first = {
      eventId: "premium-level-1",
      eventType: "PREMIUM_DROP",
      episode: 1,
      code: "DOJI_RING_9999",
      name: "Nhẫn 9999 DOJI",
      brand: "DOJI",
      sellPrice: 100_000_000,
      premiumSellPct: 0.098,
      premiumPercentile: 10,
      spreadPct: 0.02,
      score: 72,
      level: "Premium giảm" as const,
      reasons: [],
      transitionTime: new Date("2026-07-24T08:00:00.000Z")
    };
    const second = {
      ...first,
      eventId: "premium-level-2",
      episode: 2,
      transitionTime: new Date("2026-07-24T09:00:00.000Z")
    };

    expect(deduplicateAlertCandidates([first, second])).toEqual([first, second]);
  });
});

describe("canDispatchNotification", () => {
  const now = new Date("2026-08-08T12:00:00.000Z");

  it("allows the first and second email when they are at least eight hours apart", () => {
    expect(canDispatchNotification([], now)).toBe(true);
    expect(canDispatchNotification([new Date("2026-08-07T12:00:00.000Z")], now)).toBe(true);
  });

  it("blocks a third email inside the trailing 24-hour window", () => {
    expect(
      canDispatchNotification(
        [new Date("2026-08-08T01:00:00.000Z"), new Date("2026-08-07T13:00:00.000Z")],
        now
      )
    ).toBe(false);
  });
});

describe("isUnlimitedAlertRecipient", () => {
  it("matches the temporary unlimited recipient case-insensitively", () => {
    expect(isUnlimitedAlertRecipient("doanthanhtung.pc@gmail.com")).toBe(true);
    expect(isUnlimitedAlertRecipient(" DOANTHANHTUNG.PC@GMAIL.COM ")).toBe(true);
  });

  it("does not bypass limits for other recipients", () => {
    expect(isUnlimitedAlertRecipient("other@example.com")).toBe(false);
  });
});

describe("selectTemporaryAlertRecipients", () => {
  it("keeps only the temporary notify test email", () => {
    expect(
      selectTemporaryAlertRecipients([
        { id: "test-recipient", email: "doanthanhtung.pc@gmail.com", unsubscribeVersion: 1 },
        { id: "other-recipient", email: "other@example.com", unsubscribeVersion: 1 }
      ])
    ).toEqual([
      { id: "test-recipient", email: "doanthanhtung.pc@gmail.com", unsubscribeVersion: 1 }
    ]);
  });

  it("does not select a different email even when it is active", () => {
    expect(
      selectTemporaryAlertRecipients([
        { id: "other-recipient", email: "other@example.com", unsubscribeVersion: 1 }
      ])
    ).toEqual([]);
  });
});

describe("findPreviousTradingDayPremium", () => {
  it("uses the final available Vietnam-day premium before today", () => {
    expect(
      findPreviousTradingDayPremium(
        [
          { time: "2026-08-06T16:50:00.000Z", premiumSellPct: 0.11 },
          { time: "2026-08-06T16:59:00.000Z", premiumSellPct: 0.105 },
          { time: "2026-08-08T01:00:00.000Z", premiumSellPct: 0.09 }
        ],
        new Date("2026-08-08T06:00:00.000Z")
      )
    ).toBe(0.105);
  });
});

describe("loadPreviousTradingDayPremiumFromSnapshot", () => {
  it("reads the prior trading-day premium from the existing snapshot history", async () => {
    const values = new Map([
      ["market:snapshot:current", JSON.stringify({ snapshotId: "snapshot-1" })],
      [
        "market:snapshot:snapshot-1:product:DOJI_RING_9999:metrics:history:1y",
        JSON.stringify([
          { time: "2026-08-06T16:59:00.000Z", premiumSellPct: 0.105 },
          { time: "2026-08-08T01:00:00.000Z", premiumSellPct: 0.09 }
        ])
      ]
    ]);
    const redis = { get: async (key: string) => values.get(key) ?? null };

    await expect(
      loadPreviousTradingDayPremiumFromSnapshot(
        redis,
        "DOJI_RING_9999",
        new Date("2026-08-08T06:00:00.000Z")
      )
    ).resolves.toBe(0.105);
  });
});

describe("selectPremiumDropAlertEvent", () => {
  const now = new Date("2026-08-08T06:00:00.000Z");
  const product = {
    code: "DOJI_RING_9999",
    name: "Nhẫn 9999 DOJI",
    brand: "DOJI",
    goldMetrics: [
      {
        time: now,
        domesticSellPriceVnd: 100_000_000,
        premiumSellPct: 0.098,
        premiumPercentile180d: 10,
        spreadPct: 0.02
      }
    ],
    signalSnapshots: [{ time: now, signal: "BUY_DCA", score: 72, reasons: ["Premium giảm"] }]
  };

  it("creates the first alert when premium falls by at least 0.5 percentage points", () => {
    const event = selectPremiumDropAlertEvent(product, 0.104, now);

    expect(event).toMatchObject({
      type: "PREMIUM_DROP",
      level: "Premium giảm",
      episode: 1,
      fingerprint: "DOJI_RING_9999:premium-drop:2026-08-08:1"
    });
  });

  it("does not alert when the current signal is not BUY_DCA", () => {
    const event = selectPremiumDropAlertEvent(
      {
        ...product,
        signalSnapshots: [{ time: now, signal: "HOLD", score: 72, reasons: ["Premium giảm"] }]
      },
      0.104,
      now
    );

    expect(event).toBeNull();
  });

  it("does not alert below the 0.5 percentage-point threshold", () => {
    expect(selectPremiumDropAlertEvent(product, 0.1029, now)).toBeNull();
  });

  it("creates a higher alert level for each additional 0.5 percentage-point drop", () => {
    const event = selectPremiumDropAlertEvent(product, 0.109, now);

    expect(event).toMatchObject({ type: "PREMIUM_DROP", episode: 2 });
  });
});
