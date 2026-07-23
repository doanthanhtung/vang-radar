# Continuous Spread Scoring Design

## Goal

Remove the abrupt BUY_DCA cutoff at a 3% buy-sell spread while preserving a hard safety boundary for clearly unfavorable physical-gold transaction costs.

## Decision

Keep the existing rule-based signal engine and premium-led base score. Replace the binary `spread <= 3%` BUY_DCA requirement with a continuous spread adjustment:

- Spread up to 3% earns a linearly decreasing bonus from `+8` at 1.5% to `0` at 3%.
- Spread between 3% and 4% receives a linearly increasing penalty from `0` to `-12`.
- Spread at or above 4% triggers AVOID.
- BUY_DCA requires the premium, data-history, and momentum conditions to pass and the adjusted score to remain at least 65.
- BUY_DCA scores are clamped to the 0–100 product-score contract.

The adjustment is:

```text
spread <= 3%:
  min(8, (3% - spread) / 1.5% * 8)

3% < spread < 4%:
  -(spread - 3%) / 1% * 12
```

Spread percentile remains contextual rather than part of the BUY_DCA adjustment because absolute spread is the immediate transaction cost. It still participates in TAKE_PROFIT detection.

## Hot-spread and safety thresholds

- Change AVOID from `spread > 4%` to `spread >= 4%`.
- Change TAKE_PROFIT's absolute hot-spread threshold from 2.8% to 3.5%.
- Change TAKE_PROFIT's historical hot-spread threshold from percentile `> 75` to `>= 80`.

## Explanation contract

The algorithm trace must show:

- The spread adjustment applied to the premium-led base score.
- The adjusted score.
- Whether that score meets the BUY_DCA minimum of 65.

This keeps the detailed analysis page auditable after the formula changes.

## Testing

Add domain-level regression tests proving:

- Exactly 4% spread triggers AVOID.
- BUY_DCA scores decline continuously across 2%, 2.5%, 3%, and 3.5%.
- A mildly wide spread can remain BUY_DCA when premium is exceptionally attractive.
- A marginal premium setup falls back to HOLD when the continuous spread penalty takes the adjusted score below 65.
- TAKE_PROFIT requires either at least 3.5% absolute spread or at least the 80th spread percentile.
- The explanation includes the spread adjustment and adjusted-score threshold.
