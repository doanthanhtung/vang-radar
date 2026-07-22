# Direct Product Analysis Navigation

## Goal

When a user selects a gold product from the market table or mobile cards, navigate directly to that product's 180-day analysis page instead of opening the seven-day history dialog.

## Interaction

- Every product card on mobile links to `/gold/<productCode>`.
- Every product row on desktop links to the same route when the row or product-name control is activated.
- Navigation stays in the current tab so the existing “Quay lại bảng giá” link and browser Back action return users to the comparison table.
- Product prices, premium, spread, score, ordering, and responsive layouts remain unchanged.

## Removed behavior

- Do not open `ProductDetailDialog`.
- Do not fetch `/gold-prices/history` from the product table.
- Remove dialog-only state, focus trapping, retry handling, seven-day chart rendering, and experimental-plan rendering from `ProductTable`.
- Keep the standalone seven-day history API/component available because this change only removes it from the product-click flow.

## Accessibility

- Product navigation is represented by links rather than buttons that claim to open a dialog.
- Remove `aria-haspopup="dialog"`, dialog-control attributes, selection state, and dialog focus-management behavior.
- Preserve a clear accessible label for each product destination.

## Testing

- Add a regression test proving product destinations use `/gold/${product.code}`.
- Assert the product table no longer references the dialog, seven-day history fetch, or dialog ARIA semantics.
- Run web tests, typecheck, lint, and production build.
