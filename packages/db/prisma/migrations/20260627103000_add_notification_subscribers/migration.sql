CREATE TABLE "notification_subscribers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "buy_alert_enabled" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'web',
    "subscribed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribed_at" TIMESTAMPTZ,
    "last_notified_at" TIMESTAMPTZ,
    "notification_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notification_subscribers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_subscribers_email_key" ON "notification_subscribers"("email");
CREATE INDEX "notification_subscribers_status_buy_alert_enabled_idx" ON "notification_subscribers"("status", "buy_alert_enabled");
CREATE INDEX "notification_subscribers_last_notified_at_idx" ON "notification_subscribers"("last_notified_at");
