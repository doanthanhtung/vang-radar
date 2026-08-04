# Runtime Image Reduction Design

## Context

VangScore builds one immutable Docker image on a GitHub-hosted runner, stores it in GHCR, and pulls the SHA-tagged image on the self-hosted production runner. The same image starts API, worker, web, and the one-off `app-setup` database command.

The first measured deployment after the safe-deploy workflow changes took 5 minutes 4 seconds. Image pull from GHCR to the home server took 4 minutes 15 seconds; migration, seed, service recreation, and health checks took about 19 seconds combined. The production image currently comes from a single Docker stage, retaining the build toolchain, development dependencies, source, and build output.

## Goal

Reduce the production image size by at least 50% while retaining one shared SHA-tagged image and the current safe deployment and rollback behavior.

## Non-goals

- Separate images for API, worker, web, or `app-setup`.
- Build application code on the home server.
- Change GHCR, the self-hosted runner, databases, networking, or rollback retention.
- Change application behavior, database schema, seed policy, or health-check policy.
- Promise a specific pull-time reduction before size and transfer measurements exist.

## Chosen Approach

Use a multi-stage Docker build with one common runtime image:

1. `builder` installs the complete workspace dependencies, generates Prisma Client, and builds the monorepo.
2. `production-deps` creates a production-only dependency tree from the exact lockfile.
3. `runtime` starts from a fresh Node Alpine base and receives only production dependencies, generated Prisma assets, built application/package artifacts, and the minimum manifests/runtime files required by pnpm commands.
4. The existing Compose file continues to pass the one SHA-tagged `APP_IMAGE` to API, worker, web, and `app-setup`.

The runtime image deliberately continues to contain the Prisma CLI and schema needed by `app-setup`, because production migrations still run from the same immutable image before services restart.

## Dockerfile Boundaries

### Builder stage

- Uses the existing Node 22 Alpine base, OpenSSL, Corepack, and pnpm workspace setup.
- Keeps `pnpm fetch --prod=false` followed by offline install, so lockfile changes invalidate dependencies while source-only changes do not redownload them.
- Runs `pnpm db:generate` and `pnpm build`.
- Is never selected as the deployable image.

### Production dependency stage

- Uses `pnpm deploy --prod` or an equivalent lockfile-faithful pnpm command for the shared runtime workspace.
- Must include every workspace package required by API, worker, web, and Prisma setup.
- Must not accept a dependency tree that needs a network install at runtime.

### Runtime stage

- Starts from a fresh Node 22 Alpine base and installs only OS libraries proven necessary at runtime (initially OpenSSL).
- Copies the production dependency tree, generated Prisma client/engine assets, runtime manifests, and compiled output from earlier stages.
- Retains the existing `pnpm --filter` commands and port/environment contract, avoiding changes in Compose or the deploy workflow.
- Must not contain dev dependencies, TypeScript source used only for compilation, test files, Git metadata, or build caches.

## Build Context Policy

Tighten `.dockerignore` without excluding files needed by build or Prisma:

- Continue excluding Git metadata, local environment files, dependencies, build outputs, coverage, caches, logs, local research outputs, and temporary tooling directories.
- Add any discovered local artifacts that are not production build inputs.
- Keep package manifests, lockfile, Prisma schema/migrations, application/package source, and static assets required for the build.
- Test that Docker builds from a clean checkout and does not rely on ignored local state.

## Measurement and Acceptance Criteria

For each built image, report immutable image reference and compressed image size in CI. The deploy workflow already exposes pull duration as an independent step; retain it as the transfer metric.

The change is accepted only if:

- The runtime image is at least 50% smaller than the current baseline image for commit `f363ba1`.
- API, worker, web, and `app-setup` all run successfully from the same new SHA image.
- Prisma generation, migrations, seed, and web/API health checks remain successful during production deployment.
- Existing static tests still prove SHA pinning, stale-deploy prevention, migration-before-recreate order, health checks, and rollback image retention.
- A source-only rebuild retains the dependency-fetch layer; a lockfile change intentionally invalidates it.
- The old image remains available through existing retention rules, making manual rollback possible.

If the image-size goal is not met, do not deploy the change. Record the measured layers and prepare a follow-up design rather than quietly expanding scope to service-specific images.

## Verification Plan

1. Add a failing static test that asserts a multi-stage runtime image and the required runtime artifacts/commands.
2. Build from a clean Docker cache; inspect image size and layer history.
3. Rebuild unchanged source; confirm dependency-fetch cache reuse.
4. Change one source-only file; confirm dependency-fetch cache reuse and successful image build.
5. Run the shared image under the production Compose definition in a safe local/preview environment; exercise `app-setup`, API health, web health, and worker startup.
6. Compare the new image size with the `f363ba1` baseline before merging.
7. After merge, observe a production deployment and compare its `Pull production image` duration with the 4 minutes 15 seconds baseline.

## Safety and Rollback

No deployment ordering changes: CI builds and pushes a SHA image, production pulls it before migration, migration/seed succeed before service recreation, health checks gate completion, and the latest three application images plus the running image remain protected.

Any build, runtime startup, migration, seed, or health-check failure stops the rollout before a healthy deployment is reported. Reverting this change restores the prior single-stage Dockerfile; the prior SHA image remains available for manual rollback.
