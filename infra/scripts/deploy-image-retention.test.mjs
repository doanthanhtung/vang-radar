import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../../.github/workflows/deploy.yml", import.meta.url),
  "utf8"
);

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
