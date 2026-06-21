# Architecture

VangScore is a read-heavy analytics MVP. Public traffic reads precomputed summaries from Redis, CDN-friendly API
responses, and Next.js pages with short revalidation. External provider calls are isolated in the worker and never run
from public requests.

## Components

- `apps/web`: Next.js App Router UI in Vietnamese. Pages are cache-friendly and consume only the public API.
- `apps/api`: NestJS + Fastify API. Public endpoints set `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.
- `apps/worker`: BullMQ worker for ingestion, validation, metric calculation, signal generation, and Redis cache refresh.
- `packages/domain`: deterministic formulas, shared types, schemas, and signal engine.
- `packages/db`: Prisma schema, migrations, seed data, and shared Prisma client.
- `packages/config`: central environment validation.
- `packages/logger`: Pino logger.

## Scaling Notes

- Latest market summary is cached under `market:summary:latest`.
- Latest product metrics and signals are cached per product.
- History endpoints are range-limited to `7d`, `30d`, `180d`, and `1y`.
- Metrics and signals are precomputed by worker jobs, not computed on public requests.
- TimescaleDB hypertables, materialized views, read replicas, B2B API keys, and rate limits can be added later without
  changing the public contract.
