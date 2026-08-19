CREATE TABLE "buy_alert_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "episode" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "score" DECIMAL(8,4) NOT NULL,
    "premium_sell_pct" DECIMAL(12,8) NOT NULL,
    "spread_pct" DECIMAL(12,8) NOT NULL,
    "sell_price_vnd" DECIMAL(18,2) NOT NULL,
    "reasons" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "buy_alert_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "buy_alert_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "gold_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "buy_alert_events_fingerprint_key" ON "buy_alert_events"("fingerprint");
CREATE INDEX "buy_alert_events_product_id_occurred_at_idx" ON "buy_alert_events"("product_id", "occurred_at" DESC);

CREATE TABLE "buy_alert_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "subscriber_id" UUID NOT NULL,
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "buy_alert_deliveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "buy_alert_deliveries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "buy_alert_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "buy_alert_deliveries_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "notification_subscribers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "buy_alert_deliveries_event_id_subscriber_id_key" ON "buy_alert_deliveries"("event_id", "subscriber_id");
CREATE INDEX "buy_alert_deliveries_subscriber_id_sent_at_idx" ON "buy_alert_deliveries"("subscriber_id", "sent_at" DESC);
