# Production Image Retention Design

## Goal

Prevent production deploys from accumulating old Vang Radar application images while preserving fast rollback capability.

## Design

The deploy workflow will run image cleanup only after the new release passes both web and API health checks. Cleanup is scoped to `ghcr.io/doanthanhtung/vang-radar/app` and keeps the three newest locally pulled SHA-tagged images, which represents the active release plus two rollback candidates.

The cleanup step will remove only eligible old image IDs and then run `docker image prune -f` to remove dangling layers. It will not run `docker system prune`, `docker image prune -a`, container cleanup, network cleanup, or volume cleanup. PostgreSQL data and unrelated Docker workloads are therefore outside its scope.

## Failure Handling

Cleanup is best-effort: failure to inspect or remove an old image is emitted as a warning and does not turn an otherwise healthy deploy into a failed release. The workflow prints `docker system df` before and after cleanup for operational visibility.

## Verification

A repository-level Node test verifies that cleanup remains after the health check, retains three images, is repository-scoped, and contains no broad or volume-destructive prune command. GitHub Actions validation and the production deploy health check provide end-to-end verification.
