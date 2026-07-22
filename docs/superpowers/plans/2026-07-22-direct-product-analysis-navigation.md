# Direct Product Analysis Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every product click navigate directly to its 180-day analysis page and remove the seven-day popup flow.

**Architecture:** Convert mobile product cards and the desktop product control into Next.js links targeting `/gold/${product.code}`. Remove dialog-only state, fetches, effects, components, and imports from `ProductTable` while retaining the existing table/card presentation.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest.

## Global Constraints

- Preserve unrelated local edits in `product-table.tsx`.
- Keep navigation in the current tab.
- Do not remove the standalone history API or `DailyPriceHistory` component.

---

### Task 1: Direct navigation regression

**Files:**

- Modify: `apps/web/features/market/product-table.test.ts`
- Modify: `apps/web/features/market/product-table.tsx`

**Interfaces:**

- Consumes: `MarketSummaryProduct.code: string` and Next.js `Link`.
- Produces: links whose destination is `/gold/${product.code}`.

- [ ] **Step 1: Replace the obsolete dialog-height test with a failing navigation test**

Assert that the component source contains `href={`/gold/${product.code}`}` and no longer contains `ProductDetailDialog`, `getGoldPriceHistory`, or `aria-haspopup="dialog"`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @vang-radar/web test -- features/market/product-table.test.ts`

Expected: FAIL because the current component still opens the dialog.

- [ ] **Step 3: Implement direct navigation**

Use `Link` for the mobile card and desktop product-name control. Remove selected-product styling/state, history loading, dialog lifecycle, retry logic, and dialog-only components/imports.

- [ ] **Step 4: Run the focused test and typecheck**

Run: `pnpm --filter @vang-radar/web test -- features/market/product-table.test.ts`

Run: `pnpm --filter @vang-radar/web typecheck`

Expected: PASS with no TypeScript errors.

### Task 2: Full verification

**Files:**

- Verify: `apps/web/features/market/product-table.tsx`
- Verify: `apps/web/features/market/product-table.test.ts`

**Interfaces:**

- Consumes: completed Task 1 behavior.
- Produces: verified production-ready web change.

- [ ] **Step 1: Run all web tests**

Run: `pnpm --filter @vang-radar/web test`

Expected: all test files pass.

- [ ] **Step 2: Run lint and production build**

Run: `pnpm --filter @vang-radar/web lint`

Run: `pnpm --filter @vang-radar/web build`

Expected: both commands exit 0.

- [ ] **Step 3: Inspect the scoped diff**

Run: `git diff --check -- apps/web/features/market/product-table.tsx apps/web/features/market/product-table.test.ts`

Confirm the diff preserves mobile spacing edits and contains no unrelated files.

- [ ] **Step 4: Commit the implementation**

```bash
git add apps/web/features/market/product-table.tsx apps/web/features/market/product-table.test.ts docs/superpowers/plans/2026-07-22-direct-product-analysis-navigation.md
git commit -m "feat(web): open product analysis directly"
```
