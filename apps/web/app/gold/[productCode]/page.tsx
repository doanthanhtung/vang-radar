import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GOLD_PRODUCTS, PRODUCT_CODES } from "@vang-radar/domain";
import { Card, CardContent } from "../../../components/ui/card";
import { SignalBadge } from "../../../features/market/signal-badge";
import { MetricChartsPanel } from "../../../features/products/metric-charts-panel";
import { getMarketSummary, getMetricHistory, type MetricPoint } from "../../../lib/api-client";
import { enrichProductWithLiveSignal } from "../../../lib/vang-score";
import { createPageMetadata } from "../../../lib/seo";
import { formatVnd } from "../../../lib/utils";

export const revalidate = 60;
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: {
  params: Promise<{ productCode: string }>;
}): Promise<Metadata> {
  const { productCode } = await params;
  if (!PRODUCT_CODES.includes(productCode as (typeof PRODUCT_CODES)[number])) {
    return {};
  }

  const product = GOLD_PRODUCTS.find((item) => item.code === productCode);
  const productName = product?.name ?? productCode;

  return createPageMetadata({
    title: `Giá ${productName} hôm nay`,
    description: `Theo dõi giá mua/bán, premium, spread, tín hiệu và biểu đồ lịch sử cho ${productName}.`,
    path: `/gold/${productCode}`,
    imageAlt: `Giá ${productName} trên VangScore`
  });
}

export default async function ProductPage({
  params
}: {
  params: Promise<{ productCode: string }>;
}) {
  const { productCode } = await params;
  if (!PRODUCT_CODES.includes(productCode as (typeof PRODUCT_CODES)[number])) notFound();

  const summary = await getMarketSummary();
  const rawProduct = summary.products.find((item) => item.code === productCode);
  if (!rawProduct) notFound();
  const metricHistory = await getMetricHistory(productCode, "180d").catch(() => []);
  const product = syncProductWithHistoryMetric(
    enrichProductWithLiveSignal(rawProduct, summary.world),
    metricHistory[metricHistory.length - 1]
  );
  const quickTake = buildQuickTake(product, metricHistory);

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-8">
      <Link
        href="/"
        className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-muted transition hover:bg-white/[0.05] hover:text-foreground sm:-ml-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Quay lại bảng giá
      </Link>
      <div className="mb-4 rounded-lg border border-white/[0.08] bg-panel/60 p-4 shadow-panel sm:mb-6 sm:bg-transparent sm:p-0 sm:shadow-none md:flex md:items-end md:justify-between md:border-0">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted sm:text-sm sm:normal-case sm:tracking-normal">
            {product.brand}
          </p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {product.name}
          </h1>
        </div>
        <div className="mt-3 sm:mt-0">
          <SignalBadge signal={product.signal} />
        </div>
      </div>

      <section
        aria-label="Chỉ số hiện tại"
        className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4"
      >
        <MetricCard title="Mua vào" value={formatVnd(product.buyPrice)} />
        <MetricCard title="Bán ra" value={formatVnd(product.sellPrice)} emphasis />
        <MetricCard
          title="Premium"
          value={formatPercentForMeta(product.premiumSellPct)}
          meta="So với giá thế giới quy đổi"
        />
        <MetricCard
          title="Spread"
          value={formatVnd(product.spreadAbsVnd)}
          meta={`${formatPercentForMeta(product.spreadPct)} giá bán`}
        />
      </section>

      <section className="my-4 rounded-lg border border-border bg-panel p-3 sm:my-6 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">Nhận định nhanh</h2>
            <div className="mt-2 flex flex-wrap gap-2 sm:mt-3">
              <span className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground">
                Điểm tín hiệu {product.score}/100
              </span>
              <SignalBadge signal={product.signal} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 lg:justify-end">
            {quickTake.badges.map((badge) => (
              <span
                key={badge}
                className="rounded-md border border-warning/25 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
        <ul className="mt-3 space-y-1.5 text-[13px] leading-5 text-muted sm:mt-4 sm:space-y-2 sm:text-sm sm:leading-6">
          {quickTake.points.map((point) => (
            <li
              key={point}
              className="relative border-t border-white/[0.06] py-2 pl-4 first:border-t-0 first:pt-0 before:absolute before:left-0 before:top-[1.05rem] before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold/70 first:before:top-2"
            >
              {point}
            </li>
          ))}
        </ul>
      </section>

      <MetricChartsPanel productCode={productCode} initialData={metricHistory} />
    </main>
  );
}

function toFiniteNumber(value: number | string | undefined): number | null {
  if (value === undefined) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const current = sorted[base] ?? 0;
  const next = sorted[base + 1];
  return next === undefined ? current : current + rest * (next - current);
}

function percentileRank(values: number[], value: number): number {
  if (!values.length) return 0;
  const lowerOrEqual = values.filter((item) => item <= value).length;
  return Math.round((lowerOrEqual / values.length) * 100);
}

function formatPointDifference(value: number): string {
  const direction = value >= 0 ? "cao hơn" : "thấp hơn";
  return `${direction} ${Math.abs(value * 100).toLocaleString("vi-VN", {
    maximumFractionDigits: 2
  })} điểm %`;
}

function buildQuickTake(
  product: ReturnType<typeof enrichProductWithLiveSignal>,
  history: MetricPoint[]
): { badges: string[]; points: string[] } {
  const premiumValues = history
    .map((point) => toFiniteNumber(point.premiumSellPct))
    .filter((value): value is number => value !== null);
  const spreadValues = history
    .map((point) => toFiniteNumber(point.spreadPct))
    .filter((value): value is number => value !== null);

  if (!premiumValues.length || !spreadValues.length) {
    return {
      badges: ["Thiếu lịch sử"],
      points: ["Chưa có đủ dữ liệu lịch sử để diễn giải premium và spread."]
    };
  }

  const premiumMedian = quantile(premiumValues, 0.5);
  const spreadMedian = quantile(spreadValues, 0.5);
  const premiumRank = percentileRank(premiumValues, product.premiumSellPct);
  const spreadRank = percentileRank(spreadValues, product.spreadPct);
  const premiumDelta = product.premiumSellPct - premiumMedian;
  const spreadDelta = product.spreadPct - spreadMedian;
  const premiumIsHigh = premiumRank >= 80;
  const spreadIsHigh = spreadRank >= 80;

  const badges = [
    premiumIsHigh ? "Premium cao" : "Premium bình thường",
    spreadIsHigh ? "Spread rộng" : "Spread bình thường",
    premiumIsHigh || spreadIsHigh ? "Mua mới bất lợi" : "Theo dõi thêm"
  ];

  return {
    badges,
    points: [
      `Premium bán hiện ${formatPointDifference(
        premiumDelta
      )} so với mức thường gặp, cao hơn ${premiumRank}% số ngày trong lịch sử 180 ngày.`,
      `Spread hiện là ${formatVnd(product.spreadAbsVnd)} (${formatPercentForMeta(
        product.spreadPct
      )}), ${formatPointDifference(spreadDelta)} so với mức thường gặp và cao hơn ${spreadRank}% số ngày.`,
      premiumIsHigh || spreadIsHigh
        ? "Mua mới lúc này kém hấp dẫn vì premium hoặc spread đang bất lợi so với lịch sử gần đây."
        : "Premium và spread chưa ở vùng quá bất lợi; vẫn nên theo dõi thêm diễn biến giá thế giới và tỷ giá."
    ]
  };
}

function syncProductWithHistoryMetric<T extends ReturnType<typeof enrichProductWithLiveSignal>>(
  product: T,
  metric: MetricPoint | undefined
): T {
  if (!metric) return product;

  const buy = toFiniteNumber(metric.domesticBuyPriceVnd);
  const sell = toFiniteNumber(metric.domesticSellPriceVnd);
  const premiumSellPct = toFiniteNumber(metric.premiumSellPct);
  const spreadPct = toFiniteNumber(metric.spreadPct);

  if (buy === null || sell === null || premiumSellPct === null || spreadPct === null)
    return product;

  const impliedWorldVnd = premiumSellPct > -1 ? sell / (1 + premiumSellPct) : 0;
  const premiumBuyPct = impliedWorldVnd > 0 ? buy / impliedWorldVnd - 1 : product.premiumBuyPct;

  return {
    ...product,
    buyPrice: buy,
    sellPrice: sell,
    premiumSellPct,
    premiumBuyPct,
    spreadAbsVnd: sell - buy,
    spreadPct
  };
}

function MetricCard({
  title,
  value,
  meta,
  emphasis = false,
  className
}: {
  title: string;
  value: string;
  meta?: string;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-3 sm:p-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted sm:text-sm sm:normal-case sm:tracking-normal">
          {title}
        </div>
        <div
          className={`mt-1 whitespace-nowrap text-[15px] font-semibold leading-tight sm:mt-2 sm:text-lg ${
            emphasis ? "text-gold" : "text-foreground"
          }`}
        >
          {value}
        </div>
        {meta ? (
          <div className="mt-1 text-[11px] font-medium text-muted sm:text-xs">{meta}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatPercentForMeta(value: number): string {
  return `${(value * 100).toLocaleString("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}
