# Deduplicate Product Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove repeated metrics and interpretations from the product detail page without losing decision-critical data.

**Architecture:** Keep current state in the top metric grid, historical comparison in `HistorySummaryTable`, and trend visualization in chart cards. Delete the redundant quick-take calculation/rendering and trim repeated chart header values.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Vitest, Recharts.

## Global Constraints

- Preserve buy price, sell price, premium, spread, signal score, signal label, historical median, percentile, and chart tooltips.
- Do not modify scoring or API behavior.
- Preserve unrelated local changes.

---

### Task 1: Remove the repeated quick-take section

**Files:**
- Create: `apps/web/app/gold/product-detail-page.test.ts`
- Modify: `apps/web/app/gold/[productCode]/page.tsx`

**Interfaces:**
- Consumes: `MarketSummaryProduct.score` and the existing `MetricCard` component.
- Produces: a five-card current-metrics grid with one `SignalBadge` invocation.

- [ ] **Step 1: Write the failing source-contract test**

Assert that the page source does not contain `Nhận định nhanh` or `buildQuickTake`, contains `title="Điểm tín hiệu"`, and contains exactly one `<SignalBadge`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @vang-radar/web test -- product-detail-page.test.ts`

Expected: FAIL because the quick-take section and helper still exist.

- [ ] **Step 3: Implement the minimal UI change**

Remove `quickTake`, the quick-take section, and its helper functions. Add:

```tsx
<MetricCard title="Điểm tín hiệu" value={`${product.score}/100`} />
```

Use `sm:grid-cols-3 lg:grid-cols-5` for the current metric grid.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm --filter @vang-radar/web test -- product-detail-page.test.ts`

Expected: PASS.

### Task 2: Trim repeated values from chart headers

**Files:**
- Modify: `apps/web/features/products/metric-charts.test.ts`
- Modify: `apps/web/features/products/metric-charts.tsx`

**Interfaces:**
- Consumes: existing chart series and `HistorySummaryTable`.
- Produces: chart headers containing titles/descriptions and non-duplicated range context only.

- [ ] **Step 1: Add failing source-contract assertions**

Assert that the price chart header does not pass `primary={formatVnd(latest.sell)}` and the spread chart header does not pass its current amount or current/typical stats.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @vang-radar/web test -- metric-charts.test.ts`

Expected: FAIL on the repeated header values.

- [ ] **Step 3: Remove only the repeated header props**

Keep the price range stats (`So với đầu kỳ`, `Thấp nhất`, `Cao nhất`). Remove the price `primary` prop and remove `primary` plus `stats` from the spread `ChartHeader`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm --filter @vang-radar/web test -- metric-charts.test.ts`

Expected: PASS.

### Task 3: Verify and publish

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run repository verification**

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`; all commands must exit 0.

- [ ] **Step 2: Commit and push**

Commit only the spec, plan, tests, and product-detail/chart files, then push `main`.

- [ ] **Step 3: Verify deployment**

Wait for CI and Deploy workflows for the pushed SHA, then verify `https://vangscore.com` and the product detail route return HTTP 200.

