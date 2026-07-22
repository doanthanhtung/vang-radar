# Reduce Product Detail Dialog Height

## Goal

Make the product detail popup feel more compact by reducing its maximum viewport height.

## Behavior

- Keep the existing product click behavior on mobile and desktop.
- Keep rendering `ProductDetailDialog`; do not introduce or change routes.
- Reduce the dialog maximum height from `92vh` to `82vh`.
- Preserve the fixed header and the existing scrollable content region so long histories remain accessible.
- Preserve focus trapping, Escape-to-close, backdrop close, and focus restoration.

## Scope

The production change is limited to the dialog height utility in `apps/web/features/market/product-table.tsx`. Existing uncommitted responsive styling in the same file must be preserved.

## Verification

- Add or update a focused regression test that asserts the compact `82vh` dialog height and guards against restoring `92vh`.
- Run the focused test, web typecheck, and production web build.
- Deploy through `infra/scripts/deploy-web.ps1` and verify the local web endpoint returns a successful HTTP status.
