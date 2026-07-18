"use client";

import { ArrowDown, ArrowUp, ChevronRight, FlaskConical, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ExperimentalDrawdownPlan,
  GoldPriceHistory,
  MarketSummaryProduct
} from "../../lib/api-client";
import { getGoldPriceHistory } from "../../lib/api-client";
import { applyLiveGoldPriceHistory, toVietnamDateKey } from "../../lib/factor-history";
import { formatPercent, formatVnd } from "../../lib/utils";
import { Table, Td, Th } from "../../components/ui/table";
import { HelpTooltip } from "../../components/ui/help-tooltip";
import { SignalBadge } from "./signal-badge";
import { DailyPriceHistory } from "./daily-price-history";

type HistoryState =
  | { status: "loading" }
  | { status: "success"; data: GoldPriceHistory }
  | { status: "error"; message: string };

export function ProductTable({
  products,
  asOf
}: {
  products: MarketSummaryProduct[];
  asOf: string;
}) {
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [historyByCode, setHistoryByCode] = useState<Record<string, HistoryState>>({});
  const [showExperimentalPlan, setShowExperimentalPlan] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  const rankedProducts = useMemo(
    () => [...products].sort((left, right) => right.score - left.score),
    [products]
  );
  const selectedProduct = useMemo(
    () => products.find((product) => product.code === selectedCode) ?? null,
    [products, selectedCode]
  );

  const loadHistory = (code: string) => {
    if (historyByCode[code]) return;

    setHistoryByCode((current) => ({ ...current, [code]: { status: "loading" } }));
    void getGoldPriceHistory(code)
      .then((data) =>
        setHistoryByCode((current) => ({ ...current, [code]: { status: "success", data } }))
      )
      .catch(() =>
        setHistoryByCode((current) => ({
          ...current,
          [code]: { status: "error", message: "Không thể tải dữ liệu lịch sử. Vui lòng thử lại." }
        }))
      );
  };

  useEffect(() => {
    if (selectedCode && !products.some((product) => product.code === selectedCode)) {
      setSelectedCode(null);
    }
  }, [products, selectedCode]);

  useEffect(() => {
    if (selectedProduct) loadHistory(selectedProduct.code);
  }, [selectedProduct?.code]);

  useEffect(() => {
    setShowExperimentalPlan(localStorage.getItem("vangscore:show-experimental-plan") === "true");
  }, []);

  useEffect(() => {
    if (!isDetailOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsDetailOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => lastFocusedElementRef.current?.focus());
    };
  }, [isDetailOpen]);

  const toggleExperimentalPlan = () => {
    setShowExperimentalPlan((current) => {
      const next = !current;
      localStorage.setItem("vangscore:show-experimental-plan", String(next));
      return next;
    });
  };

  const selectProduct = (code: string) => {
    lastFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedCode(code);
    loadHistory(code);
    setIsDetailOpen(true);
  };

  const retryHistory = (code: string) => {
    setHistoryByCode((current) => ({ ...current, [code]: { status: "loading" } }));
    void getGoldPriceHistory(code)
      .then((data) =>
        setHistoryByCode((current) => ({ ...current, [code]: { status: "success", data } }))
      )
      .catch(() =>
        setHistoryByCode((current) => ({
          ...current,
          [code]: { status: "error", message: "Không thể tải dữ liệu lịch sử. Vui lòng thử lại." }
        }))
      );
  };

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-background/35 px-5 py-10 text-center">
        <p className="font-medium text-foreground">Chưa có bảng giá để so sánh</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
          Dữ liệu giá từ các thương hiệu vàng sẽ xuất hiện ở đây ngay khi nguồn cung cấp bản cập
          nhật mới.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {rankedProducts.map((product) => {
          const isSelected = selectedProduct?.code === product.code;
          return (
            <article
              key={product.code}
              className={`research-card overflow-hidden rounded-lg ${
                isSelected ? "bg-gold/[0.035] ring-1 ring-gold/35" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => selectProduct(product.code)}
                aria-haspopup="dialog"
                aria-pressed={isSelected}
                className="w-full p-4 text-left transition duration-200 hover:bg-white/[0.04] active:scale-[0.995]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div
                      className={`text-base font-semibold tracking-tight ${
                        isSelected ? "text-gold" : "text-amber-100"
                      }`}
                    >
                      {product.name}
                    </div>
                    <div className="mt-1 inline-flex rounded border border-gold/20 bg-gold/[0.08] px-1.5 py-0.5 text-[11px] font-medium text-gold/85">
                      {product.brand}
                    </div>
                  </div>
                  <SelectionMark selected={isSelected} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <ProductMetric
                    label="Bán ra"
                    value={
                      <PriceWithChange
                        price={product.sellPrice}
                        previousClose={product.previousDayClose?.sellPriceVnd}
                      />
                    }
                  />
                  <ProductMetric label="Premium" value={formatPercent(product.premiumSellPct)} />
                  <ProductMetric
                    label="Spread"
                    value={
                      <SpreadValue amount={product.spreadAbsVnd} percent={product.spreadPct} />
                    }
                  />
                  <ProductMetric label="Điểm" value={<ScoreValue product={product} />} />
                </dl>
              </button>
            </article>
          );
        })}
      </div>

      <div className="research-card hidden max-h-[48rem] overflow-auto rounded-lg md:block">
        <Table className="table-sticky-header">
          <thead>
            <tr>
              <Th>Sản phẩm</Th>
              <Th className="text-right">Bán ra</Th>
              <Th className="text-right">
                <MetricLabel
                  label="Premium"
                  description="Mức giá bán trong nước cao hoặc thấp hơn giá thế giới quy đổi."
                />
              </Th>
              <Th className="text-right">
                <MetricLabel label="Spread" description="Chênh lệch giữa giá mua vào và bán ra." />
              </Th>
              <Th className="text-right">
                <MetricLabel
                  label="Điểm"
                  description="Điểm tín hiệu mua (0–100) và nhãn tín hiệu của từng sản phẩm."
                />
              </Th>
            </tr>
          </thead>
          <tbody>
            {rankedProducts.map((product) => {
              const isSelected = selectedProduct?.code === product.code;
              return (
                <ProductRow
                  key={product.code}
                  product={product}
                  selected={isSelected}
                  onSelect={() => selectProduct(product.code)}
                />
              );
            })}
          </tbody>
        </Table>
      </div>

      {selectedProduct && isDetailOpen ? (
        <ProductDetailDialog
          product={selectedProduct}
          historyState={historyByCode[selectedProduct.code]}
          showExperimentalPlan={showExperimentalPlan}
          asOf={asOf}
          onClose={() => setIsDetailOpen(false)}
          onToggleExperimentalPlan={toggleExperimentalPlan}
          onRetryHistory={() => retryHistory(selectedProduct.code)}
        />
      ) : null}
    </>
  );
}

function ProductRow({
  product,
  selected,
  onSelect
}: {
  product: MarketSummaryProduct;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <tr
      onClick={onSelect}
      aria-selected={selected}
      className={`cursor-pointer transition-colors hover:bg-white/[0.045] ${
        selected ? "bg-gold/[0.055]" : ""
      }`}
    >
      <Td>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          aria-controls="product-detail-dialog"
          aria-haspopup="dialog"
          aria-pressed={selected}
          className="flex min-h-11 w-full items-start gap-2 text-left"
        >
          <SelectionMark selected={selected} />
          <div>
            <div className="font-medium text-foreground hover:text-gold">{product.name}</div>
            <div className="text-xs text-muted">{product.brand}</div>
          </div>
        </button>
      </Td>
      <Td className="text-right">
        <PriceWithChange
          price={product.sellPrice}
          previousClose={product.previousDayClose?.sellPriceVnd}
        />
      </Td>
      <Td className="text-right">
        <MetricValue value={product.premiumSellPct} />
      </Td>
      <Td className="text-right">
        <SpreadValue amount={product.spreadAbsVnd} percent={product.spreadPct} align="right" />
      </Td>
      <Td className="text-right">
        <ScoreValue product={product} />
      </Td>
    </tr>
  );
}

function SelectionMark({ selected }: { selected: boolean }) {
  return (
    <span
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border transition ${selected ? "border-gold/35 bg-gold/10 text-gold" : "border-white/[0.1] bg-white/[0.025] text-muted"}`}
      aria-hidden
    >
      <ChevronRight className="h-4 w-4" />
    </span>
  );
}

function ProductDetailDialog({
  product,
  historyState,
  showExperimentalPlan,
  asOf,
  onClose,
  onToggleExperimentalPlan,
  onRetryHistory
}: {
  product: MarketSummaryProduct;
  historyState: HistoryState | undefined;
  showExperimentalPlan: boolean;
  asOf: string;
  onClose: () => void;
  onToggleExperimentalPlan: () => void;
  onRetryHistory: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const keepFocusInside = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/72 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        ref={dialogRef}
        id="product-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-detail-title"
        className="research-card relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={keepFocusInside}
      >
        <div className="flex flex-col gap-3 border-b border-white/[0.07] py-4 pl-4 pr-16 sm:flex-row sm:items-start sm:justify-between sm:pr-20">
          <div className="min-w-0 pr-10 sm:pr-0">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
              Chi tiết sản phẩm đang chọn
            </p>
            <h3
              id="product-detail-title"
              className="mt-1 text-lg font-semibold tracking-tight text-foreground"
            >
              {product.name}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:justify-end sm:text-right">
            <div>
              <div className="text-xs text-muted">Điểm hiện tại</div>
              <div className="mt-1 font-semibold text-foreground">{product.score}/100</div>
            </div>
            <SignalBadge signal={product.signal} />
            {product.experimentalDrawdownPlan ? (
              <button
                type="button"
                onClick={onToggleExperimentalPlan}
                aria-pressed={showExperimentalPlan}
                className={`inline-flex min-h-11 w-full items-center justify-center rounded-md border px-3 text-sm font-medium transition active:scale-[0.98] sm:w-auto ${
                  showExperimentalPlan
                    ? "border-gold/45 bg-gold/[0.16] text-gold"
                    : "border-white/[0.12] bg-white/[0.04] text-muted hover:text-foreground"
                }`}
              >
                {showExperimentalPlan ? "Ẩn thử nghiệm" : "Hiện thử nghiệm"}
              </button>
            ) : null}
            <Link
              href={`/gold/${product.code}`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-gold/40 bg-gold/[0.18] px-4 text-sm font-semibold text-gold shadow-[0_0_0_1px_rgba(245,158,11,0.12),0_10px_24px_rgba(245,158,11,0.14)] transition hover:bg-gold/[0.22] active:scale-[0.98] sm:w-auto sm:px-3 sm:font-medium sm:shadow-none"
            >
              Phân tích 180N
            </Link>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Đóng chi tiết sản phẩm"
            className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-md border border-white/[0.12] bg-white/[0.04] text-muted transition hover:bg-white/[0.08] hover:text-foreground active:scale-[0.98] sm:right-4 sm:top-4"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto p-3 sm:p-4">
          {showExperimentalPlan ? (
            <ExperimentalDrawdownPlanCard plan={product.experimentalDrawdownPlan} />
          ) : null}
          <HistoryContent
            state={historyState}
            retry={onRetryHistory}
            product={product}
            asOf={asOf}
          />
        </div>
      </section>
    </div>
  );
}

function HistoryContent({
  state,
  retry,
  product,
  asOf
}: {
  state: HistoryState | undefined;
  retry: () => void;
  product: MarketSummaryProduct;
  asOf: string;
}) {
  if (!state || state.status === "loading")
    return (
      <div className="h-72 animate-pulse rounded-lg bg-panel" aria-label="Đang tải lịch sử giá" />
    );
  if (state.status === "error")
    return (
      <div className="rounded-lg border border-caution/30 bg-caution/10 p-4 text-sm text-red-300">
        {state.message}
        <button type="button" onClick={retry} className="ml-2 font-medium underline">
          Thử lại
        </button>
      </div>
    );
  return (
    <DailyPriceHistory
      history={applyLiveGoldPriceHistory(state.data, toVietnamDateKey(asOf), {
        sellPrice: product.sellPrice,
        premiumSellPct: product.premiumSellPct,
        spreadPct: product.spreadPct
      })}
    />
  );
}

function ExperimentalDrawdownPlanCard({ plan }: { plan: ExperimentalDrawdownPlan | undefined }) {
  if (!plan) return null;

  const statusText =
    plan.action === "TRIM"
      ? "Cân nhắc giảm vị thế"
      : plan.status === "READY"
        ? "Có thể cân nhắc giải ngân"
        : plan.status === "BLOCKED"
          ? "Tạm dừng mua"
          : "Chưa đến vùng mua";
  const statusClass =
    plan.status === "READY"
      ? "border-positive/30 bg-positive/10 text-emerald-200"
      : plan.status === "BLOCKED"
        ? "border-caution/30 bg-caution/10 text-red-200"
        : "border-white/[0.12] bg-white/[0.04] text-muted";
  const nextLevel =
    plan.nextBuyLevelPct === null ? "Đủ các nấc chính" : formatPercent(plan.nextBuyLevelPct);

  return (
    <aside className="mb-4 rounded-lg border border-gold/20 bg-gold/[0.055] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded border border-gold/25 bg-gold/[0.12] px-2 py-1 text-xs font-medium text-gold">
            <FlaskConical className="h-3.5 w-3.5" aria-hidden />
            Thử nghiệm
          </div>
          <h4 className="mt-3 text-base font-semibold tracking-tight text-foreground">
            Kế hoạch mua theo nấc
          </h4>
          <p className="mt-1 text-sm leading-6 text-muted">
            Chiến lược drawdown 252 ngày, tối đa {formatPercent(plan.maxExposurePct)} vốn. Chỉ là
            lớp tham khảo, không thay thế điểm VangScore chính.
          </p>
        </div>
        <div className={`rounded-md border px-3 py-2 text-sm font-semibold ${statusClass}`}>
          {statusText}
        </div>
      </div>

      <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <PlanMetric
          label={`Giảm từ đỉnh ${plan.drawdownWindowDays}N`}
          value={formatPercent(plan.currentDrawdownPct)}
        />
        <PlanMetric label="Vốn mục tiêu" value={formatPercent(plan.suggestedExposurePct)} />
        <PlanMetric label="Nấc mua kế tiếp" value={nextLevel} />
        <PlanMetric label="Đỉnh tham chiếu" value={formatVnd(plan.rollingHighPriceVnd)} />
        <PlanMetric
          label="Premium percentile"
          value={
            plan.premiumPercentile === null
              ? "Thiếu dữ liệu"
              : formatPercent(plan.premiumPercentile)
          }
          muted={!plan.premiumOk}
        />
        <PlanMetric
          label="Spread percentile"
          value={
            plan.spreadPercentile === null ? "Thiếu dữ liệu" : formatPercent(plan.spreadPercentile)
          }
          muted={!plan.spreadOk}
        />
      </dl>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.1em] text-slate-500">Lý do</div>
          <ul className="mt-2 space-y-1.5 text-sm leading-6 text-muted">
            {plan.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.1em] text-slate-500">Lưu ý</div>
          <ul className="mt-2 space-y-1.5 text-sm leading-6 text-muted">
            {plan.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}

function PlanMetric({
  label,
  value,
  muted = false
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-md border border-white/[0.08] bg-background/35 px-3 py-2">
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
        {label}
      </dt>
      <dd
        className={`mt-1 break-words text-sm font-semibold ${muted ? "text-red-300" : "text-foreground"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function ProductMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="metric-panel min-w-0 rounded-md px-3 py-2">
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-words font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function PriceWithChange({
  price,
  previousClose
}: {
  price: number;
  previousClose: number | undefined;
}) {
  const hasPreviousClose = typeof previousClose === "number" && Number.isFinite(previousClose);
  const change = hasPreviousClose ? price - previousClose : 0;
  const isUp = change > 0;
  const isDown = change < 0;
  const Icon = isUp ? ArrowUp : ArrowDown;
  const color = isUp ? "text-positive" : isDown ? "text-red-400" : "text-muted";
  return (
    <div className="flex flex-col items-start md:items-end">
      <div className="font-semibold text-foreground">{formatVnd(price)}</div>
      {hasPreviousClose && change !== 0 ? (
        <div
          className={`mt-1 inline-flex items-center justify-end gap-0.5 text-[11px] font-medium ${color}`}
        >
          <Icon className="h-3 w-3" aria-hidden />
          {`${isUp ? "+" : "−"}${formatVnd(Math.abs(change))}`}
        </div>
      ) : null}
    </div>
  );
}

function MetricValue({ value }: { value: number }) {
  return <div className="font-medium text-foreground">{formatPercent(value)}</div>;
}

function SpreadValue({
  amount,
  percent,
  align = "left"
}: {
  amount: number;
  percent: number;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="font-semibold text-foreground">{formatVnd(amount)}</div>
      <div className="mt-0.5 text-[11px] font-medium text-muted">{formatPercent(percent)}</div>
    </div>
  );
}

function ScoreValue({ product }: { product: MarketSummaryProduct }) {
  return (
    <div className="flex flex-col items-start gap-1.5 md:items-end">
      <div className="font-semibold text-foreground">{product.score}/100</div>
      <SignalBadge signal={product.signal} compact />
    </div>
  );
}

function MetricLabel({ label, description }: { label: string; description: string }) {
  return (
    <span className="inline-flex items-center justify-end gap-1">
      {label}
      <HelpTooltip text={description} className="text-muted" />
    </span>
  );
}
