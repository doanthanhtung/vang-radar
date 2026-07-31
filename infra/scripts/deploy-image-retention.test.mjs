import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../../.github/workflows/deploy.yml", import.meta.url),
  "utf8"
);
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

test("production deploy keeps database setup ahead of service recreation", () => {
  const pullIndex = workflow.indexOf("name: Pull production image");
  const migrationIndex = workflow.indexOf("name: Run production migrations");
  const seedIndex = workflow.indexOf("name: Seed production reference data");
  const startIndex = workflow.indexOf("name: Recreate production services");
  const healthIndex = workflow.indexOf("name: Health check");
  const cleanupIndex = workflow.indexOf("name: Clean old application images");

  assert.ok(pullIndex >= 0, "image pull step is missing");
  assert.ok(migrationIndex > pullIndex, "migration must run after image pull");
  assert.ok(seedIndex > migrationIndex, "seed must run after migration");
  assert.ok(startIndex > seedIndex, "services must start after database setup");
  assert.ok(healthIndex > startIndex, "health checks must run after service recreation");
  assert.ok(cleanupIndex > healthIndex, "cleanup must run after health checks");
  assert.match(workflow, /prisma migrate deploy/);
  assert.match(workflow, /pnpm db:seed/);
});

test("failed health checks emit service logs", () => {
  assert.match(workflow, /logs --tail 120 api worker web cloudflared/);
});

test("production deploy safely retains three application images after health checks", () => {
  const healthCheckIndex = workflow.indexOf("- name: Health check");
  const cleanupIndex = workflow.indexOf("- name: Clean old application images");
  const statusIndex = workflow.indexOf("- name: Show service status");

  assert.notEqual(cleanupIndex, -1, "cleanup step is missing");
  assert.ok(healthCheckIndex < cleanupIndex, "cleanup must run after the health check");
  assert.ok(cleanupIndex < statusIndex, "cleanup must run before the final service status");

  const cleanupStep = workflow.slice(cleanupIndex, statusIndex);

  assert.match(cleanupStep, /KEEP_IMAGE_COUNT:\s*"3"/);
  assert.match(cleanupStep, /ghcr\.io\/\$\{\{ github\.repository \}\}\/app/);
  assert.match(cleanupStep, /docker ps/);
  assert.match(cleanupStep, /docker image prune -f/);
  assert.match(cleanupStep, /::warning::/);

  assert.doesNotMatch(cleanupStep, /docker system prune/i);
  assert.doesNotMatch(cleanupStep, /docker volume prune/i);
  assert.doesNotMatch(cleanupStep, /docker image prune\s+(?:--all|-a)/i);
});
