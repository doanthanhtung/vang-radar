"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Clock3,
  Database,
  Gauge,
  ShieldAlert
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { HelpTooltip } from "../../components/ui/help-tooltip";
import type { GoldPriceHistory, MarketSummary } from "../../lib/api-client";
import {
  getApiUrl,
  getDxyHistory,
  getGoldPriceHistory,
  getMarketSummary,
  getUsdVndHistory,
  getWorldGoldHistory
} from "../../lib/api-client";
import {
  applyLiveTodayValue,
  buildAverageDailyGoldHistory,
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
type ExpandedFactor = "xau" | "dxy" | "usd" | "premium" | "spread";
type FactorHistoryFormat = "usd" | "vnd" | "percent" | "index";

export function LiveMarketDashboard({ initialSummary }: { initialSummary: MarketSummary }) {
  const [summary, setSummary] = useState(initialSummary);
  const [expandedFactor, setExpandedFactor] = useState<ExpandedFactor | null>(null);
  const [factorHistory, setFactorHistory] = useState<
    Partial<Record<ExpandedFactor, FactorHistoryPoint[]>>
  >({});
  const [factorHistoryError, setFactorHistoryError] = useState<ExpandedFactor | null>(null);
  const [factorHistoryLoading, setFactorHistoryLoading] = useState<ExpandedFactor | null>(null);
  const productHistoryPromiseRef = useRef<Record<string, Promise<GoldPriceHistory>>>({});
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
  const productCodes = useMemo(() => liveProducts.map((product) => product.code), [liveProducts]);
  const todayKey = useMemo(() => toVietnamDateKey(summary.time), [summary.time]);

  const liveFactorValues = useMemo(
    (): Record<ExpandedFactor, number | null> => ({
      xau: summary.world.xauUsdPerOz > 0 ? summary.world.xauUsdPerOz : null,
      // DXY is an end-of-session macro series; do not copy an older close into today's row.
      dxy: null,
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

  const getProductHistory = useCallback((code: string) => {
    productHistoryPromiseRef.current[code] ??= getGoldPriceHistory(code, 7);
    return productHistoryPromiseRef.current[code]!;
  }, []);

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

      const histories = await Promise.all(productCodes.map((code) => getProductHistory(code)));
      return buildAverageDailyGoldHistory(
        histories,
        factor === "premium" ? "premiumPercent" : "spreadPercent"
      );
    },
    [getProductHistory, productCodes]
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
    const prefetchKey = `${todayKey}:${productCodes.join(",")}`;
    if (
      !isDataReady ||
      productCodes.length === 0 ||
      prefetchedFactorKeyRef.current === prefetchKey
    ) {
      return;
    }

    prefetchedFactorKeyRef.current = prefetchKey;
    const timeout = window.setTimeout(() => {
      const factors: ExpandedFactor[] = ["xau", "usd", "dxy", "premium", "spread"];
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
  }, [fetchFactorHistory, isDataReady, productCodes, todayKey]);

  const toggleFactor = (factor: ExpandedFactor) => {
    const next = expandedFactor === factor ? null : factor;
    setExpandedFactor(next);
    if (next && !factorHistory[next]) void loadFactorHistory(next);
  };

  return (
    <main id="main-content" className="pb-12">
      <section className="dashboard-visual">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 pb-12 pt-8 text-white md:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)] md:items-end md:pb-14 md:pt-12">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-md border border-white/[0.12] bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
              <Activity className="h-3.5 w-3.5 text-gold" aria-hidden />
              Dashboard nghiên cứu giá vàng
            </div>
            <h1 className="mt-5 max-w-2xl text-4xl font-semibold leading-[0.98] tracking-tight text-foreground md:text-6xl">
              {decision.title}
            </h1>
            <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-slate-200 md:text-lg">
              {decision.reason}
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Gợi ý nghiên cứu: {decision.action}
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
          </div>

          <aside className="research-card rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-muted">VangScore tổng hợp</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <strong className="text-4xl font-semibold tracking-tight text-gold">
                    {decision.score === null ? "—" : decision.score}
                  </strong>
                  <span className="text-sm text-muted">/100</span>
                </div>
              </div>
              <HelpTooltip text="VangScore là trung bình điểm tín hiệu của các sản phẩm (0–100). Điểm càng cao nghĩa là điều kiện mua hiện tại càng thuận lợi." />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <SummaryMetric
                label="Giá thế giới"
                value={formatVndSafe(summary.world.worldVndPerLuong)}
              />
              <SummaryMetric label="Giá bán TB" value={formatVndSafe(averageSell)} />
              <SummaryMetric label="Chênh lệch" value={formatVndSafe(priceGap)} tone="warn" />
              <SummaryMetric label="Premium TB" value={formatPercent(averagePremium)} tone="warn" />
            </div>
          </aside>
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-5 max-w-7xl px-4 pt-0">
        <Card>
          <CardHeader className="flex flex-col gap-1 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>Các yếu tố ảnh hưởng</CardTitle>
              <p className="mt-1 text-sm text-muted">
                Mở từng yếu tố để xem xu hướng 7 ngày và kiểm tra bối cảnh trước khi so sánh sản
                phẩm.
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
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
                label="DXY"
                value={
                  summary.macro.dxy?.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  }) ?? "—"
                }
                expanded={expandedFactor === "dxy"}
                onToggle={() => toggleFactor("dxy")}
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
                className="col-span-2 sm:col-span-1"
              />
            </div>
            {expandedFactor ? (
              <div className="mt-3 border-t border-border pt-3">
                <FactorHistoryTable
                  points={displayedFactorHistory}
                  format={
                    expandedFactor === "xau"
                      ? "usd"
                      : expandedFactor === "dxy"
                        ? "index"
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

      <section className="mx-auto max-w-7xl px-4 pb-6 pt-6">
        <div className="mb-4 flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Bảng so sánh sản phẩm
            </h2>
            <p className="mt-1 text-sm text-muted">
              Bấm vào từng dòng để xem lịch sử 7 ngày, premium và spread theo ngày.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs text-muted">
            <Gauge className="h-3.5 w-3.5 text-gold" aria-hidden />
            Điểm càng cao càng thuận lợi
          </span>
        </div>
        <ProductTable products={liveProducts} asOf={summary.time} />
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-4">
        <details className="research-card rounded-lg p-4 text-sm text-muted">
          <summary className="cursor-pointer font-medium text-foreground transition-colors hover:text-gold">
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

function SummaryMetric({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="metric-panel rounded-md px-3 py-2.5">
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

function ExpandableFactor({
  label,
  value,
  expanded,
  onToggle,
  className
}: {
  label: string;
  value: string;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const Icon = expanded ? ChevronUp : ChevronDown;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={cn(
        "rounded-md border border-white/[0.04] bg-background/75 p-3 text-left transition duration-200 hover:border-gold/25 hover:bg-white/[0.06] active:scale-[0.98]",
        className
      )}
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

  if (format === "index") {
    return `${change > 0 ? "+" : "−"}${Math.abs(change).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
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
