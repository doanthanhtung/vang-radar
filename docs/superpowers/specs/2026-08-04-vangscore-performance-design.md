# VangScore Performance Design

## Goal

Make the VangScore home page consistently responsive without making market data older than the existing 60-second freshness target.

## Chosen approach

The home page remains server-rendered, but its summary fetch is eligible for Next's 60-second data cache instead of forcing a new API request on every visit. The browser calls the API through the existing same-origin `/api/v1` rewrite so the summary SSE stream can be used in production. The dashboard no longer prefetches factor histories until the user opens a factor.

On a Redis cache miss, `MarketService.getSummary()` will fetch the independent latest FX, world-gold, DXY, and product records concurrently. Existing per-product history and previous-close queries remain parallel, preserving the response contract and avoiding unrelated schema changes.

## Constraints

- The summary and history response shapes stay unchanged.
- Browser-visible data may be cached for at most 60 seconds.
- No database migration is included.
- Realtime summary updates continue through SSE once the browser is routed through the same-origin rewrite.

## Validation

- API tests verify summary lookup starts independent Prisma reads concurrently.
- Web tests verify the factor history remains on-demand.
- Run typecheck, lint, tests, production build, then measure the deployed page and summary endpoint.
