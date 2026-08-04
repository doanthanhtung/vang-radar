# Runtime Image Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the shared VangScore production image by at least 50% while preserving the existing SHA-pinned deployment, database setup, health checks, and rollback behavior.

**Architecture:** Keep one image for `app-setup`, API, worker, and web. Build with full dependencies in a `builder` stage, create a clean production-only workspace in a `production-deps` stage, and copy only runtime manifests, production dependencies, Prisma assets, compiled packages, API/worker `dist`, and the Next.js runtime output into a fresh `runtime` stage.

**Tech Stack:** Docker BuildKit, Node.js 22 Alpine, pnpm 9.15.4 workspaces, Turborepo, Next.js 15, NestJS 10, Prisma 6, Node test runner, GitHub Actions, GHCR.

## Global Constraints

- The deployable artifact remains one shared SHA-tagged image for `app-setup`, API, worker, and web.
- The runtime image must be at least 50% smaller than the current baseline image for commit `f363ba1` before merge or production deployment.
- Production continues to build on GitHub-hosted infrastructure and pull from GHCR; the home server must not build source.
- Preserve migration, seed, service recreation, health checks, stale-deploy protection, serialized deploys, and retention of the running image plus the three newest application images.
- Keep Node.js 22 Alpine, pnpm 9.15.4, OpenSSL, immutable SHA tags, and existing `pnpm --filter` runtime commands.
- Runtime installation must be lockfile-faithful, production-only, and require no network access when containers start.
- Do not split service images or change application behavior, schema, seed policy, hosting, networking, or rollback policy.
- If the 50% size target is missed, stop before merge/deploy and record layer measurements; do not expand scope silently.

---

### Task 1: Lock down the runtime-image contract with static tests

**Files:**
- Modify: `infra/scripts/deploy-image-retention.test.mjs`
- Reference: `docs/superpowers/specs/2026-07-31-runtime-image-reduction-design.md`

**Interfaces:**
- Consumes: the repository-root `Dockerfile`, `.dockerignore`, `.github/workflows/ci.yml`, and `packages/db/package.json` as UTF-8 text.
- Produces: regression tests that enforce the three Docker stages, production-only install, required artifact copies, runtime dependency classification, and build-context exclusions.

- [ ] **Step 1: Add failing static tests for the approved image contract**

Append these tests to `infra/scripts/deploy-image-retention.test.mjs`:

```js
const dockerignore = readFileSync(new URL("../../.dockerignore", import.meta.url), "utf8");
const dbPackage = JSON.parse(
  readFileSync(new URL("../../packages/db/package.json", import.meta.url), "utf8")
);

test("production image uses isolated builder, production dependencies, and runtime stages", () => {
  assert.match(dockerfile, /FROM node:22-alpine AS builder/);
  assert.match(dockerfile, /FROM node:22-alpine AS production-deps/);
  assert.match(dockerfile, /FROM node:22-alpine AS runtime/);
  assert.match(dockerfile, /pnpm install --offline --frozen-lockfile --prod/);
  assert.match(dockerfile, /COPY --from=builder \/app\/apps\/api\/dist/);
  assert.match(dockerfile, /COPY --from=builder \/app\/apps\/worker\/dist/);
  assert.match(dockerfile, /COPY --from=builder \/app\/apps\/web\/.next/);
  assert.match(dockerfile, /COPY --from=builder \/app\/packages\/db\/prisma/);
});

test("database setup tools are production runtime dependencies", () => {
  assert.ok(dbPackage.dependencies?.prisma, "Prisma CLI must exist in production");
  assert.ok(dbPackage.dependencies?.tsx, "seed runner must exist in production");
  assert.equal(dbPackage.devDependencies?.prisma, undefined);
  assert.equal(dbPackage.devDependencies?.tsx, undefined);
});

test("Docker context excludes non-production local artifacts", () => {
  for (const pattern of ["research", ".kilo", ".worktrees", "index.html", ".cbmignore"]) {
    assert.match(dockerignore, new RegExp(`^${pattern.replace(".", "\\\\.")}$`, "m"));
  }
});

```

- [ ] **Step 2: Run the focused suite and verify the new tests fail for the intended reasons**

Run:

```powershell
node --test infra/scripts/deploy-image-retention.test.mjs
```

Expected: existing five tests pass; the three new tests fail because the Dockerfile is single-stage, Prisma/tsx are development dependencies, and ignore entries are absent.

- [ ] **Step 3: Commit only the failing contract tests**

```powershell
git add infra/scripts/deploy-image-retention.test.mjs
git commit -m "test: define production runtime image contract"
```

### Task 2: Make database setup available without development dependencies

**Files:**
- Modify: `packages/db/package.json`
- Modify: `pnpm-lock.yaml`
- Test: `infra/scripts/deploy-image-retention.test.mjs`

**Interfaces:**
- Consumes: existing `pnpm db:generate`, `prisma migrate deploy`, and `pnpm db:seed` commands.
- Produces: `prisma` and `tsx` as production dependencies of `@vang-radar/db`, allowing all setup commands after a production-only workspace install.

- [ ] **Step 1: Move the two runtime tools into dependencies using pnpm**

Run:

```powershell
pnpm --filter @vang-radar/db add prisma@^6.2.1 tsx@^4.19.2
```

Edit `packages/db/package.json` so `dependencies` contains `"prisma": "^6.2.1"` and `"tsx": "^4.19.2"`, while `devDependencies` contains neither key. Keep `typescript` and `vitest` in `devDependencies`.

- [ ] **Step 2: Verify dependency classification and lockfile consistency**

Run:

```powershell
node --test infra/scripts/deploy-image-retention.test.mjs --test-name-pattern "database setup tools"
pnpm install --frozen-lockfile
```

Expected: the dependency-classification test passes and frozen installation reports an up-to-date lockfile.

- [ ] **Step 3: Verify all database commands still resolve in the normal workspace**

Run:

```powershell
pnpm db:generate
pnpm --filter @vang-radar/db exec prisma --version
pnpm --filter @vang-radar/db exec tsx --version
```

Expected: Prisma Client generation succeeds and both commands print installed versions without downloading packages.

- [ ] **Step 4: Commit the runtime dependency correction**

```powershell
git add packages/db/package.json pnpm-lock.yaml
git commit -m "fix: retain database tools in production image"
```

### Task 3: Build a minimal shared runtime image

**Files:**
- Modify: `Dockerfile`
- Modify: `.dockerignore`
- Test: `infra/scripts/deploy-image-retention.test.mjs`

**Interfaces:**
- Consumes: workspace package manifests, `pnpm-lock.yaml`, compiled `dist` directories, `apps/web/.next`, web public/config files, and `packages/db/prisma`.
- Produces: the final Docker target `runtime`, supporting the unchanged commands `pnpm --filter @vang-radar/api start`, `pnpm --filter @vang-radar/worker start`, `pnpm --filter @vang-radar/web start`, `pnpm db:generate`, `prisma migrate deploy`, and `pnpm db:seed`.

- [ ] **Step 1: Replace the single-stage Dockerfile with three explicit stages**

Implement this structure, preserving the existing public build arguments and environment values:

```dockerfile
FROM node:22-alpine AS base
WORKDIR /app
ENV CI=true HUSKY=0 NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1
RUN apk add --no-cache openssl && corepack enable

FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/logger/package.json ./packages/logger/package.json
RUN pnpm fetch --prod=false
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --offline --frozen-lockfile --prod=false
ARG NEXT_PUBLIC_API_BASE_URL=https://api.vangscore.com/api/v1
ARG PUBLIC_API_BASE_URL=http://api:4000/api/v1
ARG LOCAL_API_PROXY_TARGET=http://api:4000/api/v1
ARG PUBLIC_WEB_URL=https://vangscore.com
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    PUBLIC_API_BASE_URL=${PUBLIC_API_BASE_URL} \
    LOCAL_API_PROXY_TARGET=${LOCAL_API_PROXY_TARGET} \
    PUBLIC_WEB_URL=${PUBLIC_WEB_URL}
RUN pnpm db:generate && pnpm build

FROM base AS production-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/logger/package.json ./packages/logger/package.json
RUN pnpm fetch --prod
COPY packages/db/prisma ./packages/db/prisma
RUN pnpm install --offline --frozen-lockfile --prod
RUN pnpm db:generate

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production HUSKY=0 NEXT_TELEMETRY_DISABLED=1 \
    API_PORT=4000 WEB_PORT=3000
RUN apk add --no-cache openssl && corepack enable
COPY --from=production-deps /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/apps ./apps
COPY --from=production-deps /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/next.config.mjs ./apps/web/next.config.mjs
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/domain/dist ./packages/domain/dist
COPY --from=builder /app/packages/logger/dist ./packages/logger/dist
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
EXPOSE 3000 4000
CMD ["pnpm", "--filter", "@vang-radar/web", "start"]
```

- [ ] **Step 2: Tighten the build context without excluding build inputs**

Add these exact entries to `.dockerignore`:

```text
research
.kilo
.worktrees
index.html
.cbmignore
docs
```

Keep `apps`, `packages`, root manifests, Prisma schema/migrations, and web static assets available.

- [ ] **Step 3: Run static tests and fix only contract mismatches**

Run:

```powershell
node --test infra/scripts/deploy-image-retention.test.mjs
```

Expected: all tests pass.

- [ ] **Step 4: Build and inspect the candidate image**

Run:

```powershell
docker build --pull --tag vang-radar:runtime-candidate .
docker run --rm vang-radar:runtime-candidate sh -lc "test -f apps/api/package.json && test -f apps/api/dist/apps/api/src/main.js && test -f apps/worker/dist/apps/worker/src/main.js && test -d apps/web/.next && test -f packages/db/prisma/schema.prisma && pnpm --filter @vang-radar/db exec prisma --version && pnpm --filter @vang-radar/db exec tsx --version"
docker image inspect vang-radar:runtime-candidate --format "{{.Size}}"
docker history vang-radar:runtime-candidate --no-trunc
```

Expected: build and artifact checks succeed; Prisma and tsx resolve inside the final image; image size and layer history are recorded in the task notes.

- [ ] **Step 5: Prove the final image excludes development-only tools and sources**

Run:

```powershell
docker run --rm vang-radar:runtime-candidate sh -lc "! pnpm exec vitest --version && ! pnpm exec tsc --version && test ! -d apps/api/src && test ! -d apps/worker/src && test ! -d apps/web/.git"
```

Expected: exit code 0 because vitest/TypeScript and source-only directories are absent while the shell assertions succeed.

- [ ] **Step 6: Commit the multi-stage runtime image**

```powershell
git add Dockerfile .dockerignore infra/scripts/deploy-image-retention.test.mjs
git commit -m "build: create minimal shared runtime image"
```

### Task 4: Smoke-test all four roles from the candidate image

**Files:**
- Modify: `README.md`
- Reference: `infra/docker-compose.home-server.yml`
- Test: candidate Docker image `vang-radar:runtime-candidate`

**Interfaces:**
- Consumes: the unchanged production commands from Compose and a disposable PostgreSQL/Redis test environment.
- Produces: evidence that `app-setup`, API, worker, and web all start from the same candidate image before CI or production sees it.

- [ ] **Step 1: Prepare an isolated Compose smoke environment**

Create a temporary `.env` copy outside Git tracking from the existing development-safe values, set `APP_IMAGE=vang-radar:runtime-candidate`, and use a distinct Compose project name:

```powershell
$env:COMPOSE_PROJECT_NAME = 'vang-radar-runtime-smoke'
$env:APP_IMAGE = 'vang-radar:runtime-candidate'
docker compose --profile tunnel -f infra/docker-compose.home-server.yml config --quiet
```

Do not use production credentials or bind public tunnel traffic. If the production Compose file requires Cloudflare secrets, omit the `tunnel` profile for the smoke run.

- [ ] **Step 2: Start data services and run the exact database setup commands**

```powershell
docker compose -f infra/docker-compose.home-server.yml up -d postgres redis
docker compose -f infra/docker-compose.home-server.yml run --rm app-setup
```

Expected: PostgreSQL and Redis become healthy; Prisma generate, `prisma migrate deploy`, and seed all exit successfully.

- [ ] **Step 3: Start API, worker, and web and verify health**

```powershell
docker compose -f infra/docker-compose.home-server.yml up -d api worker web
curl.exe --fail --max-time 10 http://127.0.0.1:4000/api/v1/health
curl.exe --fail --max-time 10 http://127.0.0.1:3000/
docker compose -f infra/docker-compose.home-server.yml ps
```

Expected: both curl commands return 2xx and all three application containers remain running.

- [ ] **Step 4: Capture logs and tear down only the isolated smoke project**

```powershell
docker compose -f infra/docker-compose.home-server.yml logs --tail 120 api worker web
docker compose -f infra/docker-compose.home-server.yml down --volumes
Remove-Item Env:COMPOSE_PROJECT_NAME
Remove-Item Env:APP_IMAGE
```

Expected: logs contain no fatal startup errors. Confirm the Compose project name is exactly `vang-radar-runtime-smoke` before `down --volumes`; never run this command against the production project.

- [ ] **Step 5: Document the runtime layout and smoke commands**

Add a concise `Production runtime image` subsection to `README.md` describing the three stages, the one-image/four-role contract, the 50% gate, and the safe smoke-test commands above.

- [ ] **Step 6: Commit smoke verification documentation**

```powershell
git add README.md
git commit -m "docs: explain runtime image verification"
```

### Task 5: Report compressed image size in CI

**Files:**
- Modify: `.github/workflows/ci.yml`
- Test: `infra/scripts/deploy-image-retention.test.mjs`

**Interfaces:**
- Consumes: the immutable `${{ github.sha }}` image pushed by `docker/build-push-action@v6` and authenticated GHCR access already configured in `build-image`.
- Produces: a `Report production image size` step that prints the compressed layer total without pulling the image back onto the GitHub runner.

- [ ] **Step 1: Add a failing static test for CI size reporting**

Append to `infra/scripts/deploy-image-retention.test.mjs`:

```js
test("CI reports compressed production image size", () => {
  assert.match(ciWorkflow, /name: Report production image size/);
  assert.match(ciWorkflow, /docker buildx imagetools inspect/);
  assert.match(ciWorkflow, /Compressed image size:/);
});
```

Run:

```powershell
node --test infra/scripts/deploy-image-retention.test.mjs --test-name-pattern "CI reports compressed"
```

Expected: FAIL because the workflow does not yet contain the reporting step.

- [ ] **Step 2: Add the size-reporting step after image push**

Add this Bash step immediately after `docker/build-push-action@v6` in the `build-image` job:

```yaml
- name: Report production image size
  shell: bash
  env:
    IMAGE: ghcr.io/${{ github.repository }}/app:${{ github.sha }}
  run: |
    set -euo pipefail
    raw_manifest="$(docker buildx imagetools inspect "$IMAGE" --raw)"
    media_type="$(jq -r '.mediaType' <<<"$raw_manifest")"
    if [[ "$media_type" == *"image.index"* || "$media_type" == *"manifest.list"* ]]; then
      digest="$(jq -r '.manifests[] | select(.platform.os == "linux" and .platform.architecture == "amd64") | .digest' <<<"$raw_manifest" | head -n 1)"
      test -n "$digest"
      raw_manifest="$(docker buildx imagetools inspect "$IMAGE@$digest" --raw)"
    fi
    compressed_bytes="$(jq '[.layers[].size] | add' <<<"$raw_manifest")"
    compressed_mib="$(awk -v bytes="$compressed_bytes" 'BEGIN { printf "%.2f", bytes / 1024 / 1024 }')"
    echo "Compressed image size: ${compressed_bytes} bytes (${compressed_mib} MiB)"
```

- [ ] **Step 3: Run the focused workflow test**

```powershell
node --test infra/scripts/deploy-image-retention.test.mjs --test-name-pattern "CI reports compressed"
```

Expected: the CI size-reporting test passes.

- [ ] **Step 4: Run all deploy/image contract tests**

```powershell
node --test infra/scripts/deploy-image-retention.test.mjs
```

Expected: all existing deploy-safety tests and all new runtime-image tests pass.

- [ ] **Step 5: Commit CI measurement**

```powershell
git add .github/workflows/ci.yml infra/scripts/deploy-image-retention.test.mjs
git commit -m "ci: report compressed production image size"
```

### Task 6: Enforce the 50% gate and complete verification

**Files:**
- Modify: `README.md` only if measured commands/results need correction
- Verify: all files changed in Tasks 1–5

**Interfaces:**
- Consumes: baseline image `ghcr.io/doanthanhtung/vang-radar/app:f363ba1acb3b50ca321c2a33d058158096678065` and local candidate `vang-radar:runtime-candidate`.
- Produces: a go/no-go result based on actual bytes plus complete local verification evidence.

- [ ] **Step 1: Obtain comparable baseline and candidate sizes**

On an authenticated Docker host, run:

```powershell
docker pull ghcr.io/doanthanhtung/vang-radar/app:f363ba1acb3b50ca321c2a33d058158096678065
$baseline = [int64](docker image inspect ghcr.io/doanthanhtung/vang-radar/app:f363ba1acb3b50ca321c2a33d058158096678065 --format '{{.Size}}')
$candidate = [int64](docker image inspect vang-radar:runtime-candidate --format '{{.Size}}')
$reduction = [math]::Round((1 - ($candidate / $baseline)) * 100, 2)
"Baseline bytes: $baseline"
"Candidate bytes: $candidate"
"Reduction percent: $reduction"
if ($reduction -lt 50) { throw "Runtime image reduction is below the required 50%." }
```

Expected: reduction is at least 50%. If not, stop before merge/push/deploy and use `docker history` to document the largest remaining layers.

- [ ] **Step 2: Verify source-only dependency cache reuse**

Run two BuildKit builds with a source-only timestamp-neutral edit between them and inspect plain progress:

```powershell
docker build --progress=plain --tag vang-radar:cache-check-1 .
docker build --progress=plain --tag vang-radar:cache-check-2 .
```

Expected: `pnpm fetch --prod=false` and `pnpm fetch --prod` report `CACHED` on the second build. Do not commit a synthetic source edit.

- [ ] **Step 3: Run repository verification**

```powershell
pnpm lint
pnpm typecheck
pnpm test
node --test infra/scripts/deploy-image-retention.test.mjs
docker compose -f infra/docker-compose.home-server.yml config --quiet
git diff --check
```

Expected: every command exits 0. For Compose validation, provide a temporary local `.env` only if required and remove it afterward without altering the user's existing environment file.

- [ ] **Step 4: Review the final diff and confirm scope**

```powershell
git status --short
git diff --stat HEAD~4..HEAD
git diff HEAD~4..HEAD -- Dockerfile .dockerignore packages/db/package.json pnpm-lock.yaml .github/workflows/ci.yml infra/scripts/deploy-image-retention.test.mjs README.md
```

Expected: only runtime dependency classification, Docker build/runtime layout, ignore rules, CI size reporting, tests, and documentation changed. Existing user-owned UI changes must remain uncommitted and untouched.

- [ ] **Step 5: Record the final measured result**

If README measurement examples changed, commit them:

```powershell
git add README.md
git diff --cached --quiet; if ($LASTEXITCODE -ne 0) { git commit -m "docs: record runtime image reduction" }
```

Do not merge or deploy until the image-size gate and all verification commands pass. After integration, monitor the production `Pull production image` step and compare it with the 4 minutes 15 seconds baseline; retain the old SHA image for rollback.
