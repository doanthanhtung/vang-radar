import { describe, expect, it } from "vitest";
import { refreshAndSendBuyAlerts } from "../src/jobs/market-pipeline.js";
import { scheduleJobs } from "../src/queues/register.js";

describe("refreshAndSendBuyAlerts", () => {
  it("sends alerts only after a snapshot has been published", async () => {
    const calls: string[] = [];
    const refresh = async () => {
      calls.push("refresh");
      return "snapshot-1";
    };
    const send = async (_prisma: unknown, _redis: unknown, snapshotId?: string) => {
      calls.push(`send:${snapshotId ?? "missing"}`);
      return { sent: 1 };
    };

    await refreshAndSendBuyAlerts({} as never, {} as never, refresh, send);

    expect(calls).toEqual(["refresh", "send:snapshot-1"]);
  });

  it("does not check alerts when snapshot publishing fails", async () => {
    const sendCalls: unknown[] = [];
    const refresh = async () => null;
    const send = async (...args: unknown[]) => {
      sendCalls.push(args);
      return { sent: 1 };
    };

    await refreshAndSendBuyAlerts({} as never, {} as never, refresh, send);

    expect(sendCalls).toHaveLength(0);
  });

  it("removes the legacy standalone alert schedule", async () => {
    const removed: unknown[] = [];
    const added: unknown[] = [];
    const queues = [
      {
        name: "send-buy-alerts",
        removeRepeatable: async (...args: unknown[]) => {
          removed.push(args);
          return true;
        }
      },
      {
        name: "refresh-market-summary-cache",
        add: async (...args: unknown[]) => {
          added.push(args);
          return {};
        }
      }
    ];

    await scheduleJobs(queues as never);

    expect(removed).toEqual([["scheduled", { pattern: "2-57/5 * * * *" }, "send-buy-alerts"]]);
    expect(added).toHaveLength(1);
  });
});
