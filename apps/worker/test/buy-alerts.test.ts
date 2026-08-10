import { describe, expect, it } from "vitest";
import {
  canDispatchNotification,
  deduplicateAlertCandidates,
  selectBuyDcaAlertEvent,
  selectBuyDcaTransitions
} from "../src/jobs/buy-alerts.js";

function productWithSignals(current: string, previous: string) {
  const currentTime = new Date("2026-07-24T08:00:00.000Z");
  return {
    code: "DOJI_RING_9999",
    name: "Nhẫn 9999 DOJI",
    brand: "DOJI",
    goldMetrics: [
      {
        time: currentTime,
        domesticSellPriceVnd: 100_000_000,
        premiumSellPct: 0.5,
        premiumPercentile180d: 99,
        spreadPct: 0.2
      }
    ],
    signalSnapshots: [
      {
        time: currentTime,
        signal: current,
        score: 1,
        confidence: 0.01,
        reasons: []
      },
      {
        time: new Date("2026-07-24T07:55:00.000Z"),
        signal: previous,
        score: 99,
        confidence: 0.99,
        reasons: []
      }
    ]
  };
}

describe("selectBuyDcaTransitions", () => {
  it("selects a product solely when its signal transitions to BUY_DCA", () => {
    const candidates = selectBuyDcaTransitions([productWithSignals("BUY_DCA", "HOLD")]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.code).toBe("DOJI_RING_9999");
    expect(candidates[0]?.transitionTime).toEqual(new Date("2026-07-24T08:00:00.000Z"));
  });

  it.each([
    ["BUY_DCA", "BUY_DCA"],
    ["HOLD", "BUY_DCA"],
    ["HOLD", "HOLD"]
  ])("does not select an unchanged or non-buy signal (%s after %s)", (current, previous) => {
    expect(selectBuyDcaTransitions([productWithSignals(current, previous)])).toEqual([]);
  });
});

describe("selectBuyDcaAlertEvent", () => {
  it("creates an entry event for a fresh BUY_DCA transition", () => {
    const event = selectBuyDcaAlertEvent(productWithSignals("BUY_DCA", "HOLD"), null);
    expect(event?.type).toBe("ENTERED_BUY_DCA");
  });

  it("creates one bootstrap event when BUY_DCA has no prior event", () => {
    const event = selectBuyDcaAlertEvent(productWithSignals("BUY_DCA", "BUY_DCA"), null);
    expect(event?.type).toBe("ENTERED_BUY_DCA");
    expect(event?.fingerprint).toContain("bootstrap");
  });

  it("creates an improvement event only after score or premium moves materially", () => {
    const product = productWithSignals("BUY_DCA", "BUY_DCA");
    const baseline = { score: 65, premiumSellPct: 0.51, episode: 1 };
    expect(selectBuyDcaAlertEvent(product, baseline)?.type).toBe("BUY_DCA_IMPROVED");
  });

  it("does not create an improvement event for a small change", () => {
    const product = productWithSignals("BUY_DCA", "BUY_DCA");
    const baseline = { score: 70, premiumSellPct: 0.5, episode: 1 };
    expect(selectBuyDcaAlertEvent(product, baseline)).toBeNull();
  });
});

describe("deduplicateAlertCandidates", () => {
  it("keeps only the newest event for each product", () => {
    const older = selectBuyDcaAlertEvent(productWithSignals("BUY_DCA", "HOLD"), null)!;
    const newer = {
      ...older,
      eventId: "new-event",
      transitionTime: new Date("2026-07-24T09:00:00.000Z")
    };

    expect(deduplicateAlertCandidates([
      { ...older, eventId: "old-event" },
      newer
    ])).toEqual([newer]);
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
