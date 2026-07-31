"""HTML report generation for Phase 3."""

from __future__ import annotations

from pathlib import Path

import pandas as pd


def build_report(output_dir: Path) -> Path:
    data_summary = (output_dir / "data_summary.json").read_text(encoding="utf-8") if (output_dir / "data_summary.json").exists() else "{}"
    benchmark = _table(output_dir / "benchmark_clean_comparison.csv", ["strategy", "cagr", "max_drawdown", "sortino_ratio", "calmar_ratio", "number_of_trades"])
    final = _table(output_dir / "final_recommendations.csv", ["strategy", "final_score", "balanced_score", "robustness_score", "regime_stability_score", "parameter_stability_score", "cagr", "max_drawdown", "number_of_trades"])
    robustness = _table(output_dir / "robustness_summary.csv", ["strategy", "robustness_score", "fee_x3_pass", "slippage_x3_pass", "delay_t2_pass", "spread_plus_50_pass", "robustness_failure_flag"])
    regime = _table(output_dir / "regime_summary.csv", ["strategy", "worst_regime", "best_regime", "regime_concentration", "regime_concentration_flag"])
    current = _table(output_dir / "compare_current_engine.csv", ["strategy", "signal_coverage_pct", "valid_signal_days", "buy_signal_days", "status", "warning"])
    html = f"""
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>VangScore Phase 3 Backtest Report</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 32px; color: #1f2937; }}
    h1, h2 {{ color: #111827; }}
    table {{ border-collapse: collapse; width: 100%; margin: 12px 0 28px; font-size: 12px; }}
    th, td {{ border: 1px solid #d1d5db; padding: 6px; text-align: right; }}
    th:first-child, td:first-child {{ text-align: left; }}
    pre {{ background: #f3f4f6; padding: 12px; overflow: auto; }}
    .warning {{ color: #991b1b; font-weight: bold; }}
  </style>
</head>
<body>
  <h1>VangScore Phase 3 Backtest Report</h1>
  <h2>Executive Summary</h2>
  <p>This report reviews Phase 3 robustness and regime behavior for top rule-based candidates. Candidate engine remains disabled by default. No production scoring was changed.</p>
  <pre>{data_summary}</pre>
  <h2>Benchmark Comparison</h2>{benchmark}
  <h2>Charts</h2>
  <h3>Equity Curve</h3>{_equity_chart(output_dir / "equity_curve.csv")}
  <h3>Drawdown Curve</h3>{_drawdown_chart(output_dir / "equity_curve.csv")}
  <h3>Robustness Stress CAGR</h3>{_stress_chart(output_dir / "stress_test_results.csv")}
  <h2>Current VangScore Engine Coverage</h2><p class="warning">Historical current_signal coverage may be insufficient for ranking.</p>{current}
  <h2>Final Recommendations</h2>{final}
  <h2>Robustness</h2>{robustness}
  <h2>Regime Analysis</h2>{regime}
  <h2>Trade Analysis</h2>{_reason_breakdown(output_dir / "trades.csv")}
  <h2>Final Recommendation Notes</h2>
  <p>Review top candidates manually in Phase 3 output CSVs before any production promotion. Monitor spread regime, premium regime, rebalance count, and delay sensitivity.</p>
</body>
</html>
"""
    path = output_dir / "report.html"
    path.write_text(html, encoding="utf-8")
    return path


def _table(path: Path, columns: list[str]) -> str:
    if not path.exists():
        return "<p>Not available.</p>"
    df = pd.read_csv(path)
    if df.empty:
        return "<p>No rows.</p>"
    cols = [col for col in columns if col in df.columns]
    return df[cols].head(20).to_html(index=False, escape=True)


def _reason_breakdown(path: Path) -> str:
    if not path.exists():
        return "<p>No trades.</p>"
    trades = pd.read_csv(path)
    if trades.empty or "reason" not in trades:
        return "<p>No trades.</p>"
    table = trades["reason"].value_counts().head(20).reset_index()
    table.columns = ["reason", "count"]
    return table.to_html(index=False, escape=True)


def _equity_chart(path: Path) -> str:
    if not path.exists():
        return "<p>No equity data.</p>"
    df = pd.read_csv(path, parse_dates=["date"])
    strategies = [s for s in ["buy_and_hold_pure", "monthly_dca_pure", "buy_and_hold_capped", "monthly_dca_capped"] if s in set(df["strategy"])]
    strategies += [s for s in df["strategy"].drop_duplicates().tolist() if str(s).startswith("drawdown_ladder")][:3]
    return _line_svg(df, strategies[:6], "equity")


def _drawdown_chart(path: Path) -> str:
    if not path.exists():
        return "<p>No drawdown data.</p>"
    df = pd.read_csv(path, parse_dates=["date"])
    strategies = [s for s in ["buy_and_hold_pure", "monthly_dca_pure", "buy_and_hold_capped", "monthly_dca_capped"] if s in set(df["strategy"])]
    strategies += [s for s in df["strategy"].drop_duplicates().tolist() if str(s).startswith("drawdown_ladder")][:3]
    return _line_svg(df, strategies[:6], "drawdown")


def _line_svg(df: pd.DataFrame, strategies: list[str], value_col: str) -> str:
    if not strategies or value_col not in df.columns:
        return "<p>No chart data.</p>"
    width, height = 900, 260
    colors = ["#111827", "#2563eb", "#059669", "#dc2626", "#7c3aed", "#ea580c"]
    sub = df[df["strategy"].isin(strategies)].copy()
    if sub.empty:
        return "<p>No chart data.</p>"
    x_min, x_max = sub["date"].min(), sub["date"].max()
    y_min, y_max = float(sub[value_col].min()), float(sub[value_col].max())
    if y_min == y_max:
        y_min -= 1
        y_max += 1
    lines = []
    labels = []
    for idx, strategy in enumerate(strategies):
        g = sub[sub["strategy"] == strategy].sort_values("date")
        if len(g) > 600:
            g = g.iloc[:: max(1, len(g) // 600)]
        points = []
        for _, row in g.iterrows():
            x = 40 + (pd.Timestamp(row["date"]) - x_min).days / max(1, (x_max - x_min).days) * (width - 70)
            y = 20 + (1 - (float(row[value_col]) - y_min) / (y_max - y_min)) * (height - 50)
            points.append(f"{x:.1f},{y:.1f}")
        color = colors[idx % len(colors)]
        lines.append(f'<polyline fill="none" stroke="{color}" stroke-width="1.6" points="{" ".join(points)}" />')
        labels.append(f'<span style="color:{color}">{strategy[:80]}</span>')
    return f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img">{"".join(lines)}</svg><div>{"<br/>".join(labels)}</div>'


def _stress_chart(path: Path) -> str:
    if not path.exists():
        return "<p>No stress data.</p>"
    df = pd.read_csv(path)
    if df.empty or "test_type" not in df or "cagr" not in df:
        return "<p>No stress data.</p>"
    grouped = df.groupby("test_type")["cagr"].mean().sort_values(ascending=False)
    width, height = 700, 240
    max_val = max(0.001, float(grouped.max()))
    bars = []
    for i, (label, value) in enumerate(grouped.items()):
        bar_w = float(value) / max_val * (width - 180)
        y = 20 + i * 28
        bars.append(f'<text x="10" y="{y+14}" font-size="12">{label}</text><rect x="150" y="{y}" width="{bar_w:.1f}" height="18" fill="#2563eb"/><text x="{155+bar_w:.1f}" y="{y+14}" font-size="12">{value:.2%}</text>')
    return f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}">{"".join(bars)}</svg>'
