"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { HelpTooltip } from "../../components/ui/help-tooltip";
import type { MarketSummary } from "../../lib/api-client";
import {
  getApiUrl,
  getGoldPriceHistory,
  getMarketSummary,
  getUsdVndHistory,
  getWorldGoldHistory
} from "../../lib/api-client";
import {
  applyLiveTodayValue,
  buildAverageDailyGoldHistory,
  buildFxDailyHistory,
  buildWorldGoldDailyHistory,
  toVietnamDateKey,
  type FactorHistoryPoint
} from "../../lib/factor-history";
import { formatPercent, formatVnd } from "../../lib/utils";
import {
  average,
  buildScoreExplanation,
  calculateVangScore,
  enrichSummaryProducts,
  getVangDecision,
  toScoreExplanationInput
} from "../../lib/vang-score";
import { ProductTable } from "./product-table";
import { ScoreExplanationCard } from "./score-explanation";

const SUMMARY_POLL_FALLBACK_MS = 60_000;
const STALE_AFTER_MS = 20 * 60 * 1000;
type ExpandedFactor = "xau" | "usd" | "premium" | "spread";
type FactorHistoryFormat = "usd" | "vnd" | "percent";

export function LiveMarketDashboard({ initialSummary }: { initialSummary: MarketSummary }) {
  const [summary, setSummary] = useState(initialSummary);
  const [expandedFactor, setExpandedFactor] = useState<ExpandedFactor | null>(null);
  const [factorHistory, setFactorHistory] = useState<Partial<Record<ExpandedFactor, FactorHistoryPoint[]>>>(
    {}
  );
  const [factorHistoryError, setFactorHistoryError] = useState<ExpandedFactor | null>(null);
  const [factorHistoryLoading, setFactorHistoryLoading] = useState<ExpandedFactor | null>(null);

  const refreshSummary = useCallback(async () => setSummary(await getMarketSummary()), []);

  useEffect(() => setSummary(initialSummary), [initialSummary]);

  useEffect(() => {
    const events = new EventSource(getApiUrl("/market/summary/stream"));
    events.addEventListener("summary", (event) => {
      try {
        setSummary(JSON.parse(event.data) as MarketSummary);
      } catch {}
    });
    const pollFallback = setInterval(
      () => void refreshSummary().catch(() => undefined),
      SUMMARY_POLL_FALLBACK_MS
    );
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") void refreshSummary().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => {
      events.close();
      clearInterval(pollFallback);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, [refreshSummary]);

  const liveProducts = useMemo(() => enrichSummaryProducts(summary), [summary]);
  const averagePremium = useMemo(
    () => average(liveProducts.map((item) => item.premiumSellPct)),
    [liveProducts]
  );
  const averageSpread = useMemo(
    () => average(liveProducts.map((item) => item.spreadPct)),
    [liveProducts]
  );
  const vangScore = useMemo(
    () => calculateVangScore(liveProducts.map((item) => item.score)),
    [liveProducts]
  );
  const averageSell = useMemo(
    () => average(liveProducts.map((item) => item.sellPrice)),
    [liveProducts]
  );
  const priceGap = averageSell - summary.world.worldVndPerLuong;
  const isDataReady =
    summary.products.length > 0 && summary.world.xauUsdPerOz > 0 && summary.world.usdVnd > 0;
  const isStale = Date.now() - new Date(summary.time).getTime() > STALE_AFTER_MS;
  const decision = getVangDecision(isDataReady, vangScore, priceGap, averagePremium);
  const scoreExplanation = useMemo(() => {
    const dojiProduct = liveProducts.find((product) => product.code === "DOJI_RING_9999");
    if (!isDataReady || !dojiProduct) return buildScoreExplanation(null);

    return buildScoreExplanation(toScoreExplanationInput(dojiProduct, summary.world));
  }, [liveProducts, summary.world, isDataReady]);

  const productCodes = useMemo(
    () => liveProducts.map((product) => product.code),
    [liveProducts]
  );
  const todayKey = useMemo(() => toVietnamDateKey(summary.time), [summary.time]);

  const liveFactorValues = useMemo(
    (): Record<ExpandedFactor, number | null> => ({
      xau: summary.world.xauUsdPerOz > 0 ? summary.world.xauUsdPerOz : null,
      usd: summary.world.usdVnd > 0 ? summary.world.usdVnd : null,
      premium: Number.isFinite(averagePremium) ? averagePremium : null,
      spread: Number.isFinite(averageSpread) ? averageSpread : null
    }),
    [summary.world.xauUsdPerOz, summary.world.usdVnd, averagePremium, averageSpread]
  );

  const displayedFactorHistory = useMemo(() => {
    if (!expandedFactor) return null;
    const cached = factorHistory[expandedFactor];
    if (!cached) return null;
    return applyLiveTodayValue(cached, todayKey, liveFactorValues[expandedFactor]);
  }, [expandedFactor, factorHistory, todayKey, liveFactorValues]);

  useEffect(() => {
    setFactorHistory({});
  }, [todayKey]);

  const loadFactorHistory = useCallback(
    async (factor: ExpandedFactor) => {
      setFactorHistoryError(null);
      setFactorHistoryLoading(factor);
      try {
        if (factor === "xau") {
          const points = await getWorldGoldHistory(7);
          setFactorHistory((current) => ({
            ...current,
            xau: buildWorldGoldDailyHistory(points)
          }));
        } else if (factor === "usd") {
          const points = await getUsdVndHistory(7);
          setFactorHistory((current) => ({
            ...current,
            usd: buildFxDailyHistory(points)
          }));
        } else {
          const histories = await Promise.all(
            productCodes.map((code) => getGoldPriceHistory(code, 7))
          );
          setFactorHistory((current) => ({
            ...current,
            [factor]: buildAverageDailyGoldHistory(
              histories,
              factor === "premium" ? "premiumPercent" : "spreadPercent"
            )
          }));
        }
      } catch {
        setFactorHistoryError(factor);
      } finally {
        setFactorHistoryLoading(null);
      }
    },
    [productCodes]
  );

  const toggleFactor = (factor: ExpandedFactor) => {
    const next = expandedFactor === factor ? null : factor;
    setExpandedFactor(next);
    if (next && !factorHistory[next]) void loadFactorHistory(next);
  };

  return (
    <main id="main-content" className="pb-10">
      <section className="dashboard-visual">
        <div className="mx-auto max-w-4xl px-4 py-10 text-center text-white md:py-14">
          <p className="text-sm font-medium uppercase tracking-wide text-white/75">
            Hôm nay có nên mua vàng không?
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gold md:text-6xl">
            {decision.title}
          </h1>
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="text-sm text-white/75">VangScore</span>
            <strong className="rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-lg text-gold">
              {decision.score === null ? "—" : `${decision.score}/100`}
            </strong>
            <HelpTooltip text="VangScore là trung bình điểm tín hiệu của các sản phẩm (0–100). Điểm càng cao nghĩa là điều kiện mua hiện tại càng thuận lợi." />
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/90 md:text-lg">
            {decision.reason}
          </p>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-white/70">
            Gợi ý: {decision.action}
          </p>
          <div className="mx-auto mt-7 grid max-w-2xl grid-cols-1 divide-y divide-white/20 overflow-hidden rounded-xl border border-white/20 bg-slate-950/20 text-left sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <QuickMetric
              label="Premium TB"
              value={formatPercent(averagePremium)}
              help="Vàng trong nước đang cao hoặc thấp hơn giá thế giới quy đổi."
            />
            <QuickMetric
              label="Spread TB"
              value={formatPercent(averageSpread)}
              help="Chênh lệch giữa giá bán ra và mua vào; spread càng cao thì mua xong bán lại càng thiệt."
            />
            <QuickMetric
              label="Chênh với thế giới"
              value={isDataReady ? formatVnd(priceGap) : "—"}
            />
          </div>
          <p className="mt-5 text-xs text-white/65">
            Cập nhật lúc {formatVietnamTime(summary.time)}
          </p>
          {isStale ? <p className="mt-2 text-xs text-amber-200">Dữ liệu có thể chưa mới.</p> : null}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pt-6">
        <Card className="bg-panel/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Các yếu tố ảnh hưởng</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <ExpandableFactor
                label="XAU/USD"
                value={
                  summary.world.xauUsdPerOz
                    ? `$${summary.world.xauUsdPerOz.toLocaleString("en-US")}`
                    : "—"
                }
                expanded={expandedFactor === "xau"}
                onToggle={() => toggleFactor("xau")}
              />
              <ExpandableFactor
                label="USD/VND"
                value={summary.world.usdVnd ? summary.world.usdVnd.toLocaleString("vi-VN") : "—"}
                expanded={expandedFactor === "usd"}
                onToggle={() => toggleFactor("usd")}
              />
              <ExpandableFactor
                label="Premium TB"
                value={formatPercent(averagePremium)}
                expanded={expandedFactor === "premium"}
                onToggle={() => toggleFactor("premium")}
              />
              <ExpandableFactor
                label="Spread TB"
                value={formatPercent(averageSpread)}
                expanded={expandedFactor === "spread"}
                onToggle={() => toggleFactor("spread")}
              />
            </div>
            {expandedFactor ? (
              <div className="mt-3 border-t border-border pt-3">
                <FactorHistoryTable
                  points={displayedFactorHistory}
                  format={
                    expandedFactor === "xau"
                      ? "usd"
                      : expandedFactor === "usd"
                        ? "vnd"
                        : "percent"
                  }
                  loading={factorHistoryLoading === expandedFactor}
                  error={factorHistoryError === expandedFactor}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-6">
        <ScoreExplanationCard
          key={`${scoreExplanation.score ?? "na"}-${scoreExplanation.signal ?? "na"}-${summary.time}`}
          explanation={scoreExplanation}
        />
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-6">
        <Card className="bg-panel/80">
          <CardHeader>
            <CardTitle>Giá bán theo sản phẩm</CardTitle>
          </CardHeader>
          <CardContent>
            <ProductTable products={liveProducts} asOf={summary.time} />
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-5xl px-4 pt-6">
        <details className="text-sm text-muted">
          <summary className="cursor-pointer font-medium text-foreground">
            Xem cách tính & nguồn dữ liệu
          </summary>
          <div className="mt-3 space-y-2 leading-6">
            <p>Nguồn giá vàng: bảng giá niêm yết từ các thương hiệu vàng trong nước.</p>
            <p>
              Premium = giá bán trong nước / giá thế giới quy đổi − 1. Spread = (giá bán − giá mua)
              / giá bán.
            </p>
            <p>
              VangScore = trung bình điểm tín hiệu của từng sản phẩm. Điểm từng sản phẩm do engine
              quy tắc gán theo premium, spread, percentile lịch sử và momentum (không dùng AI).
            </p>
          </div>
        </details>
      </section>
    </main>
  );
}

function FactorHistoryTable({
  points,
  format,
  loading,
  error
}: {
  points: FactorHistoryPoint[] | null;
  format: FactorHistoryFormat;
  loading: boolean;
  error: boolean;
}) {
  if (error) {
    return (
      <p className="text-sm text-muted">Chưa thể tải dữ liệu lịch sử. Vui lòng thử lại sau.</p>
    );
  }

  if (loading || !points) {
    return <div className="h-40 animate-pulse rounded-md bg-background" />;
  }

  if (points.length === 0) {
    return <p className="text-sm text-muted">Chưa có dữ liệu lịch sử.</p>;
  }

  const newestFirstPoints = [...points].reverse();

  return (
    <div className="space-y-3">
      <FactorSparkline points={points} />
      <div className="overflow-hidden rounded-md border border-border/60">
      <table className="w-full table-fixed text-sm">
        <thead className="bg-background">
          <tr className="border-b border-border/60 text-xs text-muted">
            <th className="w-[42%] px-3 py-2 text-left font-medium">Ngày</th>
            <th className="w-[33%] px-3 py-2 text-right font-medium">Giá trị</th>
            <th className="w-[25%] px-3 py-2 text-right font-medium">
              {format === "percent" ? "Biến đổi (pp)" : "Biến đổi"}
            </th>
          </tr>
        </thead>
        <tbody>
          {newestFirstPoints.map((point) => (
            <tr key={point.date} className="border-b border-border/50 last:border-b-0">
              <td className="px-3 py-2 text-muted">{formatHistoryDate(point.date)}</td>
              <td className="px-3 py-2 text-right font-medium text-foreground">
                {formatHistoryValue(point.value, format)}
              </td>
              <td
                className={`px-3 py-2 text-right text-xs font-medium ${historyChangeClass(point.change)}`}
              >
                {formatHistoryChange(point.change, format)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function QuickMetric({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help?: string;
}) {
  return (
    <div className="min-w-0 px-3 py-3 sm:px-5">
      <div className="flex items-center gap-1 text-xs text-white/70">
        {label}
        {help ? <HelpTooltip text={help} /> : null}
      </div>
      <div className="mt-1 break-words text-base font-semibold tabular-nums sm:text-xl">{value}</div>
    </div>
  );
}
function ExpandableFactor({
  label,
  value,
  expanded,
  onToggle
}: {
  label: string;
  value: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = expanded ? ChevronUp : ChevronDown;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="rounded-lg bg-background/85 p-3 text-left transition duration-200 hover:bg-white/[0.06] active:scale-[0.98]"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted">{label}</div>
        <Icon className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
      </div>
      <div className="mt-1 font-medium text-foreground">{value}</div>
    </button>
  );
}

function formatHistoryDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function formatHistoryValue(value: number, format: FactorHistoryFormat): string {
  if (format === "usd") {
    return `$${value.toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })}`;
  }

  if (format === "vnd") {
    return value.toLocaleString("vi-VN", { maximumFractionDigits: 0 });
  }

  return formatPercent(value);
}

function formatHistoryChange(change: number | null, format: FactorHistoryFormat): string {
  if (change === null || change === 0) return "—";

  if (format === "usd") {
    return `${change > 0 ? "+" : "−"}${Math.abs(change).toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })}`;
  }

  if (format === "vnd") {
    return `${change > 0 ? "+" : "−"}${Math.abs(change).toLocaleString("vi-VN", {
      maximumFractionDigits: 0
    })}`;
  }

  const sign = change > 0 ? "+" : "−";
  return `${sign}${formatPercent(Math.abs(change))}`;
}

function historyChangeClass(change: number | null): string {
  if (change === null || change === 0) return "text-muted";
  return change > 0 ? "text-positive" : "text-red-400";
}
function FactorSparkline({ points }: { points: FactorHistoryPoint[] }) {
  const firstPoint = points[0]!;
  const lastPoint = points[points.length - 1]!;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coordinates = values
    .map((value, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 78 - 11;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="overflow-hidden rounded-md border border-border/60 bg-background/50 px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
        <span>Xu hướng 7 ngày</span>
        <span className="tabular-nums">{formatHistoryDate(firstPoint.date)} — {formatHistoryDate(lastPoint.date)}</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-16 w-full" role="img" aria-label="Biểu đồ xu hướng 7 ngày">
        <defs>
          <linearGradient id="factor-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#facc15" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,100 ${coordinates} 100,100`} fill="url(#factor-fill)" />
        <polyline points={coordinates} fill="none" stroke="#facc15" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
function formatVietnamTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date(value));
}
