# VangScore

MVP website for Vietnamese users that tracks gold prices, calculates premium/spread, and gives transparent
decision signals. This is not a trading platform, does not buy or sell gold, and does not hold user money.

Thông tin chỉ mang tính tham khảo, không phải khuyến nghị đầu tư cá nhân. Người dùng tự chịu trách nhiệm với quyết định tài chính của mình.

## Stack

- pnpm, Turborepo, TypeScript strict mode
- Next.js App Router, TailwindCSS, shadcn-style UI components, TanStack Query, Recharts
- NestJS API with Fastify, Swagger, Redis cache, basic auth admin endpoints
- NestJS-style BullMQ worker with server-side real data providers
- Prisma, PostgreSQL, TimescaleDB-ready SQL notes

## Local Development

1. Install dependencies:

```bash
pnpm install
```

2. Copy environment variables:

```bash
cp .env.example .env
```

3. Start Postgres and Redis:

```bash
docker compose -f infra/docker-compose.yml up -d
```

4. Run migrations:

```bash
pnpm db:migrate
```

5. Seed data:

```bash
pnpm db:seed
```

6. Start all apps:

```bash
pnpm dev
```

Expected URLs:

- Web: http://localhost:3000
- API: http://localhost:4000/api/v1
- Swagger: http://localhost:4000/docs
- Admin: http://localhost:3000/admin

## Trigger Ingestion

The worker runs one ingestion cycle on startup and schedules repeat jobs. To trigger the MVP admin endpoint manually:

```bash
powershell -ExecutionPolicy Bypass -File infra/scripts/run-ingestion.ps1
```

The API endpoint is:

```bash
POST http://localhost:4000/api/v1/admin/jobs/run-ingestion
Authorization: Basic admin:change_me
```

## Real Data Providers

Provider keys and URLs stay server-side in `.env`. Do not call providers from `apps/web`.

Configured providers:

- Domestic gold: set `VIETNAM_GOLD_API_URL`, and `VIETNAM_GOLD_API_KEY` if the endpoint requires it.
- World gold: set `GOLDAPI_KEY`; `METALS_DEV_API_KEY` is used as a fallback.
- USD/VND FX: defaults to `VNAPPMOB_API_URL`; set `VNAPPMOB_API_KEY` if your endpoint requires it.

If a provider is not configured or cannot parse a valid response, the worker skips writing that data. The web app no longer falls back to generated mock prices.

## Home Server With Cloudflare Tunnel

Use this when the current machine should host the site and Cloudflare should expose it to the internet without opening router ports.

1. Add your domain to Cloudflare and make sure the domain uses Cloudflare nameservers.
2. In Cloudflare Zero Trust, create a Cloudflare Tunnel with the `cloudflared` connector.
3. Add a public hostname for the website:

```text
Hostname: your-domain.com
Service:  http://web:3000
```

4. Copy the tunnel token into `.env`:

```bash
TUNNEL_TOKEN=your_cloudflare_tunnel_token
```

5. Start the home-server stack:

```bash
docker compose -f infra/docker-compose.home-server.yml up -d
```

The compose file binds Web and API to `127.0.0.1` on the host and lets the `cloudflared` container publish the web service. The web container calls the API through Docker's internal network at `http://api:4000/api/v1`.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
