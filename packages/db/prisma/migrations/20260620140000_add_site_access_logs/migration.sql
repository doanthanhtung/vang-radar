-- CreateTable
CREATE TABLE "site_access_logs" (
    "id" UUID NOT NULL,
    "accessed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT NOT NULL,
    "path" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "site_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_access_logs_accessed_at_idx" ON "site_access_logs"("accessed_at" DESC);

-- CreateIndex
CREATE INDEX "site_access_logs_ip_address_accessed_at_idx" ON "site_access_logs"("ip_address", "accessed_at" DESC);