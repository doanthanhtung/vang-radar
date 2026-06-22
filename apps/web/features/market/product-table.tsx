"use client";

import { ChevronDown, ChevronUp, ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";
import type { GoldPriceHistory, MarketSummaryProduct } from "../../lib/api-client";
import { getGoldPriceHistory } from "../../lib/api-client";
import { formatPercent, formatVnd } from "../../lib/utils";
import { Table, Td, Th } from "../../components/ui/table";
import { HelpTooltip } from "../../components/ui/help-tooltip";
import { SignalBadge } from "./signal-badge";
import { DailyPriceHistory } from "./daily-price-history";

type HistoryState =
  | { status: "loading" }
  | { status: "success"; data: GoldPriceHistory }
  | { status: "error"; message: string };

export function ProductTable({ products }: { products: MarketSummaryProduct[] }) {
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [historyByCode, setHistoryByCode] = useState<Record<string, HistoryState>>({});

  const toggleProduct = (code: string) => {
    if (expandedCode === code) {
      setExpandedCode(null);
      return;
    }
    setExpandedCode(code);
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
          Dữ liệu giá từ các thương hiệu vàng sẽ xuất hiện ở đây ngay khi nguồn cung cấp bản cập nhật mới.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2 md:hidden">
        {products.map((product) => {
          const isExpanded = expandedCode === product.code;
          return (
            <article
              key={product.code}
              className="overflow-hidden rounded-xl border border-border/80 bg-panel/75 shadow-[0_12px_30px_rgba(2,6,23,0.18)]"
            >
              <button
                type="button"
                onClick={() => toggleProduct(product.code)}
                aria-expanded={isExpanded}
                className="w-full p-4 text-left transition duration-200 hover:bg-white/[0.04] active:scale-[0.995]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">{product.name}</div>
                    <div className="text-xs text-muted">{product.brand}</div>
                  </div>
                  <ExpandIcon expanded={isExpanded} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
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
                  <ProductMetric label="Spread" value={formatPercent(product.spreadPct)} />
                  <ProductMetric label="Điểm" value={<ScoreValue product={product} />} />
                </dl>
              </button>
              {isExpanded ? (
                <div className="border-t border-border p-3">
                  <HistoryContent
                    state={historyByCode[product.code]}
                    retry={() => retryHistory(product.code)}
                  />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border/80 bg-panel/75 shadow-[0_12px_30px_rgba(2,6,23,0.18)] md:block">
        <Table>
          <thead className="bg-background/85">
            <tr>
              <Th>Sản phẩm</Th>
              <Th>Bán ra</Th>
              <Th><MetricLabel label="Premium" description="Mức giá bán trong nước cao hoặc thấp hơn giá thế giới quy đổi." /></Th>
              <Th><MetricLabel label="Spread" description="Chênh lệch giữa giá mua vào và bán ra." /></Th>
              <Th><MetricLabel label="Điểm" description="Điểm tín hiệu mua (0–100) và nhãn tín hiệu của từng sản phẩm." /></Th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const isExpanded = expandedCode === product.code;
              return (
                <ProductRows
                  key={product.code}
                  product={product}
                  expanded={isExpanded}
                  state={historyByCode[product.code]}
                  onToggle={() => toggleProduct(product.code)}
                  onRetry={() => retryHistory(product.code)}
                />
              );
            })}
          </tbody>
        </Table>
      </div>
    </>
  );
}

function ProductRows({
  product,
  expanded,
  state,
  onToggle,
  onRetry
}: {
  product: MarketSummaryProduct;
  expanded: boolean;
  state: HistoryState | undefined;
  onToggle: () => void;
  onRetry: () => void;
}) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer transition-colors hover:bg-white/[0.04]">
        <Td>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            aria-expanded={expanded}
            aria-controls={`price-history-${product.code}`}
            className="flex w-full items-start gap-2 text-left"
          >
            <ExpandIcon expanded={expanded} />
            <div>
              <div className="font-medium text-foreground hover:text-gold">{product.name}</div>
              <div className="text-xs text-muted">{product.brand}</div>
            </div>
          </button>
        </Td>
        <Td>
          <PriceWithChange price={product.sellPrice} previousClose={product.previousDayClose?.sellPriceVnd} />
        </Td>
        <Td>
          <MetricValue value={product.premiumSellPct} />
        </Td>
        <Td>
          <MetricValue value={product.spreadPct} />
        </Td>
        <Td>
          <ScoreValue product={product} />
        </Td>
      </tr>
      {expanded ? (
        <tr id={`price-history-${product.code}`}>
          <Td colSpan={5} className="bg-background/70 p-3">
            <HistoryContent state={state} retry={onRetry} />
          </Td>
        </tr>
      ) : null}
    </>
  );
}

function HistoryContent({ state, retry }: { state: HistoryState | undefined; retry: () => void }) {
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
  return <DailyPriceHistory history={state.data} />;
}

function ExpandIcon({ expanded }: { expanded: boolean }) {
  const Icon = expanded ? ChevronUp : ChevronDown;
  return <Icon className="h-4 w-4 shrink-0 text-gold" aria-hidden />;
}

function ProductMetric({ label, value }: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 break-words font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}

function PriceWithChange({ price, previousClose }: { price: number; previousClose: number | undefined }) {
  const hasPreviousClose = typeof previousClose === "number" && Number.isFinite(previousClose);
  const change = hasPreviousClose ? price - previousClose : 0;
  const isUp = change > 0;
  const isDown = change < 0;
  const Icon = isUp ? ArrowUp : ArrowDown;
  const color = isUp ? "text-positive" : isDown ? "text-red-400" : "text-muted";
  return (
    <div>
      <div className="font-medium text-foreground">{formatVnd(price)}</div>
      {hasPreviousClose && change !== 0 ? (
        <div className={`mt-1 flex items-center gap-0.5 text-[11px] font-medium ${color}`}>
          <Icon className="h-3 w-3" aria-hidden />
          {`${isUp ? "+" : "−"}${formatVnd(Math.abs(change))}`}
        </div>
      ) : null}
    </div>
  );
}

function MetricValue({ value }: { value: number }) {
  return (
    <div className="font-medium text-foreground">{formatPercent(value)}</div>
  );
}

function ScoreValue({ product }: { product: MarketSummaryProduct }) {
  return (
    <div className="space-y-1.5">
      <div className="font-medium text-foreground">{product.score}/100</div>
      <SignalBadge signal={product.signal} />
    </div>
  );
}

function MetricLabel({ label, description }: { label: string; description: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <HelpTooltip text={description} className="text-muted" />
    </span>
  );
}
