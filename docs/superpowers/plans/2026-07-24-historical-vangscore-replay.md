# Historical VangScore Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompute every historical row's VangScore with the production TypeScript engine before the Python backtester evaluates the current strategy.

**Architecture:** A pure domain module builds past-only `SignalInput` values from chronological daily quotes and calls `generateDecisionSignal`. A JSON CLI provides a stable batch boundary, while a Python bridge invokes it once per backtest and joins the recomputed fields into the normalized dataset.

**Tech Stack:** TypeScript, Vitest, Node.js JSON CLI, Python, pandas, pytest, pnpm.

## Global Constraints

- Use the production `generateDecisionSignal`; do not duplicate scoring rules in Python.
- At date T, use only observations dated at or before T.
- Percentile history excludes the current observation and covers the previous 180 calendar days.
- Momentum references follow the production lookup rule: latest observation at or before the target date, otherwise the oldest prior observation.
- Backtesting remains read-only and does not write signal snapshots to the database.
- Existing production signal behavior must remain unchanged.

---

### Task 1: Pure historical signal replay

**Files:**
- Create: `packages/domain/src/signals/historical.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/historical-signals.test.ts`

**Interfaces:**
- Consumes: Chronological or unsorted `HistoricalSignalRow[]` with `date`, `productCode`, domestic buy/sell, XAU/USD and USD/VND.
- Produces: `recomputeHistoricalSignals(rows): HistoricalSignalResult[]`.

- [x] **Step 1: Write failing tests**

Test that output is chronologically sorted, historical percentiles exclude the current row, future rows cannot affect past signals, 180-day expiry is honored, and momentum uses production-compatible reference dates.

- [x] **Step 2: Verify RED**

Run: `pnpm --filter @vang-radar/domain test -- historical-signals.test.ts`

Expected: FAIL because `recomputeHistoricalSignals` does not exist.

- [x] **Step 3: Implement minimal replay**

Calculate world VND, premium and spread with existing domain formulas; select past-only percentile and momentum references; construct `SignalInput`; call `generateDecisionSignal`; return input and output audit fields.

- [x] **Step 4: Verify GREEN**

Run: `pnpm --filter @vang-radar/domain test -- historical-signals.test.ts`

Expected: all historical replay tests PASS.

### Task 2: Batch JSON command

**Files:**
- Create: `packages/domain/src/signals/historical-cli.ts`
- Modify: `packages/domain/package.json`
- Test: `packages/domain/test/historical-cli.test.ts`

**Interfaces:**
- Consumes: a JSON file containing `{ "rows": HistoricalSignalRow[] }`.
- Produces: JSON containing `{ "engineVersion": string, "rows": HistoricalSignalResult[] }`.

- [x] **Step 1: Write failing CLI integration test**

Spawn the built command with a temporary input/output file and assert that it returns recomputed signal, score, confidence, audit input and engine version.

- [x] **Step 2: Verify RED**

Run: `pnpm --filter @vang-radar/domain test -- historical-cli.test.ts`

Expected: FAIL because the CLI does not exist.

- [x] **Step 3: Implement CLI and package command**

Validate the envelope, call `recomputeHistoricalSignals`, write JSON to stdout or the requested output path, and exit non-zero with a concise error for malformed input.

- [x] **Step 4: Verify GREEN**

Run: `pnpm --filter @vang-radar/domain test -- historical-cli.test.ts`

Expected: CLI test PASS.

### Task 3: Python backtest bridge

**Files:**
- Create: `research/backtest/current_engine_replay.py`
- Modify: `research/backtest/run_backtest.py`
- Modify: `research/backtest/data_adapter.py`
- Test: `research/tests/test_current_engine_replay.py`

**Interfaces:**
- Consumes: normalized pandas data and a resolved product code.
- Produces: the same frame enriched with `current_signal`, `current_score`, `current_confidence`, `current_engine_version`, and audit columns.

- [x] **Step 1: Write failing bridge tests**

Test payload mapping, product-code resolution, fail-fast behavior for missing market inputs, one batch subprocess invocation, row alignment, and preservation of earlier results after appending future data.

- [x] **Step 2: Verify RED**

Run: `python -m pytest research/tests/test_current_engine_replay.py -q`

Expected: FAIL because the replay bridge does not exist.

- [x] **Step 3: Implement bridge and runner integration**

Add `--skip-current-engine-replay`; otherwise resolve `--product-code` or a single `product_type`, invoke the TypeScript batch command once after normalization, join by normalized date, and export the enriched normalized dataset.

- [x] **Step 4: Verify GREEN**

Run: `python -m pytest research/tests/test_current_engine_replay.py -q`

Expected: bridge tests PASS.

### Task 4: Full verification

**Files:**
- Modify: `.gitignore`

**Interfaces:**
- Consumes: completed TypeScript and Python implementation.
- Produces: clean test/build evidence and no generated cache/output files in the intended change set.

- [x] **Step 1: Ignore research artifacts**

Add `__pycache__/`, `.pytest_cache/`, and `research/backtest/outputs/` without removing user data.

- [x] **Step 2: Run domain verification**

Run: `pnpm --filter @vang-radar/domain test && pnpm --filter @vang-radar/domain typecheck && pnpm --filter @vang-radar/domain build`

Expected: exit code 0.

- [x] **Step 3: Run research verification**

Run: `python -m pytest research/tests -q`

Expected: exit code 0.

- [x] **Step 4: Inspect final scope**

Run: `git status --short` and `git diff --check`

Expected: no whitespace errors and no modification to unrelated user-owned web files.
