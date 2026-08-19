# Normalize BUY_DCA Score to 100 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `100/100` attainable for an ideal Vietnamese physical-gold BUY_DCA setup without changing signal classification guardrails.

**Architecture:** Keep the rule engine and public `SignalOutput` unchanged. Add pure normalized BUY_DCA component helpers in the domain explanation module, keep the existing adjusted score as an internal eligibility gate, and align worker history sample counts with the daily percentile semantics already used by metrics and snapshots.

**Tech Stack:** TypeScript, Vitest, pnpm workspace, Turbo, Prisma-backed worker queries.

**Spec:** `docs/superpowers/specs/2026-08-19-normalize-buy-score-100-design.md`

## Global Constraints

- `BUY_DCA` output scores are integers in the inclusive range 65–100.
- 100 requires premium percentile 0, spread ≤1.5%, XAU momentum 0–2%, and at least 30 completed Vietnam calendar-day samples.
- Existing signal rule order and eligibility thresholds remain unchanged.
- `AVOID`, `TAKE_PROFIT`, and `HOLD` score behavior remains unchanged.
- No database schema or public API shape changes.
- Worker and web must use distinct completed Vietnam days for history sample counts.

---

### Task 1: Add failing domain tests for normalized BUY_DCA scoring

**Files:**

- Modify: `packages/domain/test/signal-engine.test.ts`

**Interfaces:**

- Consumes: existing `SignalInput` and `generateDecisionSignal`.
- Produces: regression coverage for normalized component boundaries and exact maximum score.

- [ ] **Step 1: Add tests for the ideal 100-point setup**

Use the existing `baseInput` with `premiumSellPct: 0.02`, `premiumPercentile180d: 0`, `spreadPct: 0.015`, `xauMomentum30d: 0.01`, `premiumSampleSize180d: 30`, and `spreadSampleSize180d: 30`. Assert `signal === "BUY_DCA"` and `score === 100`.

- [ ] **Step 2: Add tests for history confidence**

Run the same setup with sample sizes `0`, `1`, `15`, and `30`. Assert the 30-sample case is 100, the 15-sample case is lower than 100, and the existing missing-history case remains `HOLD`.

- [ ] **Step 3: Add tests for spread and momentum component boundaries**

With premium percentile 0 and 30 samples, assert that spread 1.5% scores higher than 3.0%, momentum −8% scores lower than momentum 0%, momentum 0–2% is at least as high as momentum +8%, and momentum below −8% still falls back to `HOLD` through the existing gate.

- [ ] **Step 4: Add tests proving existing signal boundaries remain unchanged**

Retain or update the existing assertions for premium percentile 10, absolute premium 6%, spread above the BUY eligibility boundary, and the continuous legacy eligibility floor. Assert signal identifiers rather than old numeric BUY_DCA values where the displayed score is intentionally recalibrated.

- [ ] **Step 5: Run the focused test and verify RED**

Run:

```powershell
pnpm --filter @vang-radar/domain test -- signal-engine.test.ts
```

Expected: the new 100-point and component assertions fail against the existing 65–78 BUY_DCA score implementation.

### Task 2: Implement normalized domain scoring and explanations

**Files:**

- Modify: `packages/domain/src/signals/explain.ts`
- Modify: `packages/domain/test/signal-engine.test.ts`

**Interfaces:**

- Consumes: `SignalInput` values and existing BUY_DCA eligibility calculation.
- Produces: internal pure helpers for premium, spread, momentum, history, and normalized score; existing `SignalOutput` shape remains unchanged.

- [ ] **Step 1: Implement pure clamping and component helpers**

Add helpers with exact behavior:

```ts
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function calculatePremiumQuality(percentile: number): number {
  return clamp01((10 - percentile) / 10);
}

function calculateSpreadQuality(spreadPct: number): number {
  return clamp01((0.04 - spreadPct) / 0.025);
}

function calculateMomentumQuality(momentum: ResolvedMomentum): number {
  if (momentum.value === null) return 0;
  const value = momentum.value;
  if (value <= -0.08 || value >= 0.08) return 0;
  if (value < 0) return (value + 0.08) / 0.08;
  if (value <= 0.02) return 1;
  return (0.08 - value) / 0.06;
}

function calculateHistoryQuality(sampleSize: number): number {
  return clamp01(sampleSize / 30);
}
```

- [ ] **Step 2: Implement the normalized BUY_DCA score**

Compute the weighted quality and return `Math.round(65 + 35 * weightedQuality)`, clamped to 65–100. Use the existing premium percentile, spread, resolved XAU momentum, and premium sample size.

- [ ] **Step 3: Preserve the existing BUY_DCA eligibility gate**

Keep the current premium base plus legacy spread adjustment and its `adjustedScore >= 65` condition solely for deciding whether BUY_DCA matches. Replace only the matched rule’s returned `score` and `scoreFormula` with the normalized score; do not change AVOID, TAKE_PROFIT, HOLD, or the rule order.

- [ ] **Step 4: Expose normalized component details in the rule trace**

Add conditions whose labels identify `Chất lượng premium`, `Chất lượng spread`, `Chất lượng momentum XAU`, `Độ tin cậy lịch sử`, and `Điểm BUY_DCA chuẩn hóa`. Keep the existing `Điểm sau điều chỉnh spread` condition for the eligibility gate. Format component actual values as percentages and show the final score as `<score>/100`.

- [ ] **Step 5: Run focused domain tests and refactor only while green**

Run:

```powershell
pnpm --filter @vang-radar/domain test -- signal-engine.test.ts
pnpm --filter @vang-radar/domain typecheck
```

Expected: all domain tests pass, including the exact 100-point case and unchanged signal boundaries.

### Task 3: Align worker history sample counts to Vietnam daily semantics

**Files:**

- Modify: `apps/worker/src/signal-engine/generate-signals.ts`
- Modify: `apps/worker/test/daily-percentile.test.ts`

**Interfaces:**

- Consumes: the latest metric and its prior 180-day metric rows.
- Produces: `premiumSampleSize180d` and `spreadSampleSize180d` equal to the number of distinct completed Vietnam calendar days, matching `calculateDailyPercentile` and snapshots.

- [ ] **Step 1: Add a failing worker test for duplicate intraday rows**

Create a small exported pure helper or test the existing daily-history helper with two rows on the same Vietnam date and one row on another date. Assert the sample count is 2, not 3, and the latest row for a date is the selected observation.

- [ ] **Step 2: Run the focused worker test and verify RED**

Run:

```powershell
pnpm --filter @vang-radar/worker test -- daily-percentile.test.ts
```

Expected: the new distinct-day assertion fails before the helper is added or used.

- [ ] **Step 3: Implement the shared daily sample-count helper**

Use the existing Vietnam UTC+7 date conversion and latest-by-day selection. Query prior 180-day `goldMetric` rows per product in `generateLatestSignals`, calculate the distinct-day count, and pass that count to both sample-size fields. Do not change percentile values or signal predicates.

- [ ] **Step 4: Add worker regression coverage**

Assert that a product with fewer than 30 distinct days cannot receive the history-quality maximum while a product with 30 or more distinct days can. Keep the test independent of a live database by testing the pure helper.

- [ ] **Step 5: Run worker tests and typecheck**

```powershell
pnpm --filter @vang-radar/worker test
pnpm --filter @vang-radar/worker typecheck
```

Expected: all worker tests pass.

### Task 4: Update rule explanation and product-facing tests

**Files:**

- Modify: `apps/web/lib/vang-score.test.ts`
- Modify: `apps/web/features/market/score-explanation.tsx` only if the existing trace layout cannot render the added conditions cleanly.

**Interfaces:**

- Consumes: unchanged `ScoreExplanation` and `SignalAlgorithmExplanation` types.
- Produces: web tests confirming the live engine displays the normalized score and explanation formula without stale score values.

- [ ] **Step 1: Update web engine tests**

Use an ideal input and assert `BUY_DCA`, score `100`, the summary contains `100/100`, and the algorithm trace includes the normalized score formula and component labels.

- [ ] **Step 2: Verify the dashboard threshold contract**

Keep `getVangDecision` thresholds at 70 and 40. Add or retain tests proving score 70 remains `CÓ THỂ MUA`, score 69 remains `CÂN NHẮC`, and the score display continues to use `/100`.

- [ ] **Step 3: Run web tests and typecheck**

```powershell
pnpm --filter @vang-radar/web test
pnpm --filter @vang-radar/web typecheck
```

Expected: all web tests pass with no public type changes.

### Task 5: Historical replay, full verification, commit, merge, and push

**Files:**

- Verify: `packages/domain/src/signals/explain.ts`
- Verify: `apps/worker/src/signal-engine/generate-signals.ts`
- Verify: `docs/superpowers/specs/2026-08-19-normalize-buy-score-100-design.md`
- Verify: `docs/superpowers/plans/2026-08-19-normalize-buy-score-100.md`

**Interfaces:**

- Consumes: completed domain, worker, and web changes.
- Produces: one verified commit merged into local `main` and pushed to `origin/main`.

- [ ] **Step 1: Run historical replay/calibration checks**

Use the repository’s current engine replay tooling against available 180-day metric data. Confirm signal identifiers do not change for the existing boundary fixtures, report min/max/median BUY_DCA scores, and confirm at least one ideal synthetic case reaches 100.

- [ ] **Step 2: Run complete verification**

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all commands exit 0. If API smoke requires PostgreSQL, start the repository’s local database service first and rerun the full suite.

- [ ] **Step 3: Inspect the diff and commit the feature branch**

```powershell
git status --short
git diff --check
git diff --stat
git add docs/superpowers/specs/2026-08-19-normalize-buy-score-100-design.md docs/superpowers/plans/2026-08-19-normalize-buy-score-100.md packages/domain/src/signals/explain.ts packages/domain/test/signal-engine.test.ts apps/worker/src/signal-engine/generate-signals.ts apps/worker/test/daily-percentile.test.ts apps/web/lib/vang-score.test.ts
git commit -m "feat(domain): normalize buy score to 100"
```

- [ ] **Step 4: Fast-forward local main and merge the feature**

From the main worktree, update local main from `origin/main`, merge `codex/normalize-buy-score-100`, and rerun the complete verification commands on the merged tree.

- [ ] **Step 5: Push main and verify remote state**

```powershell
git push origin main
git log -1 --oneline origin/main
```

Expected: remote `origin/main` points to the verified merge commit.
