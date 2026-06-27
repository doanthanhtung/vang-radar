import { prisma } from "@vang-radar/db";
import { createLogger } from "@vang-radar/logger";
import { calculateLatestMetrics } from "./calculators/metrics.js";
import {
  fetchDomesticGold,
  fetchFx,
  fetchMacroIndicators,
  fetchWorldGold
} from "./jobs/ingestion.js";
import { sendBuyAlerts } from "./jobs/buy-alerts.js";
import { registerQueues, scheduleJobs } from "./queues/register.js";
import { generateLatestSignals } from "./signal-engine/generate-signals.js";

const logger = createLogger("vang-radar-worker");

export async function runOnce() {
  await fetchWorldGold(prisma);
  await fetchFx(prisma);
  await fetchMacroIndicators(prisma);
  await fetchDomesticGold(prisma);
  await calculateLatestMetrics(prisma);
  await generateLatestSignals(prisma);
  await sendBuyAlerts(prisma);
}

async function main() {
  const { queues } = registerQueues(prisma);
  await scheduleJobs(queues);
  await runOnce();
  logger.info("Worker started and scheduled ingestion jobs");
}

void main().catch((error) => {
  logger.error({ error }, "Worker failed");
  process.exit(1);
});
