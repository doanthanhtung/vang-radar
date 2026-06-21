import { PrismaClient } from "@prisma/client";

declare global {
  var vangRadarPrisma: PrismaClient | undefined;
}

export const prisma = globalThis.vangRadarPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.vangRadarPrisma = prisma;
}

export * from "@prisma/client";
