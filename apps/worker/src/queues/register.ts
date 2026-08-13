import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import type { PrismaClient } from "@prisma/client";
import { loadConfig } from "@vang-radar/config";
import { calculateLatestMetrics } from "../calculators/metrics.js";
import { sendBuyAlerts } from "../jobs/buy-alerts.js";
import { refreshAndSendBuyAlerts } from "../jobs/market-pipeline.js";
import {
  fetchDomesticGold,
  fetchFx,
  fetchMacroIndicators,
  fetchWorldGold
} from "../jobs/ingestion.js";
import { generateLatestSignals } from "../signal-engine/generate-signals.js";

export function registerQueues(prisma: PrismaClient) {
  const config = loadConfig();
  const redisUrl = new URL(config.REDIS_URL);
  const connection = {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    maxRetriesPerRequest: null
  };
  const cacheClient = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const queueNames = [
    "fetch-domestic-gold",
    "fetch-world-gold",
    "fetch-fx",
    "fetch-macro-indicators",
    "calculate-metrics",
    "generate-signals",
    "send-buy-alerts",
    "refresh-market-summary-cache"
  ];
  const queues = queueNames.map((name) => new Queue(name, { connection }));

  const handlers: Record<string, () => Promise<unknown>> = {
    "fetch-domestic-gold": () => fetchDomesticGold(prisma),
    "fetch-world-gold": () => fetchWorldGold(prisma),
    "fetch-fx": () => fetchFx(prisma),
    "fetch-macro-indicators": () => fetchMacroIndicators(prisma),
    "calculate-metrics": () => calculateLatestMetrics(prisma, cacheClient),
    "generate-signals": () => generateLatestSignals(prisma),
    "send-buy-alerts": () => sendBuyAlerts(prisma, cacheClient),
    "refresh-market-summary-cache": () => refreshAndSendBuyAlerts(prisma, cacheClient)
  };

  const workers = queueNames.map(
    (name) =>
      new Worker(name, handlers[name] ?? (() => Promise.resolve()), {
        connection,
        concurrency: config.WORKER_CONCURRENCY
      })
  );

  return { connection: cacheClient, queues, workers };
}

export async function scheduleJobs(queues: Queue[]) {
  const byName = Object.fromEntries(queues.map((queue) => [queue.name, queue]));
  await byName["send-buy-alerts"]?.removeRepeatable(
    "scheduled",
    { pattern: "2-57/5 * * * *" },
    "send-buy-alerts"
  );
  await byName["refresh-market-summary-cache"]?.add(
    "scheduled",
    {},
    { repeat: { pattern: "*/5 * * * *" }, jobId: "refresh-market-summary-cache" }
  );
}
