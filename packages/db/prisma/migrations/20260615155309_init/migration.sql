-- CreateTable
CREATE TABLE "sources" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "base_url" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gold_products" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "purity" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'luong',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gold_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domestic_gold_prices" (
    "id" UUID NOT NULL,
    "time" TIMESTAMPTZ NOT NULL,
    "product_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "buy_price_vnd" DECIMAL(18,2) NOT NULL,
    "sell_price_vnd" DECIMAL(18,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'luong',
    "raw_payload" JSONB,
    "quality_score" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "invalid_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domestic_gold_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "world_gold_prices" (
    "id" UUID NOT NULL,
    "time" TIMESTAMPTZ NOT NULL,
    "source_id" UUID NOT NULL,
    "symbol" TEXT NOT NULL DEFAULT 'XAUUSD',
    "price_usd_per_oz" DECIMAL(18,6) NOT NULL,
    "bid" DECIMAL(18,6),
    "ask" DECIMAL(18,6),
    "raw_payload" JSONB,
    "quality_score" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "invalid_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "world_gold_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_rates" (
    "id" UUID NOT NULL,
    "time" TIMESTAMPTZ NOT NULL,
    "source_id" UUID NOT NULL,
    "pair" TEXT NOT NULL DEFAULT 'USDVND',
    "rate" DECIMAL(18,6) NOT NULL,
    "raw_payload" JSONB,
    "quality_score" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "invalid_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gold_metrics" (
    "id" UUID NOT NULL,
    "time" TIMESTAMPTZ NOT NULL,
    "product_id" UUID NOT NULL,
    "domestic_buy_price_vnd" DECIMAL(18,2) NOT NULL,
    "domestic_sell_price_vnd" DECIMAL(18,2) NOT NULL,
    "xau_usd_per_oz" DECIMAL(18,6) NOT NULL,
    "usd_vnd" DECIMAL(18,6) NOT NULL,
    "world_vnd_per_luong" DECIMAL(18,2) NOT NULL,
    "premium_buy_pct" DECIMAL(12,8) NOT NULL,
    "premium_sell_pct" DECIMAL(12,8) NOT NULL,
    "spread_abs_vnd" DECIMAL(18,2) NOT NULL,
    "spread_pct" DECIMAL(12,8) NOT NULL,
    "friction_pct" DECIMAL(12,8) NOT NULL,
    "premium_percentile_180d" DECIMAL(8,4),
    "spread_percentile_180d" DECIMAL(8,4),
    "xau_momentum_7d" DECIMAL(12,8),
    "xau_momentum_30d" DECIMAL(12,8),
    "domestic_momentum_7d" DECIMAL(12,8),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gold_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signal_snapshots" (
    "id" UUID NOT NULL,
    "time" TIMESTAMPTZ NOT NULL,
    "product_id" UUID NOT NULL,
    "signal" TEXT NOT NULL,
    "score" DECIMAL(8,4) NOT NULL,
    "confidence" DECIMAL(8,4) NOT NULL,
    "reasons" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signal_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "quantity_luong" DECIMAL(18,6) NOT NULL,
    "price_vnd_per_luong" DECIMAL(18,2) NOT NULL,
    "fee_vnd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "transaction_date" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sources_code_key" ON "sources"("code");

-- CreateIndex
CREATE UNIQUE INDEX "gold_products_code_key" ON "gold_products"("code");

-- CreateIndex
CREATE INDEX "domestic_gold_prices_product_id_time_idx" ON "domestic_gold_prices"("product_id", "time" DESC);

-- CreateIndex
CREATE INDEX "domestic_gold_prices_source_id_time_idx" ON "domestic_gold_prices"("source_id", "time" DESC);

-- CreateIndex
CREATE INDEX "domestic_gold_prices_is_valid_time_idx" ON "domestic_gold_prices"("is_valid", "time" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "domestic_gold_prices_product_id_source_id_time_key" ON "domestic_gold_prices"("product_id", "source_id", "time");

-- CreateIndex
CREATE INDEX "world_gold_prices_symbol_time_idx" ON "world_gold_prices"("symbol", "time" DESC);

-- CreateIndex
CREATE INDEX "world_gold_prices_source_id_time_idx" ON "world_gold_prices"("source_id", "time" DESC);

-- CreateIndex
CREATE INDEX "world_gold_prices_is_valid_time_idx" ON "world_gold_prices"("is_valid", "time" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "world_gold_prices_source_id_symbol_time_key" ON "world_gold_prices"("source_id", "symbol", "time");

-- CreateIndex
CREATE INDEX "fx_rates_pair_time_idx" ON "fx_rates"("pair", "time" DESC);

-- CreateIndex
CREATE INDEX "fx_rates_source_id_time_idx" ON "fx_rates"("source_id", "time" DESC);

-- CreateIndex
CREATE INDEX "fx_rates_is_valid_time_idx" ON "fx_rates"("is_valid", "time" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "fx_rates_source_id_pair_time_key" ON "fx_rates"("source_id", "pair", "time");

-- CreateIndex
CREATE INDEX "gold_metrics_product_id_time_idx" ON "gold_metrics"("product_id", "time" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "gold_metrics_product_id_time_key" ON "gold_metrics"("product_id", "time");

-- CreateIndex
CREATE INDEX "signal_snapshots_product_id_time_idx" ON "signal_snapshots"("product_id", "time" DESC);

-- CreateIndex
CREATE INDEX "signal_snapshots_signal_time_idx" ON "signal_snapshots"("signal", "time" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "signal_snapshots_product_id_time_key" ON "signal_snapshots"("product_id", "time");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "portfolio_transactions_user_id_transaction_date_idx" ON "portfolio_transactions"("user_id", "transaction_date" DESC);

-- CreateIndex
CREATE INDEX "portfolio_transactions_product_id_transaction_date_idx" ON "portfolio_transactions"("product_id", "transaction_date" DESC);

-- AddForeignKey
ALTER TABLE "domestic_gold_prices" ADD CONSTRAINT "domestic_gold_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "gold_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domestic_gold_prices" ADD CONSTRAINT "domestic_gold_prices_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "world_gold_prices" ADD CONSTRAINT "world_gold_prices_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold_metrics" ADD CONSTRAINT "gold_metrics_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "gold_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal_snapshots" ADD CONSTRAINT "signal_snapshots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "gold_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_transactions" ADD CONSTRAINT "portfolio_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_transactions" ADD CONSTRAINT "portfolio_transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "gold_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
