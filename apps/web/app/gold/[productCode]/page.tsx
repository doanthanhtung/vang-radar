import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GOLD_PRODUCTS, PRODUCT_CODES } from "@vang-radar/domain";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { SignalBadge } from "../../../features/market/signal-badge";
import { MetricChartsPanel } from "../../../features/products/metric-charts-panel";
import { getMarketSummary } from "../../../lib/api-client";
import { enrichProductWithLiveSignal } from "../../../lib/vang-score";
import { createPageMetadata } from "../../../lib/seo";
import {
  formatPercent,
  formatVnd,
  getPremiumLevel,
  getSpreadLevel,
  getSpreadPremiumTextClassName,
  type SpreadPremiumLevel
} from "../../../lib/utils";

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
  const product = enrichProductWithLiveSignal(rawProduct, summary.world);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-muted">{product.brand}</p>
          <h1 className="text-3xl font-semibold">{product.name}</h1>
        </div>
        <SignalBadge signal={product.signal} />
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard title="Mua vào" value={formatVnd(product.buyPrice)} />
        <MetricCard title="Bán ra" value={formatVnd(product.sellPrice)} />
        <MetricCard
          title="Premium bán"
          value={formatPercent(product.premiumSellPct)}
          level={getPremiumLevel(product.premiumSellPct)}
        />
        <MetricCard
          title="Premium mua"
          value={formatPercent(product.premiumBuyPct)}
          level={getPremiumLevel(product.premiumBuyPct)}
        />
        <MetricCard title="Spread tuyệt đối" value={formatVnd(product.spreadAbsVnd)} />
        <MetricCard
          title="Spread"
          value={formatPercent(product.spreadPct)}
          level={getSpreadLevel(product.spreadPct)}
        />
        <MetricCard title="Độ tin cậy" value={formatPercent(product.confidence)} />
      </section>

      <section className="my-6 grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Tín hiệu</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 text-4xl font-semibold">{product.score}/100</div>
            <ul className="space-y-3 text-sm leading-6 text-muted">
              {product.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <div className="rounded-lg border border-border bg-panel p-5">
          <h2 className="text-base font-semibold">Diễn giải nhanh</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Tín hiệu được tính bằng công thức cố định dựa trên premium, spread, momentum và chất
            lượng dữ liệu. MVP không dùng AI/LLM để đưa ra quyết định mua bán.
          </p>
        </div>
      </section>

      <MetricChartsPanel productCode={productCode} />
    </main>
  );
}

function MetricCard({
  title,
  value,
  level
}: {
  title: string;
  value: string;
  level?: SpreadPremiumLevel | null;
}) {
  return (
    <Card>
      <CardContent>
        <div className="text-sm text-muted">{title}</div>
        <div className="mt-2 text-lg font-semibold">{value}</div>
        {level ? (
          <div className={`mt-0.5 text-xs ${getSpreadPremiumTextClassName(level)}`}>
            [{level.label}]
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
