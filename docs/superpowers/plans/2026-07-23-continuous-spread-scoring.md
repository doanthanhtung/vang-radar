# Continuous Spread Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3% binary spread cutoff with continuous BUY_DCA score adjustments while retaining a 4% AVOID boundary and stricter TAKE_PROFIT hot-spread thresholds.

**Architecture:** Keep the signal engine's current rule ordering and premium-led base score. Add one pure spread-adjustment helper inside `explain.ts`, incorporate it into BUY_DCA scoring, and expose its effect through the existing rule trace.

**Tech Stack:** TypeScript, Vitest, pnpm workspace, Turbo

## Global Constraints

- Spread at or above 4% must trigger AVOID.
- Spread must adjust BUY_DCA scores continuously rather than act as a 3% binary gate.
- BUY_DCA requires an adjusted score of at least 65.
- TAKE_PROFIT spread is hot at 3.5% absolute or the 80th historical percentile.
- Preserve existing rule order: DATA_UNRELIABLE, AVOID, BUY_DCA, TAKE_PROFIT, HOLD.
- Do not modify unrelated workspace files.

---

### Task 1: Continuous BUY_DCA spread adjustment

**Files:**

- Modify: `packages/domain/test/signal-engine.test.ts`
- Modify: `packages/domain/src/signals/explain.ts`

**Interfaces:**

- Consumes: `SignalInput.spreadPct`, premium-led BUY_DCA base score, and existing `SignalRuleTrace`.
- Produces: internal `calculateSpreadAdjustment(spreadPct: number): number` and BUY_DCA output whose score includes that adjustment.

- [x] **Step 1: Write failing regression tests**

Add tests that generate otherwise-identical DOJI signals at 2%, 2.5%, 3%, and 3.5% spread and expect scores `85`, `83`, `80`, and `74`. Add cases proving a 3.9% spread can remain BUY_DCA for premium percentile 0, while premium percentile 40 at 3.1% falls to HOLD. Add an explanation assertion for the spread adjustment and adjusted-score threshold.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm --filter @vang-radar/domain test -- signal-engine.test.ts
```

Expected: FAIL because current BUY_DCA scores ignore spread below 3%, reject all spread above 3%, and do not expose the adjusted-score condition.

- [x] **Step 3: Implement the continuous adjustment**

In `packages/domain/src/signals/explain.ts`:

```typescript
function calculateSpreadAdjustment(spreadPct: number): number {
  if (spreadPct <= 0.03) {
    return Math.min(8, ((0.03 - spreadPct) / 0.015) * 8);
  }
  return -Math.min(12, ((spreadPct - 0.03) / 0.01) * 12);
}
```

Compute the premium base score, add the spread adjustment, clamp and round the result, require the score to be at least 65, and include the adjustment in `scoreFormula` and `conditions`.

- [x] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
pnpm --filter @vang-radar/domain test -- signal-engine.test.ts
```

Expected: all signal-engine tests pass.

### Task 2: Spread safety and TAKE_PROFIT thresholds

**Files:**

- Modify: `packages/domain/test/signal-engine.test.ts`
- Modify: `packages/domain/src/signals/explain.ts`

**Interfaces:**

- Consumes: `VN_THRESHOLDS` and existing AVOID/TAKE_PROFIT rule evaluation.
- Produces: inclusive 4% AVOID boundary and TAKE_PROFIT hot-spread thresholds of 3.5% absolute or percentile 80.

- [x] **Step 1: Write failing boundary tests**

Add tests expecting AVOID at exactly 4% spread, HOLD when TAKE_PROFIT has 3% spread and percentile 79, TAKE_PROFIT at 3.5% spread, and TAKE_PROFIT at spread percentile 80.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm --filter @vang-radar/domain test -- signal-engine.test.ts
```

Expected: FAIL at the new inclusive and hot-spread boundaries.

- [x] **Step 3: Implement the threshold changes**

Set `spreadTakeProfitAbsolute` to `0.035`, `spreadPercentileTakeProfit` to `80`, change AVOID spread comparison to `>=`, and change percentile hot comparison to `>=`.

- [x] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
pnpm --filter @vang-radar/domain test -- signal-engine.test.ts
```

Expected: all signal-engine tests pass.

### Task 3: Repository verification and release

**Files:**

- Verify: `packages/domain/src/signals/explain.ts`
- Verify: `packages/domain/test/signal-engine.test.ts`

**Interfaces:**

- Consumes: completed engine and regression tests.
- Produces: verified commit ready for `main` and the existing GitHub Actions production deployment.

- [x] **Step 1: Run domain verification**

```powershell
pnpm --filter @vang-radar/domain test
pnpm --filter @vang-radar/domain typecheck
pnpm --filter @vang-radar/domain lint
```

Expected: all commands exit 0.

- [x] **Step 2: Run repository verification**

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all commands exit 0.

- [x] **Step 3: Commit the scoped change**

```powershell
git add docs/superpowers/specs/2026-07-23-continuous-spread-scoring-design.md docs/superpowers/plans/2026-07-23-continuous-spread-scoring.md packages/domain/src/signals/explain.ts packages/domain/test/signal-engine.test.ts
git commit -m "feat(domain): score spread continuously"
```

- [ ] **Step 4: Integrate and deploy**

Merge the verified feature branch into `main`, push `main`, wait for CI and Deploy to complete successfully, then confirm the production market summary returns scores from the deployed release.
