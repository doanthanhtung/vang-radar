import { LiveMarketDashboard } from "../features/market/live-market-dashboard";
import { getMarketSummary, type MarketSummary } from "../lib/api-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hôm nay có nên mua vàng không? | VangScore",
  description: "Xem VangScore, premium, spread và kết luận hôm nay để cân nhắc mua vàng tại Việt Nam.",
  openGraph: {
    title: "Hôm nay có nên mua vàng không? | VangScore",
    description: "Premium, spread và kết luận ngắn gọn cho người đang cân nhắc mua vàng.",
    images: ["/dashboard-gold.png"]
  }
};

export const revalidate = 60;
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const fallback: MarketSummary = {
    time: new Date().toISOString(),
    world: { xauUsdPerOz: 0, usdVnd: 0, worldVndPerLuong: 0, change7d: null },
    products: []
  };
  const summary = await getMarketSummary().catch(() => fallback);
  return <LiveMarketDashboard initialSummary={summary} />;
}
