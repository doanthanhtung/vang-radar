import type { DecisionSignal } from "@vang-radar/domain";

const serverBaseUrl = process.env.PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";
const browserBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.PUBLIC_API_BASE_URL ?? serverBaseUrl;

function getBaseUrl(): string {
  if (typeof window === "undefined") return serverBaseUrl;
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return "/api/v1";
  }
  return browserBaseUrl;
}

export interface MarketSummaryProduct {
  code: string;
  name: string;
  brand: string;
  buyPrice: number;
  sellPrice: number;
  premiumSellPct: number;
  premiumBuyPct: number;
  spreadAbsVnd: number;
  spreadPct: number;
  signal: DecisionSignal;
  score: number;
  confidence: number;
  reasons: string[];
  premiumPercentile180d: number | null;
  spreadPercentile180d: number | null;
  historySampleSize180d: number;
  xauMomentum7d: number | null;
  xauMomentum30d: number | null;
  xauMomentum7dDays: number | null;
  xauMomentum30dDays: number | null;
  domesticMomentum7d: number | null;
  domesticMomentum7dDays: number | null;
  previousDayClose: {
    buyPriceVnd: number;
    sellPriceVnd: number;
  } | null;
}

export interface MarketSummary {
  time: string;
  world: {
    xauUsdPerOz: number;
    usdVnd: number;
    worldVndPerLuong: number;
    change7d: number | null;
  };
  macro: {
    dxy: number | null;
  };
  products: MarketSummaryProduct[];
}

export interface MetricPoint {
  time: string;
  domesticBuyPriceVnd?: string | number;
  domesticSellPriceVnd: string | number;
  premiumSellPct: string | number;
  spreadPct: string | number;
}

export interface DailyGoldPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  buyClose: number;
  close: number;
  isToday: boolean;
  isTemporaryClose: boolean;
  buyChangeVnd: number | null;
  sellChangeVnd: number | null;
  changePercent: number | null;
  intradayRangePercent: number | null;
  spreadPercent: number | null;
  premiumPercent: number | null;
}

export interface GoldPriceHistory {
  type: string;
  days: number;
  data: DailyGoldPrice[];
}

export interface WorldGoldHistoryPoint {
  time: string;
  price: number;
}

export interface UsdVndHistoryPoint {
  time: string;
  rate: number;
}

export interface DxyHistoryPoint {
  time: string;
  value: number;
}

export interface NotificationSubscription {
  email: string;
  status: string;
  buyAlertEnabled: boolean;
  subscribedAt: string;
  alreadySubscribed: boolean;
  confirmationEmailSent: boolean;
}

type ApiRequestInit = RequestInit & {
  next?: {
    revalidate?: number | false;
  };
};

export async function fetchApi<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const hasExplicitCache = init.cache !== undefined || init.next !== undefined;
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    ...(hasExplicitCache ? {} : { next: { revalidate: 60 } }),
    headers: {
      Accept: "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getApiUrl(path: string): string {
  return `${getBaseUrl()}${path}`;
}

export async function getMarketSummary(): Promise<MarketSummary> {
  return fetchApi<MarketSummary>("/market/summary", { cache: "no-store" });
}

export async function getWorldGoldHistory(days: 7 | 30): Promise<WorldGoldHistoryPoint[]> {
  return fetchApi<WorldGoldHistoryPoint[]>(`/market/world-gold?days=${days}`, {
    cache: "no-store"
  });
}

export async function getUsdVndHistory(days: 7 | 30): Promise<UsdVndHistoryPoint[]> {
  return fetchApi<UsdVndHistoryPoint[]>(`/market/usd-vnd?days=${days}`, { cache: "no-store" });
}

export async function getDxyHistory(days: 7 | 30): Promise<DxyHistoryPoint[]> {
  return fetchApi<DxyHistoryPoint[]>(`/market/dxy?days=${days}`, { cache: "no-store" });
}

export async function subscribeToGoldAlerts(email: string): Promise<NotificationSubscription> {
  return fetchApi<NotificationSubscription>("/notifications/subscribe", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email })
  });
}

export async function getMetricHistory(
  productCode: string,
  range = "180d"
): Promise<MetricPoint[]> {
  return fetchApi<MetricPoint[]>(
    `/metrics/history?productCode=${encodeURIComponent(productCode)}&range=${range}`,
    { cache: "no-store" }
  );
}

export async function getGoldPriceHistory(type: string, days = 7): Promise<GoldPriceHistory> {
  return fetchApi<GoldPriceHistory>(
    `/gold-prices/history?type=${encodeURIComponent(type)}&days=${days}`,
    { cache: "no-store" }
  );
}

export async function getAdminJson(path: string, username: string, password: string) {
  return fetchApi<unknown>(path, {
    cache: "no-store",
    headers: {
      Authorization: `Basic ${btoa(`${username}:${password}`)}`
    }
  });
}

export async function postAdminJson(
  path: string,
  username: string,
  password: string,
  body?: unknown
) {
  return fetchApi<unknown>(path, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Basic ${btoa(`${username}:${password}`)}`,
      "Content-Type": "application/json"
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

export async function deleteAdminJson(path: string, username: string, password: string) {
  return fetchApi<unknown>(path, {
    method: "DELETE",
    cache: "no-store",
    headers: {
      Authorization: `Basic ${btoa(`${username}:${password}`)}`
    }
  });
}
