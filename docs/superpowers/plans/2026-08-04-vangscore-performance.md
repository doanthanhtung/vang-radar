# VangScore Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce VangScore home-page latency and unnecessary background API work while preserving 60-second data freshness.

**Architecture:** Cache the SSR summary fetch for 60 seconds, make the browser use the same-origin API rewrite so SSE can connect, defer factor history requests until interaction, and parallelize independent summary reads on Redis misses.

**Tech Stack:** Next.js App Router, React, NestJS, Prisma, Redis, Vitest.

## Global Constraints

- Do not change VangScore calculations or API response shapes.
- Do not add a database migration.
- Cache freshness is limited to 60 seconds.

---

### Task 1: Parallel market-summary reads

**Files:**
- Modify: `apps/api/src/modules/market/market.service.ts:256-287`
- Test: `apps/api/test/market-service.test.ts`

**Interfaces:**
- Produces: unchanged `MarketService.getSummary(): Promise<MarketSummary>`.

- [ ] **Step 1: Write the failing test**

Add deferred Prisma mocks and assert that `fxRate.findFirst`, `worldGoldPrice.findFirst`, `macroIndicator.findFirst`, and `goldProduct.findMany` are all called before any deferred promise is resolved.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vang-radar/api test -- market-service.test.ts`

- [ ] **Step 3: Implement the minimal code**

Replace sequential awaits with `Promise.all` over the four independent Prisma reads.

- [ ] **Step 4: Run API tests**

Run: `pnpm --filter @vang-radar/api test -- market-service.test.ts`

### Task 2: Remove non-essential initial browser requests

**Files:**
- Modify: `apps/web/features/market/live-market-dashboard.tsx:175-195`
- Test: `apps/web/features/market/live-market-dashboard.test.tsx`

**Interfaces:**
- Produces: factor history only loads after the corresponding factor is selected.

- [ ] **Step 1: Write the failing test**

Render the dashboard with ready summary data, advance timers beyond 900ms, and assert no history API function is called.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vang-radar/web test -- live-market-dashboard.test.tsx`

- [ ] **Step 3: Implement the minimal code**

Delete the idle prefetch effect; retain `toggleFactor` on-demand loading.

- [ ] **Step 4: Run web tests**

Run: `pnpm --filter @vang-radar/web test -- live-market-dashboard.test.tsx`

### Task 3: Cache SSR summary and route browser API requests locally

**Files:**
- Modify: `apps/web/lib/api-client.ts:3-13,161-163`
- Test: `apps/web/lib/api-client.test.ts`

**Interfaces:**
- Produces: server summary fetches use `next.revalidate: 60`; browser API base is `/api/v1`.

- [ ] **Step 1: Write the failing tests**

Assert `getMarketSummary()` passes `next: { revalidate: 60 }` and browser `getApiUrl('/market/summary/stream')` resolves to `/api/v1/market/summary/stream`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @vang-radar/web test -- api-client.test.ts`

- [ ] **Step 3: Implement the minimal code**

Use `/api/v1` in the browser and make the summary request use the 60-second Next data cache.

- [ ] **Step 4: Run web tests**

Run: `pnpm --filter @vang-radar/web test -- api-client.test.ts`

### Task 4: Verify and deploy

- [ ] Run: `pnpm lint`
- [ ] Run: `pnpm typecheck`
- [ ] Run: `pnpm test`
- [ ] Run: `pnpm build`
- [ ] Inspect the production deployment workflow and execute its documented deployment command.
- [ ] Measure `https://vangscore.com/` and `https://api.vangscore.com/api/v1/market/summary` after deployment.
