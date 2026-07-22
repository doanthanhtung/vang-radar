# Official DOJI Price Provider Implementation Plan

**Goal:** Prefer DOJI's official public price feed for `DOJI_RING_9999`, while preserving the existing aggregator quote as fallback.

**Architecture:** Add a focused provider that decrypts and parses DOJI's public API response. Keep the existing nationwide provider unchanged, then merge both provider results before persistence so only the DOJI quote is replaced on official-source success.

**Tech Stack:** TypeScript, Node `crypto`, Vitest, Prisma, pnpm, Docker Compose.

---

## Task 1: Official provider parser and fetch behavior

**Files:**
- Create: `apps/worker/src/providers/domestic-gold/doji-official.ts`
- Create: `apps/worker/test/doji-official-provider.test.ts`

1. Add failing tests for deterministic AES-256-CBC decryption, target material selection, price conversion, source timestamp preservation, and malformed payload rejection.
2. Run the focused test and confirm it fails because the provider does not exist.
3. Implement the smallest provider and pure helpers needed to pass the tests.
4. Re-run the focused test and worker typecheck.

## Task 2: Official-first merge with aggregator fallback

**Files:**
- Modify: `apps/worker/src/jobs/ingestion.ts`
- Create: `apps/worker/test/domestic-gold-ingestion.test.ts`

1. Add failing tests for replacing the aggregator DOJI quote on official success and retaining it on official failure.
2. Extract/export a small pure merge helper and integrate both providers into `fetchDomesticGold`.
3. Run the focused tests and confirm official success and fallback behavior pass.

## Task 3: Verification and deployment

**Files:**
- No intended application file changes.

1. Run worker tests, worker typecheck, repository lint, full tests, and production build.
2. Build a new application image and recreate only the worker service.
3. Verify the worker is healthy and ingestion completes.
4. Query the database/API to confirm the latest `DOJI_RING_9999` record uses `DOJI_OFFICIAL`, the official timestamp, and converted prices.
5. Inspect the final diff and preserve all unrelated workspace changes.
