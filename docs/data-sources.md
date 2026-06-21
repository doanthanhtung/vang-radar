# Data Sources

The worker uses provider interfaces so data sources can be swapped without changing domain logic.

## Provider Contract

`DataProvider<T>` exposes `sourceCode` and `fetch()`. Fetch returns `ProviderResult<T>` with:

- `sourceCode`
- `fetchedAt`
- `data`
- `rawPayload`
- `health`
- optional `error`

Raw payloads are stored as JSONB for audit and debugging.

## MVP Providers

- `MockDomesticGoldProvider`
- `MockWorldGoldProvider`
- `MockFxProvider`

## Real Provider Placeholders

- `VietnamGoldApiProvider`
- `GoldApiIoProvider`
- `MetalsDevProvider`
- `FxProvider`

Real providers must use env keys and degrade safely when keys are missing. Scraping must only be implemented when the
source terms permit it. API-based providers are preferred for MVP.

## Data Quality

Invalid records are stored with `is_valid = false`, an `invalid_reason`, and a lower quality score. They are never
silently deleted.
