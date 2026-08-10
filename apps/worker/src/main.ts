import { prisma } from "@vang-radar/db";
import { createLogger } from "@vang-radar/logger";
import type { Redis } from "ioredis";
import { sendBuyAlerts } from "./jobs/buy-alerts.js";
import { refreshMarketSnapshot } from "./jobs/market-pipeline.js";
import { registerQueues, scheduleJobs } from "./queues/register.js";

const logger = createLogger("vang-radar-worker");

export async function runOnce(redis: Redis) {
  await refreshMarketSnapshot(prisma, redis);
  await sendBuyAlerts(prisma, redis);
}

async function main() {
  const { queues, connection } = registerQueues(prisma);
  await scheduleJobs(queues);
  await runOnce(connection);
  logger.info("Worker started and scheduled ingestion jobs");
}

void main().catch((error) => {
  logger.error({ error }, "Worker failed");
  process.exit(1);
});
