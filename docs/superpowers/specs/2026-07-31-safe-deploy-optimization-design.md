# Safe Deploy Optimization Design

## Context

VangScore deploys from `main` through two GitHub Actions workflows. The CI workflow verifies the monorepo, builds a production Docker image, and pushes two tags to GHCR. A self-hosted Windows runner then pulls the immutable SHA-tagged image, runs Prisma setup, recreates the application services, checks web and API health, and retains three application images for rollback.

The current process favors safety, but it repeats expensive work and obscures the duration of several production steps:

- `pnpm build` runs once in the CI verification job and again inside the Docker image build.
- The Dockerfile copies application source before dependency installation, so ordinary source changes invalidate the dependency-install layer.
- Pull, database setup, and service restart are combined in one workflow step, making the actual bottleneck hard to see.
- Production runs database seed on every deployment, regardless of whether seed definitions changed.

The desired outcome is a moderately faster deployment without weakening the existing build, migration, health-check, rollback, or stale-deploy safeguards.

## Goals

- Reduce the elapsed time from a successful push to a healthy production deployment.
- Preserve an immutable, SHA-tagged production image as the deployment unit.
- Preserve lint, typecheck, tests, production build verification, migrations, health checks, stale-deploy prevention, and retention of rollback images.
- Make each material deploy phase independently measurable in GitHub Actions.
- Make each optimization independently reversible.

## Non-goals

- Blue-green or canary deployment.
- Per-service images or selective service deployment.
- Changing hosting providers, the self-hosted runner, GHCR, Cloudflare Tunnel, PostgreSQL, or Redis.
- Aggressively minimizing the runtime image at the cost of changing Prisma or pnpm runtime behavior.
- Database schema or application feature changes.

## Proposed Design

### 1. Remove only the duplicated production build

The verification job continues to install dependencies, generate Prisma artifacts, apply migrations to its disposable CI database, seed that database, lint, typecheck, and run all tests.

Build behavior becomes event-aware:

- Pull requests and manual CI runs continue to execute `pnpm build` in the verification job, because they do not necessarily produce a Docker image.
- A push to `main` does not execute the standalone `pnpm build` in the verification job. Its required production build occurs inside the `build-image` job.
- The Docker image job continues to depend on the complete verification job and must succeed before the CI workflow is considered successful.
- The deploy workflow remains triggered only after the entire CI workflow succeeds, so production cannot deploy an image that failed to build.

This removes one production build from the main-branch path while preserving build validation for pull requests.

### 2. Make dependency downloads cacheable across source changes

The Dockerfile will use pnpm's fetch/install split:

1. Copy only the root package metadata, workspace definition, lockfile, and build configuration needed to resolve dependencies.
2. Run `pnpm fetch --prod=false` to populate pnpm's content-addressed store from the lockfile.
3. Copy application and package source.
4. Run `pnpm install --offline --frozen-lockfile --prod=false` to link the already-fetched dependencies.
5. Generate Prisma artifacts and run the monorepo production build.

With GitHub Actions BuildKit cache enabled, changing a TS/TSX/CSS file no longer forces dependency packages to be downloaded again. A lockfile change intentionally invalidates the fetch layer.

The first iteration will not introduce a highly pruned runtime image. The current single application image is shared by web, API, worker, and database setup; pruning it safely requires proving the runtime and Prisma CLI dependency sets for all four roles. That can be a separate optimization after timing data shows image transfer is a dominant cost.

### 3. Split deployment phases and record their durations

The combined production command will be separated into named workflow steps:

1. Start/check PostgreSQL and Redis.
2. Pull the application image.
3. Run Prisma generate and migrations.
4. Run seed according to the seed policy below.
5. Recreate API, worker, web, and Cloudflare Tunnel.
6. Check web and API health.
7. Clean old application images.

GitHub Actions already reports step durations. Small PowerShell timing wrappers will additionally print elapsed seconds for commands where one workflow step contains multiple operations. This gives a baseline before and after the cache changes and makes future regressions visible.

No production phase will run in parallel with database setup. Application services start only after setup succeeds.

### 4. Keep seed automatic in the initial rollout

Database migration remains mandatory on every deploy.

The initial optimization keeps seed automatic on every deployment. It will be moved into a separately named and timed workflow step, but its execution policy will not change during the cache/build rollout.

After at least two instrumented production deployments, seed may be optimized in a separate change only if it accounts for at least 10% of total deployment time. That follow-up must use an explicit workflow input/environment flag rather than an unreliable source-diff heuristic:

- Automatic production deploys may default to skipping seed only after the follow-up change is reviewed and approved.
- Manual deploy supports `RUN_DB_SEED=true` when seed definitions or required reference data change.
- The seed command remains idempotent and available as a separately named workflow step.
- Until that follow-up is approved, every deployment continues to run seed.
- Documentation must state that any change to Prisma seed/reference data requires a manual seeded deploy.

If this operational requirement is judged too easy to miss, seed will remain automatic regardless of its measured duration.

### 5. Preserve deployment safety and rollback

The following behavior remains unchanged:

- Deploy only after successful CI.
- Deploy the exact commit SHA, never rely on `latest` for production selection.
- Skip stale workflow-triggered deployments.
- Serialize production deployments without canceling an in-progress deployment.
- Fail immediately if image pull, migration/setup, service recreation, or health checks fail.
- Keep the current running image and the three newest application images.
- Print Compose service status even after a failed deploy.

An automatic rollback is intentionally out of scope. The existing retained SHA images provide a known recovery path without adding untested automated state transitions.

## Data and Control Flow

```text
push main
  -> verify: install, Prisma CI setup, lint, typecheck, tests
  -> build-image: cached fetch, offline install, Prisma generate, production build, push SHA image
  -> deploy runner: pull SHA image
  -> mandatory migrate
  -> automatic seed (initial rollout)
  -> recreate services
  -> web + API health checks
  -> retain rollback images
```

Pull requests stop after verification and continue to include a standalone production build.

## Error Handling

- A dependency fetch/install failure fails image creation; deployment never starts.
- A production build failure fails CI; deployment never starts.
- A pull failure leaves the currently running services untouched.
- A migration or seed failure prevents service recreation, leaving the previous application containers running.
- A service-start or health-check failure fails the deployment and prints service state and recent logs needed for recovery.
- Cleanup remains best-effort and must never turn a healthy deployment into a failed deployment.

## Testing and Verification

### Static workflow tests

Extend the existing deployment workflow tests to assert:

- Main pushes build exactly once on the production path.
- Pull requests retain standalone `pnpm build` verification.
- `build-image` depends on `verify`.
- Deploy remains gated on successful CI and uses the SHA image tag.
- Migration precedes service recreation.
- Seed behavior is explicit and defaults to the approved safe policy.
- Health checks precede image cleanup.
- Three rollback images and running images remain protected.

### Docker verification

- Build the image from a clean cache.
- Build it again without changes and confirm dependency fetch/build layers are cached.
- Change a source-only file and confirm the dependency-fetch layer remains cached.
- Start the production image roles in a local/preview Compose environment and verify web, API, worker startup and Prisma setup.

### Deployment verification

- Capture a baseline from a recent deploy or the first instrumented deploy.
- Perform one production deployment with seed enabled.
- Confirm web and API health, worker operation, database state, and Cloudflare reachability.
- Perform a second no-dependency-change deployment and compare per-phase durations.
- Confirm the previous SHA image remains available for manual rollback.

## Rollout Sequence

1. Add timing and workflow structure without changing behavior.
2. Add static assertions and verify the unchanged deploy path.
3. Introduce pnpm fetch/offline install cache structure.
4. Make the main-push standalone build conditional while keeping PR build verification.
5. Deploy with the unchanged automatic seed behavior and confirm production health.
6. After two measured deployments, consider a separately reviewed seed-policy change only if seed consumes at least 10% of total deployment time.
7. Compare deploy timings and document the result.

Each step is independently revertible. The rollout does not combine image pruning, service splitting, or traffic switching with the cache changes.

## Success Criteria

- No reduction in CI checks for pull requests.
- Production deploys only after the image has built successfully.
- A source-only change reuses the Docker dependency-fetch cache.
- The main-branch production path performs one production build rather than two.
- Database migrations, health checks, stale-deploy protection, and rollback-image retention remain enforced.
- GitHub Actions clearly shows time spent on image pull, database setup, service start, and health checks.
- At least one successful production deployment validates the revised flow before any further optimization is attempted.
