# Decision Engine

The MVP decision engine is deterministic and implemented in `packages/domain`. It does not use AI/LLM calls.

## Signals

- `BUY_DCA`: có thể mua dần
- `HOLD`: tiếp tục giữ
- `AVOID`: nên đứng ngoài, không mua mới
- `TAKE_PROFIT`: cân nhắc chốt lời một phần
- `DATA_UNRELIABLE`: dữ liệu không đủ tin cậy

## Rules

1. Invalid or missing data returns `DATA_UNRELIABLE`.
2. `premium_sell_pct > 0.15`, `spread_pct > 0.05`, or `premium_percentile_180d > 90` returns `AVOID`.
3. Low premium, low spread, and non-negative 30-day XAU momentum returns `BUY_DCA`.
4. High premium, strong domestic 7-day momentum, and high spread returns `TAKE_PROFIT`.
5. Everything else returns `HOLD`.

All reasons are Vietnamese and transparent to users.
