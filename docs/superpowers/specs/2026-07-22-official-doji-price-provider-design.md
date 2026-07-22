# Official DOJI Price Provider

## Goal

Use DOJI's official public price feed as the primary source for `DOJI_RING_9999`, while retaining the existing aggregator quote as a resilient fallback.

## Official source

- Public page: `https://banggia.doji.vn/doji`
- Public endpoint used by that page: `https://banggia.doji.vn/api/TablePrice/GetTablePrice`
- Target record: `materialCode = "03"`, `materialName = "NHẪN TRÒN 9999 HƯNG THỊNH VƯỢNG"`
- Price fields: `priceDojiBuyIn` and `priceDojiSellOut`
- Source timestamp: `updateDate`
- Source code persisted in Vang Radar: `DOJI_OFFICIAL`

The endpoint wraps its payload in an AES-256-CBC encrypted Base64 string. The official frontend publishes the decryption algorithm and key. The first 16 decoded bytes are the IV and the remaining bytes are PKCS#7-padded ciphertext.

## Price conversion

DOJI publishes the target record in thousands of VND per `chi`. Vang Radar stores VND per `luong`.

```text
stored VND/luong = official value × 1,000 VND × 10 chi/luong
                  = official value × 10,000
```

For example, `14,200` becomes `142,000,000 VND/luong`.

## Provider design

Add a focused `DojiOfficialGoldProvider` beside the existing domestic-gold provider. It will:

1. Fetch the official endpoint with JSON acceptance and the existing worker user agent.
2. Require a successful HTTP response and a response envelope whose `status` is `true` and `data` is a non-empty string.
3. Decrypt and parse the payload.
4. Select the active gold record with `materialCode = "03"`.
5. Validate positive buy/sell values and a parseable `updateDate`.
6. Return one `DomesticGoldQuote` for `DOJI_RING_9999`, converted to VND per `luong`, with `sourceCode = "DOJI_OFFICIAL"` and `quotedAt = updateDate`.
7. Return a degraded result with no quote when any fetch, envelope, decryption, parsing, record, price, or timestamp requirement fails.

The decryption function and response-to-quote parser will be exported as pure functions so their behavior can be tested without network access.

## Ingestion and fallback

`fetchDomesticGold` will fetch the existing Vietnam-wide provider and the official DOJI provider independently.

- When the official DOJI quote succeeds, remove only the aggregator's `DOJI_RING_9999` quote and replace it with the official quote.
- When the official DOJI quote fails, preserve the aggregator DOJI quote unchanged as fallback.
- SJC, PNJ, and BTMC selection remains unchanged.
- A failure of the official DOJI endpoint must not abort ingestion for the other products.

The persisted source ID is selected from `quote.sourceCode`, so successful official quotes are stored under `DOJI_OFFICIAL`; fallback quotes remain attributable to their aggregator source.

## Freshness and data integrity

- Use DOJI's `updateDate`; do not substitute the worker fetch time for successful official quotes.
- Existing domestic quote validation continues to check price plausibility and change bounds.
- Do not write an official quote when its timestamp or prices are invalid.
- Existing upsert uniqueness on product, source, and time prevents duplicate official rows for an unchanged source timestamp.

## Tests

Add worker tests that first fail against the current code and cover:

- AES payload decryption using a deterministic encrypted fixture.
- Selection of `materialCode = "03"` while ignoring other records.
- Conversion from thousands of VND per `chi` to VND per `luong`.
- Preservation of the official `updateDate`.
- A degraded result for malformed or missing target data.
- Official DOJI replacement when the official quote succeeds.
- Aggregator fallback when the official quote is unavailable.

## Deployment verification

1. Run the focused worker tests, worker typecheck, full test suite, and production build.
2. Build a production image containing the provider change.
3. Recreate only the worker service with that image unless another service must change.
4. Trigger or wait for domestic ingestion.
5. Verify a valid `domestic_gold_prices` row for `DOJI_RING_9999` with source `DOJI_OFFICIAL`, official timestamp, and expected converted prices.
6. Verify the latest metric/API summary adopts the official price after the calculation and signal jobs run.
