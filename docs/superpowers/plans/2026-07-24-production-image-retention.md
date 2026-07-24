# Production Image Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe, repository-scoped image retention to the production deploy workflow.

**Architecture:** A post-health-check PowerShell workflow step enumerates local Vang Radar application images, keeps the three newest SHA-tagged image IDs, removes older IDs, and prunes dangling layers. A Node test inspects the workflow structure and safety constraints.

**Tech Stack:** GitHub Actions YAML, PowerShell, Docker CLI, Node.js test runner

## Global Constraints

- Cleanup runs only after successful production health checks.
- Keep the three newest Vang Radar application image IDs.
- Never prune Docker volumes or unrelated repositories.
- Cleanup failure warns but does not fail a healthy release.

---

### Task 1: Add workflow safety regression test

**Files:**
- Create: `infra/scripts/deploy-image-retention.test.mjs`
- Test: `infra/scripts/deploy-image-retention.test.mjs`

**Interfaces:**
- Consumes: `.github/workflows/deploy.yml`
- Produces: assertions for cleanup ordering, retention count, repository scope, and forbidden commands

- [ ] **Step 1: Write the failing test**

Create a Node test that reads `.github/workflows/deploy.yml`, extracts the cleanup step, and asserts `KEEP_IMAGE_COUNT: "3"`, the Vang Radar repository filter, placement after `Health check`, best-effort warning handling, and absence of `docker system prune`, `docker volume prune`, and `docker image prune -a`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test infra/scripts/deploy-image-retention.test.mjs`

Expected: FAIL because the cleanup step does not exist.

### Task 2: Implement production image retention

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Test: `infra/scripts/deploy-image-retention.test.mjs`

**Interfaces:**
- Consumes: Docker image metadata from `docker image ls`
- Produces: at most three locally retained Vang Radar application image IDs after a successful deploy

- [ ] **Step 1: Add the minimal cleanup step**

Insert a `Clean old application images` step after `Health check`. Enumerate `ghcr.io/${{ github.repository }}/app`, group tags by image ID, sort by creation time, retain three IDs, remove older IDs with `docker image rm`, run `docker image prune -f`, and print `docker system df` before and after. Catch cleanup errors and emit a GitHub Actions warning.

- [ ] **Step 2: Run the focused test**

Run: `node --test infra/scripts/deploy-image-retention.test.mjs`

Expected: PASS.

- [ ] **Step 3: Validate workflow formatting and repository checks**

Run: `pnpm exec prettier --check .github/workflows/deploy.yml infra/scripts/deploy-image-retention.test.mjs`

Expected: exit code 0.

- [ ] **Step 4: Commit and deploy**

Stage only the spec, plan, test, and deploy workflow. Commit, push the current branch and `main`, then watch CI and Deploy workflows through successful production health checks.
