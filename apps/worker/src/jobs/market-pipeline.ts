import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import { calculateLatestMetrics } from "../calculators/metrics.js";
import { generateLatestSignals } from "../signal-engine/generate-signals.js";
import { fetchDomesticGold, fetchFx, fetchMacroIndicators, fetchWorldGold } from "./ingestion.js";
import { publishMarketSnapshot } from "./market-snapshot.js";

export async function refreshMarketSnapshot(prisma: PrismaClient, redis: Redis) {
  await fetchWorldGold(prisma);
  await fetchFx(prisma);
  await fetchMacroIndicators(prisma);
  await fetchDomesticGold(prisma);
  await calculateLatestMetrics(prisma, redis);
  await generateLatestSignals(prisma);
  return publishMarketSnapshot(prisma, redis);
}
