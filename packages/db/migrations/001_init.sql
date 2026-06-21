-- Initial PostgreSQL schema generated for Prisma migration parity.
-- Future TimescaleDB notes:
--   SELECT create_hypertable('domestic_gold_prices', 'time');
--   SELECT create_hypertable('world_gold_prices', 'time');
--   SELECT create_hypertable('fx_rates', 'time');
--   SELECT create_hypertable('gold_metrics', 'time');
-- Add retention policies and continuous aggregates after production traffic patterns are known.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  base_url text,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gold_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  brand text NOT NULL,
  category text NOT NULL,
  purity text,
  unit text NOT NULL DEFAULT 'luong',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS domestic_gold_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time timestamptz NOT NULL,
  product_id uuid NOT NULL REFERENCES gold_products(id),
  source_id uuid NOT NULL REFERENCES sources(id),
  buy_price_vnd numeric(18, 2) NOT NULL,
  sell_price_vnd numeric(18, 2) NOT NULL,
  unit text NOT NULL DEFAULT 'luong',
  raw_payload jsonb,
  quality_score numeric(5, 2) NOT NULL DEFAULT 100,
  is_valid boolean NOT NULL DEFAULT true,
  invalid_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, source_id, time)
);

CREATE INDEX IF NOT EXISTS domestic_gold_prices_product_time_idx ON domestic_gold_prices(product_id, time DESC);
CREATE INDEX IF NOT EXISTS domestic_gold_prices_source_time_idx ON domestic_gold_prices(source_id, time DESC);
CREATE INDEX IF NOT EXISTS domestic_gold_prices_valid_time_idx ON domestic_gold_prices(is_valid, time DESC);

CREATE TABLE IF NOT EXISTS world_gold_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time timestamptz NOT NULL,
  source_id uuid NOT NULL REFERENCES sources(id),
  symbol text NOT NULL DEFAULT 'XAUUSD',
  price_usd_per_oz numeric(18, 6) NOT NULL,
  bid numeric(18, 6),
  ask numeric(18, 6),
  raw_payload jsonb,
  quality_score numeric(5, 2) NOT NULL DEFAULT 100,
  is_valid boolean NOT NULL DEFAULT true,
  invalid_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id, symbol, time)
);

CREATE INDEX IF NOT EXISTS world_gold_prices_symbol_time_idx ON world_gold_prices(symbol, time DESC);
CREATE INDEX IF NOT EXISTS world_gold_prices_source_time_idx ON world_gold_prices(source_id, time DESC);
CREATE INDEX IF NOT EXISTS world_gold_prices_valid_time_idx ON world_gold_prices(is_valid, time DESC);

CREATE TABLE IF NOT EXISTS fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time timestamptz NOT NULL,
  source_id uuid NOT NULL REFERENCES sources(id),
  pair text NOT NULL DEFAULT 'USDVND',
  rate numeric(18, 6) NOT NULL,
  raw_payload jsonb,
  quality_score numeric(5, 2) NOT NULL DEFAULT 100,
  is_valid boolean NOT NULL DEFAULT true,
  invalid_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id, pair, time)
);

CREATE INDEX IF NOT EXISTS fx_rates_pair_time_idx ON fx_rates(pair, time DESC);
CREATE INDEX IF NOT EXISTS fx_rates_source_time_idx ON fx_rates(source_id, time DESC);
CREATE INDEX IF NOT EXISTS fx_rates_valid_time_idx ON fx_rates(is_valid, time DESC);

CREATE TABLE IF NOT EXISTS gold_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time timestamptz NOT NULL,
  product_id uuid NOT NULL REFERENCES gold_products(id),
  domestic_buy_price_vnd numeric(18, 2) NOT NULL,
  domestic_sell_price_vnd numeric(18, 2) NOT NULL,
  xau_usd_per_oz numeric(18, 6) NOT NULL,
  usd_vnd numeric(18, 6) NOT NULL,
  world_vnd_per_luong numeric(18, 2) NOT NULL,
  premium_buy_pct numeric(12, 8) NOT NULL,
  premium_sell_pct numeric(12, 8) NOT NULL,
  spread_abs_vnd numeric(18, 2) NOT NULL,
  spread_pct numeric(12, 8) NOT NULL,
  premium_percentile_180d numeric(8, 4),
  spread_percentile_180d numeric(8, 4),
  xau_momentum_7d numeric(12, 8),
  xau_momentum_30d numeric(12, 8),
  domestic_momentum_7d numeric(12, 8),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, time)
);

CREATE INDEX IF NOT EXISTS gold_metrics_product_time_idx ON gold_metrics(product_id, time DESC);

CREATE TABLE IF NOT EXISTS signal_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time timestamptz NOT NULL,
  product_id uuid NOT NULL REFERENCES gold_products(id),
  signal text NOT NULL,
  score numeric(8, 4) NOT NULL,
  confidence numeric(8, 4) NOT NULL,
  reasons jsonb NOT NULL,
  metrics jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, time)
);

CREATE INDEX IF NOT EXISTS signal_snapshots_product_time_idx ON signal_snapshots(product_id, time DESC);
CREATE INDEX IF NOT EXISTS signal_snapshots_signal_time_idx ON signal_snapshots(signal, time DESC);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portfolio_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  product_id uuid NOT NULL REFERENCES gold_products(id),
  type text NOT NULL,
  quantity_luong numeric(18, 6) NOT NULL,
  price_vnd_per_luong numeric(18, 2) NOT NULL,
  fee_vnd numeric(18, 2) NOT NULL DEFAULT 0,
  transaction_date date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portfolio_transactions_user_date_idx ON portfolio_transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS portfolio_transactions_product_date_idx ON portfolio_transactions(product_id, transaction_date DESC);
