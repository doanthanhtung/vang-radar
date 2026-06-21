"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleHelp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import type { MarketSummary, WorldGoldHistoryPoint } from "../../lib/api-client";
import { getApiUrl, getMarketSummary, getWorldGoldHistory } from "../../lib/api-client";
import { formatPercent, formatVnd } from "../../lib/utils";
import { ProductTable } from "./product-table";

const SUMMARY_POLL_FALLBACK_MS = 60_000;
const STALE_AFTER_MS = 20 * 60 * 1000;

export function LiveMarketDashboard({ initialSummary }: { initialSummary: MarketSummary }) {
  const [summary, setSummary] = useState(initialSummary);
  const [worldExpanded, setWorldExpanded] = useState(false);
  const [worldHistory, setWorldHistory] = useState<WorldGoldHistoryPoint[] | null>(null);
  const [worldHistoryError, setWorldHistoryError] = useState(false);

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

  const averagePremium = useMemo(
    () => average(summary.products.map((item) => item.premiumSellPct)),
    [summary.products]
  );
  const averageSpread = useMemo(
    () => average(summary.products.map((item) => item.spreadPct)),
    [summary.products]
  );
  const averageScore = useMemo(
    () => Math.round(average(summary.products.map((item) => item.score))),
    [summary.products]
  );
  const buyScore = useMemo(() => Math.max(0, Math.min(100, 100 - averageScore)), [averageScore]);
  const averageSell = useMemo(
    () => average(summary.products.map((item) => item.sellPrice)),
    [summary.products]
  );
  const priceGap = averageSell - summary.world.worldVndPerLuong;
  const isDataReady =
    summary.products.length > 0 && summary.world.xauUsdPerOz > 0 && summary.world.usdVnd > 0;
  const isStale = Date.now() - new Date(summary.time).getTime() > STALE_AFTER_MS;
  const decision = getDecision(isDataReady, buyScore, priceGap, averagePremium);

  const loadWorldHistory = useCallback(async () => {
    setWorldHistoryError(false);
    setWorldHistory(null);
    try {
      setWorldHistory(await getWorldGoldHistory(7));
    } catch {
      setWorldHistoryError(true);
    }
  }, []);

  const toggleWorldHistory = () => {
    const next = !worldExpanded;
    setWorldExpanded(next);
    if (next && !worldHistory) void loadWorldHistory();
  };

  return (
    <main className="pb-8">
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
            <Help text="VangScore càng cao nghĩa là điều kiện mua hiện tại càng thuận lợi, dựa trên premium và spread." />
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/90 md:text-lg">
            {decision.reason}
          </p>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-white/70">
            Gợi ý: {decision.action}
          </p>
          <div className="mx-auto mt-7 grid max-w-2xl grid-cols-3 divide-x divide-white/20 rounded-lg border border-white/20 bg-black/15 text-left">
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
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Các yếu tố ảnh hưởng</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Factor
              label="XAU/USD"
              value={
                summary.world.xauUsdPerOz
                  ? `$${summary.world.xauUsdPerOz.toLocaleString("en-US")}`
                  : "—"
              }
            />
            <Factor
              label="USD/VND"
              value={summary.world.usdVnd ? summary.world.usdVnd.toLocaleString("vi-VN") : "—"}
            />
            <Factor label="Premium TB" value={formatPercent(averagePremium)} />
            <Factor label="Spread TB" value={formatPercent(averageSpread)} />
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Giá bán theo sản phẩm</CardTitle>
          </CardHeader>
          <CardContent>
            <ProductTable products={summary.products} />
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-5xl px-4">
        <Card>
          <CardHeader>
            <button
              type="button"
              onClick={toggleWorldHistory}
              aria-expanded={worldExpanded}
              className="w-full text-left"
            >
              <CardTitle className="text-gold">Vàng Thế Giới</CardTitle>
              <p className="mt-1 text-sm text-muted">XAU/USD</p>
            </button>
          </CardHeader>
          {worldExpanded ? (
            <CardContent>
              <WorldHistory data={worldHistory} error={worldHistoryError} />
            </CardContent>
          ) : null}
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
          </div>
        </details>
      </section>
    </main>
  );
}

function getDecision(ready: boolean, score: number, priceGap: number, premium: number) {
  if (!ready)
    return {
      title: "ĐANG CHỜ THÊM DỮ LIỆU",
      score: null,
      reason:
        "Chưa có đủ giá vàng trong nước, giá thế giới hoặc tỷ giá để đưa ra kết luận đáng tin.",
      action: "Chờ dữ liệu đầy đủ trước khi quyết định mua."
    };
  const reason = `Vàng trong nước đang cao hơn giá thế giới quy đổi khoảng ${formatVnd(Math.max(0, priceGap))}/lượng. Premium hiện ở mức ${formatPercent(premium)}.`;
  if (score >= 70)
    return {
      title: "CÓ THỂ MUA",
      score,
      reason,
      action: "Phù hợp hơn với nhu cầu tích sản dài hạn; vẫn nên chia nhỏ số tiền mua."
    };
  if (score >= 40)
    return {
      title: "CÂN NHẮC",
      score,
      reason,
      action: "Chỉ mua nếu có nhu cầu dài hạn; chưa phù hợp để mua lướt sóng."
    };
  return {
    title: "NÊN CHỜ THÊM",
    score,
    reason,
    action: "Chỉ mua nếu có nhu cầu dài hạn; chưa phù hợp để mua lướt sóng."
  };
}

function WorldHistory({ data, error }: { data: WorldGoldHistoryPoint[] | null; error: boolean }) {
  const daily = data
    ? Array.from(
        new Map(
          data.map((point) => [
            new Date(point.time).toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }),
            point
          ])
        ).values()
      )
    : [];
  const dailyWithChange = daily
    .map((point, index) => {
      const previous = daily[index - 1];
      const change = previous ? point.price - previous.price : null;
      return {
        ...point,
        change
      };
    })
    .reverse();
  return (
    <div>
      {error ? (
        <p className="text-sm text-muted">
          Chưa thể tải lịch sử giá vàng thế giới. Vui lòng thử lại sau.
        </p>
      ) : !data ? (
        <div className="h-24 animate-pulse rounded bg-background" />
      ) : (
        <div className="max-h-48 overflow-auto text-sm">
          <table className="w-full">
            <tbody>
              {dailyWithChange.map((point) => (
                <tr key={point.time} className="border-b border-border/60">
                  <td className="py-2 text-muted">
                    {new Date(point.time).toLocaleDateString("vi-VN", {
                      timeZone: "Asia/Ho_Chi_Minh"
                    })}
                  </td>
                  <td className="py-2 text-right font-medium">
                    $
                    {point.price.toLocaleString("en-US", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1
                    })}
                  </td>
                  <td
                    className={`py-2 text-right text-xs font-medium ${point.change === null || point.change === 0 ? "text-muted" : point.change > 0 ? "text-positive" : "text-red-400"}`}
                  >
                    {point.change === null
                      ? "—"
                      : point.change === 0
                        ? "0"
                        : `${point.change > 0 ? "+" : "−"}${Math.abs(point.change).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function QuickMetric({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="min-w-0 px-3 py-3 sm:px-5">
      <div className="flex items-center gap-1 text-xs text-white/70">
        {label}
        {help ? <Help text={help} /> : null}
      </div>
      <div className="mt-1 truncate text-base font-semibold sm:text-xl">{value}</div>
    </div>
  );
}
function Factor({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-background p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-medium text-foreground">{value}</div>
    </div>
  );
}
function Help({ text }: { text: string }) {
  return (
    <span title={text}>
      <CircleHelp className="h-3.5 w-3.5" aria-label={text} />
    </span>
  );
}
function average(values: Array<number | string>): number {
  const numbers = values.map(Number).filter(Number.isFinite);
  return numbers.reduce((sum, value) => sum + value, 0) / Math.max(numbers.length, 1);
}
function formatVietnamTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date(value));
}
