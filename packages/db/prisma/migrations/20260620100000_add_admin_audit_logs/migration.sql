-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "request_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_logs_occurred_at_idx" ON "admin_audit_logs"("occurred_at" DESC);

-- CreateIndex
CREATE INDEX "admin_audit_logs_actor_occurred_at_idx" ON "admin_audit_logs"("actor", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_occurred_at_idx" ON "admin_audit_logs"("action", "occurred_at" DESC);
