-- AlterTable
ALTER TABLE "site_access_logs"
ADD COLUMN "method" TEXT,
ADD COLUMN "accept_language" TEXT,
ADD COLUMN "referer" TEXT,
ADD COLUMN "country" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "is_bot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "bot_reason" TEXT;

-- CreateTable
CREATE TABLE "bot_access_logs" (
    "id" UUID NOT NULL,
    "accessed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "ip_address" TEXT NOT NULL,
    "path" TEXT,
    "method" TEXT,
    "user_agent" TEXT,
    "accept_language" TEXT,
    "referer" TEXT,
    "country" TEXT,
    "city" TEXT,
    "bot_reason" TEXT NOT NULL,

    CONSTRAINT "bot_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_access_logs_is_bot_accessed_at_idx" ON "site_access_logs"("is_bot", "accessed_at" DESC);

-- CreateIndex
CREATE INDEX "bot_access_logs_accessed_at_idx" ON "bot_access_logs"("accessed_at" DESC);

-- CreateIndex
CREATE INDEX "bot_access_logs_expires_at_idx" ON "bot_access_logs"("expires_at" ASC);

-- CreateIndex
CREATE INDEX "bot_access_logs_ip_address_accessed_at_idx" ON "bot_access_logs"("ip_address", "accessed_at" DESC);