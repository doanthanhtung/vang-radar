"use client";

import { ArrowDown, ArrowUp, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GoldPriceHistory, MarketSummaryProduct } from "../../lib/api-client";
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
  const [selectedCode, setSelectedCode] = useState<string | null>(products[0]?.code ?? null);
  const [historyByCode, setHistoryByCode] = useState<Record<string, HistoryState>>({});
  const detailPanelRef = useRef<HTMLElement | null>(null);

  const selectedProduct = useMemo(
    () => products.find((product) => product.code === selectedCode) ?? products[0] ?? null,
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
    if (products.length === 0) {
      setSelectedCode(null);
      return;
    }

    if (!selectedProduct) {
      setSelectedCode(products[0]!.code);
    }
  }, [products, selectedProduct]);

  useEffect(() => {
    if (selectedProduct) loadHistory(selectedProduct.code);
  }, [selectedProduct?.code]);

  const selectProduct = (code: string) => {
    setSelectedCode(code);
    loadHistory(code);
    window.setTimeout(() => {
      const panel = detailPanelRef.current;
      if (!panel) return;

      const rect = panel.getBoundingClientRect();
      const stickyHeaderOffset = 76;
      const isMostlyVisible =
        rect.top >= stickyHeaderOffset && rect.top < window.innerHeight * 0.72;
      if (isMostlyVisible) return;

      const targetTop = window.scrollY + rect.top - stickyHeaderOffset;
      window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    }, 0);
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
        {products.map((product) => {
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
            {products.map((product) => {
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

      {selectedProduct ? (
        <section
          ref={detailPanelRef}
          className="research-card mt-4 overflow-hidden rounded-lg"
          id="selected-product-history"
        >
          <div className="flex flex-col gap-3 border-b border-white/[0.07] px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                Chi tiết sản phẩm đang chọn
              </p>
              <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
                {selectedProduct.name}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:justify-end sm:text-right">
              <div>
                <div className="text-xs text-muted">Điểm hiện tại</div>
                <div className="mt-1 font-semibold text-foreground">
                  {selectedProduct.score}/100
                </div>
              </div>
              <SignalBadge signal={selectedProduct.signal} />
              <Link
                href={`/gold/${selectedProduct.code}`}
                className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-gold/40 bg-gold/[0.18] px-4 text-sm font-semibold text-gold shadow-[0_0_0_1px_rgba(245,158,11,0.12),0_10px_24px_rgba(245,158,11,0.14)] transition hover:bg-gold/[0.22] active:scale-[0.98] sm:min-h-9 sm:w-auto sm:px-3 sm:font-medium sm:shadow-none"
              >
                Phân tích 180N
              </Link>
            </div>
          </div>
          <div className="p-3 sm:p-4">
            <HistoryContent
              state={historyByCode[selectedProduct.code]}
              retry={() => retryHistory(selectedProduct.code)}
              product={selectedProduct}
              asOf={asOf}
            />
          </div>
        </section>
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
          aria-controls="selected-product-history"
          aria-pressed={selected}
          className="flex w-full items-start gap-2 text-left"
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
  if (selected) {
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />;
  }

  return (
    <span
      className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border border-white/[0.14]"
      aria-hidden
    />
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
