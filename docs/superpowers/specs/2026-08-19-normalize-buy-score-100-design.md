# Normalize BUY_DCA Score to 100 Design

## Goal

Make `100/100` attainable and meaningful for the Vietnamese physical-gold market while preserving the existing signal classification rules and conservative buy guardrails.

## Decision

Keep the existing signal evaluation order and eligibility conditions. Only the score returned by a matched `BUY_DCA` rule changes from the current 65–78 practical range to a normalized 65–100 opportunity score.

The normalized score is:

```text
score = round(65 + 35 * (
  0.55 * premiumQuality
  + 0.25 * spreadQuality
  + 0.10 * momentumQuality
  + 0.10 * historyQuality
))
```

Inputs are clamped to `[0, 1]`:

- `premiumQuality = clamp((10 - premiumPercentile180d) / 10, 0, 1)`.
- `spreadQuality = clamp((0.04 - spreadPct) / (0.04 - 0.015), 0, 1)`; spread at or below 1.5% is ideal and 4% is zero.
- `momentumQuality` uses the existing 30-day XAU momentum, falling back to 7-day momentum. It is 0 below −8%, rises linearly to 1 at 0%, remains 1 through +2%, falls linearly to 0 at +8%, and is 0 at or above +8%.
- `historyQuality = min(sampleSize / 30, 1)` where sample size means completed Vietnam calendar days with a valid historical metric.

The maximum score is therefore 100 only when the current premium is below all completed 180-day observations (`percentile = 0`), spread is at most 1.5%, momentum is stable or mildly positive (0% to +2%), and at least 30 completed daily samples exist. The existing absolute premium BUY cap of 6%, spread safety boundary, and momentum floor remain unchanged.

## Compatibility

- `AVOID`, `TAKE_PROFIT`, and `HOLD` score formulas remain unchanged.
- `BUY_DCA` matching continues to require the existing adjusted-score floor of 65; the old eligibility calculation remains internal and is no longer the displayed BUY_DCA score.
- Dashboard decision thresholds remain 70 and 40.
- Worker and web use the same daily-distinct history sample semantics so a high-frequency ingestion schedule cannot falsely qualify a score for 100.

## Explanation contract

The BUY_DCA rule trace reports each normalized component, the weighted quality, the final score, and the existing eligibility score/floor. This keeps the score auditable without changing public `SignalOutput` or database schemas.

## Validation

- Domain tests cover each component boundary, exact 100-point conditions, insufficient history, and preservation of BUY_DCA/HOLD signal boundaries.
- Worker tests prove raw intraday metrics collapse to one Vietnam-day sample for scoring.
- Historical replay compares old and new signal identifiers and reports score distribution/range for the 180-day product histories.
- Full workspace typecheck, lint, test, and build run before merge.
