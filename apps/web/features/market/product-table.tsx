"use client";

import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import type { MarketSummaryProduct } from "../../lib/api-client";
import { formatPercent, formatVnd } from "../../lib/utils";
import { Table, Td, Th } from "../../components/ui/table";
import { HelpTooltip } from "../../components/ui/help-tooltip";
import { SignalBadge } from "./signal-badge";

export function ProductTable({ products }: { products: MarketSummaryProduct[]; asOf: string }) {
  const router = useRouter();

  const rankedProducts = useMemo(
    () => [...products].sort((left, right) => right.score - left.score),
    [products]
  );
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
      <div className="space-y-2.5 md:hidden">
        {rankedProducts.map((product) => (
          <article key={product.code} className="research-card overflow-hidden rounded-lg">
            <Link
              href={`/gold/${product.code}`}
              aria-label={`Phân tích 180 ngày ${product.name}`}
              className="block w-full p-3.5 text-left transition duration-200 hover:bg-white/[0.04] active:scale-[0.995]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold tracking-tight text-amber-100">
                    {product.name}
                  </div>
                  <div className="mt-1 inline-flex rounded border border-gold/20 bg-gold/[0.08] px-1.5 py-0.5 text-[11px] font-medium text-gold/85">
                    {product.brand}
                  </div>
                </div>
                <NavigationMark />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-1.5 text-sm">
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
                  value={<SpreadValue amount={product.spreadAbsVnd} percent={product.spreadPct} />}
                />
                <ProductMetric label="Điểm" value={<ScoreValue product={product} />} />
              </dl>
            </Link>
          </article>
        ))}
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
            {rankedProducts.map((product) => (
              <ProductRow
                key={product.code}
                product={product}
                onSelect={() => router.push(`/gold/${product.code}`)}
              />
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}

function ProductRow({
  product,
  onSelect
}: {
  product: MarketSummaryProduct;
  onSelect: () => void;
}) {
  return (
    <tr onClick={onSelect} className="cursor-pointer transition-colors hover:bg-white/[0.045]">
      <Td>
        <Link
          href={`/gold/${product.code}`}
          onClick={(event) => {
            event.stopPropagation();
          }}
          aria-label={`Phân tích 180 ngày ${product.name}`}
          className="flex min-h-11 w-full items-start gap-2 text-left"
        >
          <NavigationMark />
          <div>
            <div className="font-medium text-foreground hover:text-gold">{product.name}</div>
            <div className="text-xs text-muted">{product.brand}</div>
          </div>
        </Link>
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

function NavigationMark() {
  return (
    <span
      className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/[0.1] bg-white/[0.025] text-muted transition"
      aria-hidden
    >
      <ChevronRight className="h-4 w-4" />
    </span>
  );
}

function ProductMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="metric-panel min-w-0 rounded-md px-2.5 py-2">
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
