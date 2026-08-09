# VangScore

VangScore is a Vietnamese gold-market intelligence platform. It combines domestic gold prices, world gold prices, USD/VND exchange rates, market metrics, and transparent signal explanations in one dashboard.

> **Disclaimer:** VangScore provides information for reference only. It is not an investment recommendation, trading platform, broker, or custodian. It does not buy or sell gold, hold user funds, or guarantee returns. Users are responsible for their own financial decisions.

## Product overview

VangScore helps users:

- Compare domestic gold prices with international reference prices.
- Monitor premium, spread, momentum, and data freshness.
- Understand market signals such as `BUY_DCA`, `HOLD`, and `AVOID` through explainable reasons.
- Review product-level metric history and price history.
- Subscribe to gold-sale alerts by email with rate limiting and Gmail one-click unsubscribe support.

The public website reads a Redis-backed market snapshot for fast responses. PostgreSQL remains the source of record for historical data, calculations, subscribers, and operational records.

## Key principles

- **Redis-first reads:** dashboard, metrics, signals, and SSE use the latest valid market snapshot before falling back to PostgreSQL.
- **Real data only:** provider responses must pass validation before entering the calculation pipeline.
- **Explainable signals:** every signal includes the inputs and reasons used by the scoring rules.
- **Controlled notifications:** buy alerts track episodes, deduplicate events, enforce a maximum of two emails per subscriber in a rolling 24-hour window, and require at least eight hours between emails.
- **Privacy by default:** visitor access tracking has been removed. The application does not collect visitor IPs or store visitor access logs. Administrative audit records are separate and cover admin actions only.
- **Server-side secrets:** provider credentials, SMTP credentials, and admin credentials remain server-side in `.env`.

## Architecture

```text
External market providers
        │
        ▼
  Worker / BullMQ ──► PostgreSQL
        │                  │
        └──► Redis snapshot ◄┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
         Next.js web          NestJS API
              │                     │
              └────── browser ◄─────┘
                    SSE / HTTP
```

### Runtime components

| Component         | Responsibility                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/web`        | Next.js App Router dashboard, product pages, charts, SSE client, admin UI                               |
| `apps/api`        | NestJS/Fastify REST API, Swagger, market reads, metrics, signals, notifications, admin endpoints        |
| `apps/worker`     | Provider ingestion, metric calculation, signal generation, Redis snapshot refresh, email alert delivery |
| `packages/db`     | Prisma schema, migrations, generated database client                                                    |
| `packages/domain` | Gold formulas, momentum calculations, signal engine, shared domain types                                |
| `packages/config` | Environment validation and runtime configuration                                                        |
| `packages/logger` | Structured application logging                                                                          |

### Data flow

1. The worker fetches domestic gold, world gold, FX, and macro data on the configured schedule.
2. Valid records are stored in PostgreSQL.
3. The worker calculates metrics and generates signals.
4. A refresh job writes the current market snapshot to Redis.
5. Web and API reads use Redis first; PostgreSQL is a controlled fallback.
6. The worker evaluates buy-alert episodes, applies rate limits, and sends grouped email notifications through SMTP.

## Repository layout

```text
apps/
  api/       NestJS API
  web/       Next.js frontend
  worker/    ingestion and notification worker
packages/
  config/    environment configuration
  db/        Prisma schema and migrations
  domain/    formulas and signal logic
  logger/    structured logger
infra/       Docker Compose files and deployment scripts
docs/        operational and design documentation
```

This is a pnpm workspace managed by Turborepo. Node.js 22 is used by the production containers.

## Quick start

### Prerequisites

- Node.js 22 or newer
- pnpm 9.15.4
- Docker and Docker Compose

### Setup

```bash
pnpm install
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The local development stack is available at:

| Service       | URL                            |
| ------------- | ------------------------------ |
| Website       | `http://localhost:3000`        |
| API           | `http://localhost:4000/api/v1` |
| Swagger       | `http://localhost:4000/docs`   |
| Admin console | `http://localhost:3000/admin`  |

To run the complete Docker development stack instead:

```bash
docker compose -f infra/docker-compose.yml --profile app up -d
```

## Configuration

Copy `.env.example` to `.env` and set the values appropriate for the environment.

### Core services

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vangradar
REDIS_URL=redis://localhost:6379
API_PORT=4000
WEB_PORT=3000
WORKER_CONCURRENCY=5
```

### Market providers

Provider keys and URLs are server-side only:

- `VIETNAM_GOLD_API_URL` and optional `VIETNAM_GOLD_API_KEY` for domestic gold.
- `GOLDAPI_KEY`, with `METALS_DEV_API_KEY` as a world-gold fallback.
- `VNAPPMOB_API_URL` and optional `VNAPPMOB_API_KEY` for USD/VND FX.
- `FETCH_INTERVAL_*_CRON` variables control ingestion schedules.

If a provider is unavailable or returns data that fails validation, the worker skips that write. The web application does not generate mock market prices as a production fallback.

### Admin and email notifications

```dotenv
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_me

EMAIL_SENDER=your-sender@gmail.com
EMAIL_PASSWORD=your-gmail-app-password
EMAIL_UNSUBSCRIBE_SECRET=use-a-random-secret-at-least-32-characters-long
EMAIL_RECEIVERS=admin@example.com
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
```

`EMAIL_UNSUBSCRIBE_SECRET` must remain stable across deployments so unsubscribe tokens in previously delivered emails remain valid. Alert emails include Gmail-compatible `List-Unsubscribe` and `List-Unsubscribe-Post` headers; the unsubscribe link is not added to the visible email body.

Never commit `.env` or real provider, SMTP, or admin credentials.

## API surface

The API is versioned under `/api/v1` and documented through Swagger at `/docs`.

### Public endpoints

- `GET /health`
- `GET /products`
- `GET /prices/latest`
- `GET /prices/history`
- `GET /gold-prices/history`
- `GET /metrics/latest`
- `GET /metrics/history`
- `GET /signals/latest`
- `GET /market/summary`
- `GET /market/summary/stream` — Server-Sent Events
- `GET /market/world-gold`
- `GET /market/usd-vnd`
- `GET /market/dxy`
- `POST /notifications/subscribe`
- `POST /notifications/unsubscribe/:token`

### Admin endpoints

Admin endpoints use HTTP Basic Authentication and are intended for operational use:

- `GET /admin/audit`
- `GET /admin/sources/health`
- `GET /admin/data-quality/latest`
- `GET /admin/jobs`
- `POST /admin/jobs/run-ingestion`
- `GET /admin/notifications/subscribers`
- `DELETE /admin/notifications/subscribers/:id`

Visitor access tracking endpoints are intentionally not present.

## Email alert behavior

The worker evaluates buy-alert events for each product and episode:

- An episode begins when a product enters `BUY_DCA`.
- An improvement event is created when the score rises by at least three points or selling premium falls by at least 0.5 percentage points.
- Events are deduplicated by fingerprint.
- Only fresh, timestamp-aligned metric and signal data is eligible.
- A subscriber must be active with buy alerts enabled.
- A subscriber receives at most two emails in a rolling 24-hour window, with at least eight hours between emails.
- Pending events expire after 24 hours and are sent only while the product remains in `BUY_DCA`.
- A single email groups all eligible unsent events for that subscriber.

## Deployment

### Home server with Cloudflare Tunnel

Use the home-server stack when the application should run on a private machine without exposing router ports.

1. Point the domain to Cloudflare nameservers.
2. Create a Cloudflare Tunnel and obtain its token.
3. Set `TUNNEL_TOKEN` in `.env`.
4. Start the stack:

```bash
docker compose -f infra/docker-compose.home-server.yml up -d
```

The tunnel routes the public website to `web:3000` and the API hostname to `api:4000` over Docker's internal network.

### CI/CD

GitHub Actions builds immutable images tagged with the commit SHA. Production deployment runs in explicit phases:

1. Pull the commit-specific image.
2. Apply database migrations.
3. Seed only where the deployment workflow requires it.
4. Recreate application services.
5. Run health checks.

The three newest application images are retained for rollback. Keep secrets in the deployment environment; do not place them in GitHub workflow files or images.

## Verification and development commands

Run the standard quality gates from the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Useful focused commands:

```bash
pnpm --filter @vang-radar/api test
pnpm --filter @vang-radar/web test
pnpm --filter @vang-radar/worker test
pnpm --filter @vang-radar/db exec prisma validate
pnpm db:generate
```

Before a production release, verify:

- Redis contains a current market snapshot.
- API health and Swagger respond successfully.
- Worker queues are active and scheduled jobs are progressing.
- PostgreSQL migrations are applied.
- SSE connects and continues to receive heartbeats.
- Email alert headers contain both Gmail unsubscribe headers.
- No secrets are included in the image or Git history.

## Operational notes

- Redis is a performance layer, not the source of truth. PostgreSQL stores durable market and notification data.
- Do not use `FLUSHDB` in production; Redis also contains BullMQ state.
- Keep `EMAIL_UNSUBSCRIBE_SECRET` unchanged during redeployments.
- When diagnosing stale data, check worker health, snapshot freshness, Redis pointer keys, and provider validity before changing API fallback behavior.
- Administrative audit logs record administrator actions and are separate from visitor analytics.
