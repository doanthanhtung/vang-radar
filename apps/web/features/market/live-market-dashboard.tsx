"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Clock3, Database, Gauge, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { HelpTooltip } from "../../components/ui/help-tooltip";
import type { MarketSummary } from "../../lib/api-client";
import {
  getApiUrl,
  getDxyHistory,
  getMarketSummary,
  getUsdVndHistory,
  getWorldGoldHistory
} from "../../lib/api-client";
import {
  applyLiveTodayValue,
  buildDxyDailyHistory,
  buildFxDailyHistory,
  buildWorldGoldDailyHistory,
  toVietnamDateKey,
  type FactorHistoryPoint
} from "../../lib/factor-history";
import { cn, formatPercent, formatVnd } from "../../lib/utils";
import {
  average,
  calculateVangScore,
  enrichSummaryProducts,
  getVangDecision
} from "../../lib/vang-score";
import { ProductTable } from "./product-table";

const SUMMARY_POLL_FALLBACK_MS = 60_000;
const STALE_AFTER_MS = 20 * 60 * 1000;
type ExpandedFactor = "xau" | "dxy" | "usd";
type FactorHistoryFormat = "usd" | "vnd" | "money" | "percent" | "index";

export function LiveMarketDashboard({ initialSummary }: { initialSummary: MarketSummary }) {
  const [summary, setSummary] = useState(initialSummary);
  const [expandedFactor, setExpandedFactor] = useState<ExpandedFactor | null>(null);
  const [factorHistory, setFactorHistory] = useState<
    Partial<Record<ExpandedFactor, FactorHistoryPoint[]>>
  >({});
  const [factorHistoryError, setFactorHistoryError] = useState<ExpandedFactor | null>(null);
  const [factorHistoryLoading, setFactorHistoryLoading] = useState<ExpandedFactor | null>(null);
  const prefetchedFactorKeyRef = useRef<string | null>(null);

  const refreshSummary = useCallback(async () => setSummary(await getMarketSummary()), []);

  useEffect(() => setSummary(initialSummary), [initialSummary]);

  useEffect(() => {
    const streamUrl = getApiUrl("/market/summary/stream");
    let events: EventSource | null = null;
    if (new URL(streamUrl, window.location.origin).origin === window.location.origin) {
      events = new EventSource(streamUrl);
      events.addEventListener("summary", (event) => {
        try {
          setSummary(JSON.parse(event.data) as MarketSummary);
        } catch {}
      });
    }
    const pollFallback = setInterval(
      () => void refreshSummary().catch(() => undefined),
      SUMMARY_POLL_FALLBACK_MS
    );
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") void refreshSummary().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => {
      events?.close();
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
  const averageSpreadAbs = useMemo(
    () => average(liveProducts.map((item) => item.spreadAbsVnd)),
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
  const todayKey = useMemo(() => toVietnamDateKey(summary.time), [summary.time]);

  const liveFactorValues = useMemo(
    (): Record<ExpandedFactor, number | null> => ({
      xau: summary.world.xauUsdPerOz > 0 ? summary.world.xauUsdPerOz : null,
      // DXY is an end-of-session macro series; do not copy an older close into today's row.
      dxy: null,
      usd: summary.world.usdVnd > 0 ? summary.world.usdVnd : null
    }),
    [summary.world.xauUsdPerOz, summary.world.usdVnd]
  );

  const displayedFactorHistory = useMemo(() => {
    if (!expandedFactor) return null;
    const cached = factorHistory[expandedFactor];
    if (!cached) return null;
    return applyLiveTodayValue(cached, todayKey, liveFactorValues[expandedFactor]);
  }, [expandedFactor, factorHistory, todayKey, liveFactorValues]);
  const factorIndicatorHistory = useMemo(
    () =>
      (["xau", "usd", "dxy"] as const).reduce(
        (accumulator, factor) => {
          const cached = factorHistory[factor];
          accumulator[factor] = cached
            ? applyLiveTodayValue(cached, todayKey, liveFactorValues[factor])
            : null;
          return accumulator;
        },
        {} as Record<ExpandedFactor, FactorHistoryPoint[] | null>
      ),
    [factorHistory, todayKey, liveFactorValues]
  );

  useEffect(() => {
    setFactorHistory({});
  }, [todayKey]);

  const fetchFactorHistory = useCallback(
    async (factor: ExpandedFactor): Promise<FactorHistoryPoint[]> => {
      if (factor === "xau") {
        return buildWorldGoldDailyHistory(await getWorldGoldHistory(7));
      }

      if (factor === "dxy") {
        return buildDxyDailyHistory(await getDxyHistory(7));
      }

      if (factor === "usd") {
        return buildFxDailyHistory(await getUsdVndHistory(7));
      }

      return buildFxDailyHistory(await getUsdVndHistory(7));
    },
    []
  );

  const loadFactorHistory = useCallback(
    async (factor: ExpandedFactor) => {
      setFactorHistoryError(null);
      setFactorHistoryLoading(factor);
      try {
        const points = await fetchFactorHistory(factor);
        setFactorHistory((current) => ({ ...current, [factor]: points }));
      } catch {
        setFactorHistoryError(factor);
      } finally {
        setFactorHistoryLoading(null);
      }
    },
    [fetchFactorHistory]
  );

  useEffect(() => {
    const prefetchKey = todayKey;
    if (!isDataReady || prefetchedFactorKeyRef.current === prefetchKey) {
      return;
    }

    prefetchedFactorKeyRef.current = prefetchKey;
    const timeout = window.setTimeout(() => {
      const factors: ExpandedFactor[] = ["xau", "usd", "dxy"];
      void Promise.allSettled(
        factors.map(async (factor) => {
          const points = await fetchFactorHistory(factor);
          setFactorHistory((current) =>
            current[factor] ? current : { ...current, [factor]: points }
          );
        })
      );
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [fetchFactorHistory, isDataReady, todayKey]);

  const toggleFactor = (factor: ExpandedFactor) => {
    const next = expandedFactor === factor ? null : factor;
    setExpandedFactor(next);
    if (next && !factorHistory[next]) void loadFactorHistory(next);
  };

  return (
    <main id="main-content" tabIndex={-1} className="pb-12">
      <section className="dashboard-visual">
        <div className="mx-auto max-w-7xl px-4 pb-12 pt-8 text-white md:pb-14 md:pt-12">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-md border border-white/[0.12] bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
              <Activity className="h-3.5 w-3.5 text-gold" aria-hidden />
              Dashboard nghiên cứu giá vàng
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-3">
              <h1 className="text-4xl font-semibold leading-[0.98] tracking-tight text-foreground md:text-6xl">
                {decision.title}
              </h1>
              <div className="flex items-center gap-2 rounded-md border border-gold/25 bg-gold/[0.08] px-3 py-2">
                <span className="text-xs font-medium text-muted">VangScore</span>
                <strong className="text-xl font-semibold tracking-tight text-gold">
                  {decision.score === null ? "—" : decision.score}
                  <span className="ml-1 text-xs font-medium text-muted">/100</span>
                </strong>
                <HelpTooltip text="VangScore là trung bình điểm tín hiệu của các sản phẩm (0–100). Điểm càng cao nghĩa là điều kiện mua hiện tại càng thuận lợi." />
              </div>
            </div>
            <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-slate-200 md:text-lg">
              {isDataReady ? decision.action : decision.reason}
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-slate-950/35 px-2.5 py-1.5">
                <Clock3 className="h-3.5 w-3.5 text-gold" aria-hidden />
                Cập nhật {formatVietnamTime(summary.time)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-slate-950/35 px-2.5 py-1.5">
                <Database className="h-3.5 w-3.5 text-gold" aria-hidden />
                {liveProducts.length} sản phẩm theo dõi
              </span>
              {isStale ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-300/30 bg-amber-300/10 px-2.5 py-1.5 text-amber-100">
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                  Dữ liệu có thể chưa mới
                </span>
              ) : null}
            </div>
            <div className="mt-6 grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-3">
              <SummaryMetric label="Chênh lệch" value={formatVndSafe(priceGap)} tone="warn" />
              <SummaryMetric label="Premium TB" value={formatPercent(averagePremium)} tone="warn" />
              <SummaryMetric
                label="Spread TB"
                value={formatVndSafe(averageSpreadAbs)}
                meta={formatPercent(averageSpread)}
                className="col-span-2 sm:col-span-1"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-4 pb-6 pt-6">
        <div className="mb-4 flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Bảng so sánh sản phẩm
          </h2>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs text-muted">
            <Gauge className="h-3.5 w-3.5 text-gold" aria-hidden />
            Sắp xếp theo điểm từ cao xuống
          </span>
        </div>
        <ProductTable products={liveProducts} asOf={summary.time} />
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-6 pt-2">
        <Card>
          <CardHeader className="flex flex-col gap-1 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
            <CardTitle>Bối cảnh thị trường</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:gap-3">
              <IndicatorFactor
                label="XAU/USD"
                value={
                  summary.world.xauUsdPerOz
                    ? `$${summary.world.xauUsdPerOz.toLocaleString("en-US")}`
                    : "—"
                }
                delta={getLatestFactorChange(factorIndicatorHistory.xau)}
                format="usd"
                expanded={expandedFactor === "xau"}
                onToggle={() => toggleFactor("xau")}
              />
              <IndicatorFactor
                label="USD/VND"
                value={summary.world.usdVnd ? summary.world.usdVnd.toLocaleString("vi-VN") : "—"}
                delta={getLatestFactorChange(factorIndicatorHistory.usd)}
                format="vnd"
                expanded={expandedFactor === "usd"}
                onToggle={() => toggleFactor("usd")}
              />
              <IndicatorFactor
                label="DXY"
                value={
                  summary.macro.dxy?.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  }) ?? "—"
                }
                delta={getLatestFactorChange(factorIndicatorHistory.dxy)}
                format="index"
                expanded={expandedFactor === "dxy"}
                onToggle={() => toggleFactor("dxy")}
              />
            </div>
            {expandedFactor ? (
              <div className="mt-3 border-t border-border pt-3">
                <FactorHistoryTable
                  points={displayedFactorHistory}
                  format={
                    expandedFactor === "xau" ? "usd" : expandedFactor === "dxy" ? "index" : "vnd"
                  }
                  loading={factorHistoryLoading === expandedFactor}
                  error={factorHistoryError === expandedFactor}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function SummaryMetric({
  label,
  value,
  meta,
  className,
  tone = "default"
}: {
  label: string;
  value: string;
  meta?: string;
  className?: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className={cn("metric-panel rounded-md px-3 py-2.5", className)}>
      <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 truncate text-sm font-semibold text-foreground",
          tone === "warn" && "text-gold"
        )}
        title={value}
      >
        {value}
      </div>
      {meta ? <div className="mt-0.5 text-[11px] font-medium text-muted">{meta}</div> : null}
    </div>
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
              <th className="w-[25%] px-3 py-2 text-right font-medium">Biến đổi</th>
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

function IndicatorFactor({
  label,
  value,
  meta,
  delta,
  format,
  expanded,
  onToggle
}: {
  label: string;
  value: string;
  meta?: string;
  delta: number | null | undefined;
  format: FactorHistoryFormat;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={cn(
        "metric-panel min-h-[5.25rem] rounded-md p-2.5 text-left transition duration-200 hover:border-gold/30 hover:bg-white/[0.05] active:scale-[0.98] sm:min-h-[6.25rem] sm:rounded-lg sm:p-3 lg:min-h-[7.25rem]",
        expanded && "border-gold/45 bg-gold/[0.06]"
      )}
    >
      <div className="text-xs font-medium text-muted">{label}</div>
      <div
        className="mt-1.5 truncate text-lg font-semibold tracking-tight text-foreground sm:mt-2 sm:text-xl lg:text-2xl"
        title={value}
      >
        {value}
      </div>
      {meta ? <div className="mt-0.5 text-[11px] font-medium text-muted">{meta}</div> : null}
      <div className="mt-1.5 sm:mt-2 lg:mt-3">
        <FactorDeltaBadge delta={delta} format={format} />
      </div>
    </button>
  );
}

function FactorDeltaBadge({
  delta,
  format
}: {
  delta: number | null | undefined;
  format: FactorHistoryFormat;
}) {
  if (delta === undefined) {
    return <span className="text-xs text-muted">Đang cập nhật</span>;
  }

  if (delta === null || delta === 0) {
    return <span className="text-xs font-medium text-muted">—</span>;
  }

  const positive = delta > 0;
  return (
    <span className={cn("text-xs font-semibold", positive ? "text-positive" : "text-red-400")}>
      {positive ? "▲" : "▼"} {formatDeltaValue(delta, format)}
    </span>
  );
}

function getLatestFactorChange(points: FactorHistoryPoint[] | null): number | null | undefined {
  if (!points) return undefined;
  return points[points.length - 1]?.change ?? null;
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

  if (format === "money") {
    return formatVnd(value);
  }

  if (format === "index") {
    return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  if (format === "money") {
    return `${change > 0 ? "+" : "−"}${formatVnd(Math.abs(change))}`;
  }

  if (format === "index") {
    return `${change > 0 ? "+" : "−"}${Math.abs(change).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  const sign = change > 0 ? "+" : "−";
  return `${sign}${formatPercent(Math.abs(change))}`;
}

function formatDeltaValue(delta: number, format: FactorHistoryFormat): string {
  const value = Math.abs(delta);

  if (format === "usd") {
    return `$${value.toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })}`;
  }

  if (format === "vnd") {
    return value.toLocaleString("vi-VN", { maximumFractionDigits: 0 });
  }

  if (format === "money") {
    return formatVnd(value);
  }

  if (format === "index") {
    return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return formatPercent(value);
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
        <span className="tabular-nums">
          {formatHistoryDate(firstPoint.date)} — {formatHistoryDate(lastPoint.date)}
        </span>
      </div>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-16 w-full"
        role="img"
        aria-label="Biểu đồ xu hướng 7 ngày"
      >
        <defs>
          <linearGradient id="factor-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#facc15" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,100 ${coordinates} 100,100`} fill="url(#factor-fill)" />
        <polyline
          points={coordinates}
          fill="none"
          stroke="#facc15"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
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

function formatVndSafe(value: number): string {
  return Number.isFinite(value) && value !== 0 ? formatVnd(value) : "—";
}
