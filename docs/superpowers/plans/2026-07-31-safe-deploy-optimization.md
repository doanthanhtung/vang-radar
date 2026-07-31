# Safe Deploy Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Shorten the main-branch production path without weakening verification, database setup, health checks, stale-deploy protection, or rollback-image retention.

**Architecture:** Keep the existing CI-to-GHCR-to-self-hosted-runner architecture. Remove only the duplicate main-branch build, restructure the Dockerfile so dependency downloads survive source-only changes, and split production deployment into observable fail-fast phases while preserving ordering.

**Tech Stack:** GitHub Actions YAML, Docker BuildKit, pnpm 9, Turborepo, Node.js 22, Prisma, PowerShell, Node.js built-in test runner.

## Global Constraints

- Pull requests and manual CI runs must retain standalone `pnpm build` verification.
- A push to `main` must perform its required production build inside `build-image` and deploy only after the complete CI workflow succeeds.
- Production selection must continue to use the immutable commit SHA image tag.
- Database migration and seed remain mandatory on every deploy in this implementation.
- Application services must not be recreated until database setup succeeds.
- Web and API health checks, stale-deploy prevention, serialized deploys, and retention of three rollback application images must remain enforced.
- Runtime-image pruning, per-service images, selective deployment, blue-green deployment, and automatic rollback are out of scope.

---

### Task 1: Lock the safety invariants with workflow tests

**Files:**

- Modify: `infra/scripts/deploy-image-retention.test.mjs`
- Test: `infra/scripts/deploy-image-retention.test.mjs`

**Interfaces:**

- Consumes: workflow text from `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, and `Dockerfile`.
- Produces: regression assertions that later tasks must satisfy.

- [x] **Step 1: Add failing assertions for conditional builds and cache structure**

Add file reads for CI and Dockerfile, then add these tests:

```js
const ciWorkflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const dockerfile = readFileSync(new URL("../../Dockerfile", import.meta.url), "utf8");

test("main production path builds once while pull requests retain build verification", () => {
  assert.match(ciWorkflow, /name: Build monorepo outside image/);
  assert.match(ciWorkflow, /github\.event_name != 'push' \|\| github\.ref != 'refs\/heads\/main'/);
  assert.match(ciWorkflow, /build-image:[\s\S]*needs: verify/);
  assert.match(ciWorkflow, /docker\/build-push-action@v6/);
});

test("Docker dependency downloads are cached independently of source", () => {
  const fetchIndex = dockerfile.indexOf("RUN pnpm fetch --prod=false");
  const sourceIndex = dockerfile.indexOf("COPY apps ./apps");
  const offlineInstallIndex = dockerfile.indexOf(
    "RUN pnpm install --offline --frozen-lockfile --prod=false"
  );

  assert.ok(fetchIndex >= 0, "Dockerfile must fetch dependencies from the lockfile");
  assert.ok(sourceIndex > fetchIndex, "source must be copied after dependency fetch");
  assert.ok(offlineInstallIndex > sourceIndex, "offline install must link after source copy");
});
```

- [x] **Step 2: Add failing assertions for ordered deploy phases**

```js
test("production deploy keeps database setup ahead of service recreation", () => {
  const pullIndex = workflow.indexOf("name: Pull production image");
  const migrationIndex = workflow.indexOf("name: Run production migrations");
  const seedIndex = workflow.indexOf("name: Seed production reference data");
  const startIndex = workflow.indexOf("name: Recreate production services");
  const healthIndex = workflow.indexOf("name: Health check");
  const cleanupIndex = workflow.indexOf("name: Clean old application images");

  assert.ok(pullIndex >= 0);
  assert.ok(migrationIndex > pullIndex);
  assert.ok(seedIndex > migrationIndex);
  assert.ok(startIndex > seedIndex);
  assert.ok(healthIndex > startIndex);
  assert.ok(cleanupIndex > healthIndex);
  assert.match(workflow, /prisma migrate deploy/);
  assert.match(workflow, /pnpm db:seed/);
});

test("failed health checks emit service logs", () => {
  assert.match(workflow, /logs --tail 120 api worker web cloudflared/);
});
```

- [x] **Step 3: Run the workflow tests and verify they fail for the new requirements**

Run: `node --test infra/scripts/deploy-image-retention.test.mjs`

Expected: existing retention test passes; new tests fail because the CI condition, Docker fetch structure, and split deploy steps do not exist yet.

- [x] **Step 4: Commit the red tests**

```powershell
git add infra/scripts/deploy-image-retention.test.mjs
git commit -m "test: lock safe deploy optimization invariants"
```

### Task 2: Cache Docker dependency downloads across source changes

**Files:**

- Modify: `Dockerfile`
- Test: `infra/scripts/deploy-image-retention.test.mjs`

**Interfaces:**

- Consumes: `pnpm-lock.yaml`, root workspace metadata, BuildKit GHA cache.
- Produces: an application image with the same web/API/worker/Prisma build outputs and a source-independent dependency-fetch layer.

- [x] **Step 1: Replace the source-before-install sequence**

Change the Dockerfile build sequence to:

```dockerfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

RUN pnpm fetch --prod=false

COPY apps ./apps
COPY packages ./packages

RUN pnpm install --offline --frozen-lockfile --prod=false
```

Keep the existing `pnpm db:generate && pnpm build`, build arguments, runtime environment, ports, and command unchanged.

- [x] **Step 2: Run the focused workflow tests**

Run: `node --test infra/scripts/deploy-image-retention.test.mjs`

Expected: Docker cache test passes; CI and deploy-phase tests remain red.

- [x] **Step 3: Build the production image locally**

Run:

```powershell
docker build --tag vang-radar:safe-deploy-test `
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.vangscore.com/api/v1 `
  --build-arg PUBLIC_API_BASE_URL=http://api:4000/api/v1 `
  --build-arg LOCAL_API_PROXY_TARGET=http://api:4000/api/v1 `
  --build-arg PUBLIC_WEB_URL=https://vangscore.com .
```

Expected: image build completes successfully, including Prisma generation and all Turborepo builds.

- [x] **Step 4: Rebuild and inspect cache reuse**

Run the same `docker build` command again.

Expected: `pnpm fetch`, offline install, Prisma generation, and build layers report `CACHED` when inputs are unchanged.

- [x] **Step 5: Commit the Docker cache change**

```powershell
git add Dockerfile
git commit -m "build: cache Docker dependency downloads"
```

### Task 3: Eliminate the duplicate main-branch production build

**Files:**

- Modify: `.github/workflows/ci.yml`
- Test: `infra/scripts/deploy-image-retention.test.mjs`

**Interfaces:**

- Consumes: GitHub event name and ref.
- Produces: standalone build verification for PR/manual runs and exactly one production build for main pushes.

- [x] **Step 1: Make the standalone build event-aware**

Replace the unnamed final build command with:

```yaml
- name: Build monorepo outside image
  if: ${{ github.event_name != 'push' || github.ref != 'refs/heads/main' }}
  run: pnpm build
```

Do not change `build-image.needs: verify`, its main-push condition, BuildKit cache, image tags, or push behavior.

- [x] **Step 2: Run the focused workflow tests**

Run: `node --test infra/scripts/deploy-image-retention.test.mjs`

Expected: conditional-build and Docker cache tests pass; deploy-phase tests remain red.

- [x] **Step 3: Review event behavior explicitly**

Confirm from `.github/workflows/ci.yml`:

```text
pull_request       -> verify includes pnpm build; build-image skipped
workflow_dispatch  -> verify includes pnpm build; build-image skipped by current policy
push main          -> verify skips standalone build; build-image performs Docker production build
```

Expected: every event that can complete without a Docker image still receives standalone build verification.

- [x] **Step 4: Commit the CI build change**

```powershell
git add .github/workflows/ci.yml
git commit -m "ci: avoid duplicate main branch build"
```

### Task 4: Split production deployment into observable fail-fast phases

**Files:**

- Modify: `.github/workflows/deploy.yml`
- Test: `infra/scripts/deploy-image-retention.test.mjs`

**Interfaces:**

- Consumes: `IMAGE_TAG`, `PRODUCTION_ENV`, GHCR credentials, production Compose file.
- Produces: ordered GitHub Actions steps for data services, pull, migration, seed, recreation, health, and cleanup.

- [x] **Step 1: Add a shared production image environment variable**

At job level, add:

```yaml
env:
  IMAGE_TAG: ${{ github.event.workflow_run.head_sha || github.sha }}
  APP_IMAGE: ghcr.io/${{ github.repository }}/app:${{ github.event.workflow_run.head_sha || github.sha }}
  COMPOSE_FILE: infra/docker-compose.home-server.yml
```

Remove repeated step-local `IMAGE_TAG` declarations and repeated assignments to `$env:APP_IMAGE`.

- [x] **Step 2: Split data-service startup and image pull**

Replace the combined deploy step with:

```yaml
- name: Start production data services
  if: ${{ env.DEPLOY_IS_LATEST == 'true' }}
  run: |
    docker compose --profile tunnel -f $env:COMPOSE_FILE up -d postgres redis
    if ($LASTEXITCODE -ne 0) { throw "Failed to start data services." }

- name: Pull production image
  if: ${{ env.DEPLOY_IS_LATEST == 'true' }}
  run: |
    Write-Host "Pulling image $env:APP_IMAGE"
    docker compose --profile tunnel -f $env:COMPOSE_FILE pull app-setup api worker web
    if ($LASTEXITCODE -ne 0) { throw "Failed to pull production image." }
```

- [x] **Step 3: Split mandatory migration and seed**

```yaml
- name: Run production migrations
  if: ${{ env.DEPLOY_IS_LATEST == 'true' }}
  run: |
    docker compose -f $env:COMPOSE_FILE run --rm -T app-setup sh -c "pnpm db:generate && pnpm --filter @vang-radar/db exec prisma migrate deploy"
    if ($LASTEXITCODE -ne 0) { throw "Production migration failed." }

- name: Seed production reference data
  if: ${{ env.DEPLOY_IS_LATEST == 'true' }}
  run: |
    docker compose -f $env:COMPOSE_FILE run --rm -T app-setup pnpm db:seed
    if ($LASTEXITCODE -ne 0) { throw "Production seed failed." }
```

Seed remains mandatory and occurs before application recreation.

- [x] **Step 4: Add the separately named recreation step**

```yaml
- name: Recreate production services
  if: ${{ env.DEPLOY_IS_LATEST == 'true' }}
  run: |
    docker compose --profile tunnel -f $env:COMPOSE_FILE up -d --no-deps --force-recreate --remove-orphans api worker web cloudflared
    if ($LASTEXITCODE -ne 0) { throw "Failed to start production services." }
```

- [x] **Step 5: Make health-check failures print service logs**

Wrap the two `Wait-HttpOk` calls in:

```powershell
try {
  Wait-HttpOk -Url "http://127.0.0.1:3000"
  Wait-HttpOk -Url "http://127.0.0.1:4000/api/v1/health"
} catch {
  docker compose --profile tunnel -f $env:COMPOSE_FILE ps
  docker compose --profile tunnel -f $env:COMPOSE_FILE logs --tail 120 api worker web cloudflared
  throw
}
```

- [x] **Step 6: Use the shared Compose path in cleanup/status steps**

Replace literal `infra/docker-compose.home-server.yml` references in the remaining deploy job with `$env:COMPOSE_FILE`. Keep cleanup best-effort, keep `KEEP_IMAGE_COUNT: "3"`, and keep the final status step under `always()`.

- [x] **Step 7: Run the workflow regression tests**

Run: `node --test infra/scripts/deploy-image-retention.test.mjs`

Expected: all tests pass, including phase order, health logs, image retention, and running-image protection.

- [x] **Step 8: Commit the observable deployment phases**

```powershell
git add .github/workflows/deploy.yml infra/scripts/deploy-image-retention.test.mjs
git commit -m "ci: expose safe production deploy phases"
```

### Task 5: Final verification and operational handoff

**Files:**

- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-31-safe-deploy-optimization.md`
- Test: `infra/scripts/deploy-image-retention.test.mjs`

**Interfaces:**

- Consumes: completed workflow, Dockerfile, and local production image.
- Produces: verified implementation and operator guidance for interpreting deployment timing.

- [x] **Step 1: Document the deployment phases**

Add a short README subsection under home-server deployment:

```markdown
### Production deploy timing

GitHub Actions reports production deployment as separate phases: image pull, migration, seed, service recreation, and health checks. Migration and seed remain mandatory before application services are recreated. Production always deploys the commit-SHA image, while the three newest application images are retained for rollback.
```

- [x] **Step 2: Run focused workflow tests**

Run: `node --test infra/scripts/deploy-image-retention.test.mjs`

Expected: all tests pass.

- [x] **Step 3: Run repository verification**

Run:

```powershell
pnpm lint
pnpm typecheck
pnpm test
```

Expected: all commands pass with PostgreSQL and Redis available for API smoke tests.

- [x] **Step 4: Rebuild the final Docker image**

Run the Task 2 `docker build` command once more.

Expected: build succeeds; unchanged dependency-fetch layer is cached.

- [x] **Step 5: Inspect the complete diff**

Run:

```powershell
git diff --check HEAD~4..HEAD
git status --short
```

Expected: no whitespace errors; only unrelated pre-existing user changes remain unstaged.

- [x] **Step 6: Commit documentation and plan completion**

Mark completed plan checkboxes, then run:

```powershell
git add README.md docs/superpowers/plans/2026-07-31-safe-deploy-optimization.md
git commit -m "docs: explain production deploy timing"
```

- [x] **Step 7: Report the production-only verification boundary**

State explicitly that local tests validate workflow structure and image construction, while actual GHCR transfer time and self-hosted production timings will be available only after the next successful `main` deployment. Do not claim a measured production speedup before that run.
