"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { MetricPoint } from "../../lib/api-client";
import { formatNumber, formatPercent, formatVnd } from "../../lib/utils";

type ChartPoint = {
  time: string;
  dateLabel: string;
  fullDate: string;
  sell: number;
  premium: number;
  spread: number;
};

type SeriesKey = "sell" | "premium" | "spread";

const CHART_COLORS: Record<SeriesKey, string> = {
  sell: "#facc15",
  premium: "#22c55e",
  spread: "#f97316"
};
const CHART_GRID = "#334155";
const CHART_TEXT = "#94a3b8";

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function toPoint(point: MetricPoint): ChartPoint | null {
  const date = new Date(point.time);
  const sell = toNumber(point.domesticSellPriceVnd);
  const premium = toNumber(point.premiumSellPct);
  const spread = toNumber(point.spreadPct);

  if (
    Number.isNaN(date.getTime()) ||
    !Number.isFinite(sell) ||
    !Number.isFinite(premium) ||
    !Number.isFinite(spread)
  ) {
    return null;
  }

  return {
    time: point.time,
    dateLabel: date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
    fullDate: date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }),
    sell,
    premium,
    spread
  };
}

function getExtent(points: ChartPoint[], key: SeriesKey): [number, number] {
  const values = points.map((point) => point[key]);
  return [Math.min(...values), Math.max(...values)];
}

function getPriceDomain(points: ChartPoint[]): [number, number] {
  const [min, max] = getExtent(points, "sell");
  const padding = Math.max((max - min) * 0.18, max * 0.005);
  return [Math.max(0, min - padding), max + padding];
}

function getPercentDomain(points: ChartPoint[]): [number, number] {
  const values = points.flatMap((point) => [point.premium, point.spread]);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const padding = Math.max((max - min) * 0.18, 0.002);
  return [min - padding, max + padding];
}

function getChange(points: ChartPoint[], key: SeriesKey): number {
  if (points.length < 2) return 0;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 0;
  return last[key] - first[key];
}

export function MetricCharts({ data }: { data: MetricPoint[] }) {
  const points = data.map(toPoint).filter((point): point is ChartPoint => point !== null);
  const latest = points[points.length - 1];

  if (!latest) {
    return (
      <section className="rounded-lg border border-border bg-panel p-5 text-sm text-muted">
        Dữ liệu biểu đồ chưa hợp lệ.
      </section>
    );
  }

  const priceDomain = getPriceDomain(points);
  const priceExtent = getExtent(points, "sell");
  const percentDomain = getPercentDomain(points);
  const priceChange = getChange(points, "sell");
  const premiumChange = getChange(points, "premium");

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-panel shadow-panel">
        <ChartHeader
          title="Giá bán ra"
          primary={formatVnd(latest.sell)}
          stats={[
            { label: "Biến động", value: formatSignedVnd(priceChange) },
            { label: "Thấp nhất", value: formatVnd(priceExtent[0]) },
            { label: "Cao nhất", value: formatVnd(priceExtent[1]) }
          ]}
        />
        <div className="h-[340px] px-2 pb-4 pt-2 sm:px-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 12, right: 20, bottom: 4, left: 8 }}>
              <defs>
                <linearGradient id="sellGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.sell} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={CHART_COLORS.sell} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="4 6" vertical={false} />
              <XAxis
                dataKey="dateLabel"
                minTickGap={28}
                tick={{ fill: CHART_TEXT, fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: CHART_GRID }}
              />
              <YAxis
                domain={priceDomain}
                tickFormatter={(value) => compactVnd(Number(value))}
                tick={{ fill: CHART_TEXT, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={78}
              />
              <Tooltip
                content={<ChartTooltip mode="price" />}
                cursor={{ stroke: CHART_TEXT, strokeDasharray: "4 4" }}
              />
              <Area
                type="monotone"
                dataKey="sell"
                name="Giá bán ra"
                stroke={CHART_COLORS.sell}
                strokeWidth={2.5}
                fill="url(#sellGradient)"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0, fill: CHART_COLORS.sell }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-panel shadow-panel">
        <ChartHeader
          title="Premium và spread"
          primary={formatPercent(latest.premium)}
          stats={[
            { label: "Premium", value: formatPercent(latest.premium) },
            { label: "Spread", value: formatPercent(latest.spread) },
            { label: "Premium đổi", value: formatSignedPercent(premiumChange) },
            { label: "Spread đổi", value: formatSignedPercent(getChange(points, "spread")) }
          ]}
        />
        <div className="h-[360px] px-2 pb-4 pt-2 sm:px-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 12, right: 20, bottom: 4, left: 8 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="4 6" vertical={false} />
              <ReferenceLine y={0} stroke={CHART_TEXT} strokeDasharray="3 5" />
              <XAxis
                dataKey="dateLabel"
                minTickGap={28}
                tick={{ fill: CHART_TEXT, fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: CHART_GRID }}
              />
              <YAxis
                domain={percentDomain}
                tickFormatter={(value) => compactPercent(Number(value))}
                tick={{ fill: CHART_TEXT, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={64}
              />
              <Tooltip
                content={<ChartTooltip mode="percent" />}
                cursor={{ stroke: CHART_TEXT, strokeDasharray: "4 4" }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ color: CHART_TEXT, fontSize: 12, paddingBottom: 12 }}
              />
              <Line
                type="monotone"
                dataKey="premium"
                name="Premium"
                stroke={CHART_COLORS.premium}
                strokeWidth={2.25}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: CHART_COLORS.premium }}
              />
              <Line
                type="monotone"
                dataKey="spread"
                name="Spread"
                stroke={CHART_COLORS.spread}
                strokeWidth={2.25}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: CHART_COLORS.spread }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

export default MetricCharts;

function ChartHeader({
  title,
  primary,
  stats
}: {
  title: string;
  primary: string;
  stats: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:px-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <div className="mt-2 break-words text-2xl font-semibold text-foreground">{primary}</div>
      </div>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={`${stat.label}-${stat.value}`} className="min-w-0">
            <dt className="text-xs text-muted">{stat.label}</dt>
            <dd className="mt-1 break-words font-medium text-foreground">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  mode
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    dataKey?: string;
    value?: number | string;
    payload?: ChartPoint;
    color?: string;
  }>;
  mode: "price" | "percent";
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-panel">
      <div className="mb-2 font-medium text-foreground">{point?.fullDate}</div>
      <div className="space-y-1">
        {payload.map((item) => (
          <div
            key={String(item.dataKey)}
            className="flex min-w-[180px] items-center justify-between gap-4"
          >
            <span className="flex items-center gap-2 text-muted">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color ?? CHART_TEXT }}
              />
              {item.name}
            </span>
            <span className="font-medium text-foreground">
              {mode === "price" ? formatVnd(Number(item.value)) : formatPercent(Number(item.value))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function compactVnd(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${formatNumber(value / 1_000_000)}tr`;
  if (Math.abs(value) >= 1_000) return `${formatNumber(value / 1_000)}k`;
  return formatNumber(value);
}

function compactPercent(value: number): string {
  return `${formatNumber(value * 100)}%`;
}

function formatSignedVnd(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatVnd(value)}`;
}

function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPercent(value)}`;
}
