"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
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
  buy: number | null;
  sell: number;
  spreadAbs: number | null;
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
const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function formatVietnamDate(date: Date, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString("vi-VN", { timeZone: VIETNAM_TIME_ZONE, ...options });
}

function toPoint(point: MetricPoint): ChartPoint | null {
  const date = new Date(point.time);
  const buy = point.domesticBuyPriceVnd === undefined ? null : toNumber(point.domesticBuyPriceVnd);
  const sell = toNumber(point.domesticSellPriceVnd);
  const premium = toNumber(point.premiumSellPct);
  const spread = toNumber(point.spreadPct);

  if (
    Number.isNaN(date.getTime()) ||
    (buy !== null && !Number.isFinite(buy)) ||
    !Number.isFinite(sell) ||
    !Number.isFinite(premium) ||
    !Number.isFinite(spread)
  ) {
    return null;
  }

  return {
    time: point.time,
    dateLabel: formatVietnamDate(date, { day: "2-digit", month: "2-digit" }),
    fullDate: formatVietnamDate(date, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }),
    buy,
    sell,
    spreadAbs: buy === null ? null : sell - buy,
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

function getPercentDomain(points: ChartPoint[], key: "premium" | "spread"): [number, number] {
  const values = points.map((point) => point[key]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.18, 0.002);
  return [Math.max(0, min - padding), max + padding];
}

function getChange(points: ChartPoint[], key: SeriesKey): number {
  if (points.length < 2) return 0;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 0;
  return last[key] - first[key];
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

function getPercentStats(points: ChartPoint[], key: "premium" | "spread") {
  const values = points.map((point) => point[key]);
  const latest = values[values.length - 1] ?? 0;
  return {
    latest,
    median: quantile(values, 0.5),
    percentile: percentileRank(values, latest)
  };
}

export function MetricCharts({
  data,
  summaryLabel,
  expectedDays
}: {
  data: MetricPoint[];
  summaryLabel: string;
  expectedDays: number;
}) {
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
  const premiumDomain = getPercentDomain(points, "premium");
  const spreadDomain = getPercentDomain(points, "spread");
  const priceChange = getChange(points, "sell");
  const premiumStats = getPercentStats(points, "premium");
  const spreadStats = getPercentStats(points, "spread");

  return (
    <div className="space-y-3 sm:space-y-4">
      <HistorySummaryTable
        days={points.length}
        summaryLabel={summaryLabel}
        expectedDays={expectedDays}
        premiumStats={premiumStats}
        spreadStats={spreadStats}
        currentSpreadAmount={latest.spreadAbs}
      />

      <section className="overflow-hidden rounded-lg border border-border bg-panel shadow-panel">
        <ChartHeader
          title="Giá bán ra"
          primary={formatVnd(latest.sell)}
          stats={[
            { label: "So với đầu kỳ", value: formatSignedVnd(priceChange) },
            { label: "Thấp nhất", value: formatVnd(priceExtent[0]) },
            { label: "Cao nhất", value: formatVnd(priceExtent[1]) }
          ]}
        />
        <div
          className="h-64 px-1 pb-3 pt-2 sm:h-[340px] sm:px-4 sm:pb-4"
          role="img"
          aria-label={`Biểu đồ giá bán ra ${summaryLabel}. Hiện tại ${formatVnd(latest.sell)}.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 10, right: 10, bottom: 2, left: 0 }}>
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
                tick={{ fill: CHART_TEXT, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: CHART_GRID }}
              />
              <YAxis
                domain={priceDomain}
                tickFormatter={(value) => compactVnd(Number(value))}
                tick={{ fill: CHART_TEXT, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={58}
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

      <section className="overflow-hidden rounded-lg border border-border bg-panel shadow-panel">
        <ChartHeader
          title="Premium so với vàng thế giới"
          description="Đường xanh là premium từng ngày; đường tham chiếu cho thấy mức thường gặp."
        />
        <div
          className="h-60 px-1 pb-3 pt-2 sm:h-[320px] sm:px-4 sm:pb-4"
          role="img"
          aria-label={`Biểu đồ premium ${summaryLabel}. Hiện tại ${formatPercent(latest.premium)}.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 10, right: 10, bottom: 2, left: 0 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="4 6" vertical={false} />
              <ReferenceLine y={0} stroke={CHART_TEXT} strokeDasharray="3 5" />
              <ReferenceLine
                y={premiumStats.median}
                stroke="#e2e8f0"
                strokeDasharray="4 4"
                label={<ReferenceLabel value="Thường gặp" />}
              />
              <XAxis
                dataKey="dateLabel"
                minTickGap={28}
                tick={{ fill: CHART_TEXT, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: CHART_GRID }}
              />
              <YAxis
                domain={premiumDomain}
                tickFormatter={(value) => compactPercent(Number(value))}
                tick={{ fill: CHART_TEXT, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip
                content={<ChartTooltip mode="percent" />}
                cursor={{ stroke: CHART_TEXT, strokeDasharray: "4 4" }}
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
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-panel shadow-panel">
        <ChartHeader
          title="Spread mua bán"
          primary={latest.spreadAbs === null ? undefined : formatVnd(latest.spreadAbs)}
          description="Đường cam là spread từng ngày; đường tham chiếu cho thấy mức thường gặp."
          stats={[
            { label: "Hiện tại", value: formatPercent(latest.spread) },
            { label: "Thường gặp", value: formatPercent(spreadStats.median) }
          ]}
        />
        <div
          className="h-60 px-1 pb-3 pt-2 sm:h-[300px] sm:px-4 sm:pb-4"
          role="img"
          aria-label={`Biểu đồ spread ${summaryLabel}. Hiện tại ${formatPercent(latest.spread)}.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 10, right: 10, bottom: 2, left: 0 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="4 6" vertical={false} />
              <ReferenceLine
                y={spreadStats.median}
                stroke="#e2e8f0"
                strokeDasharray="4 4"
                label={<ReferenceLabel value="Thường gặp" />}
              />
              <XAxis
                dataKey="dateLabel"
                minTickGap={28}
                tick={{ fill: CHART_TEXT, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: CHART_GRID }}
              />
              <YAxis
                domain={spreadDomain}
                tickFormatter={(value) => compactPercent(Number(value))}
                tick={{ fill: CHART_TEXT, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip
                content={<ChartTooltip mode="percent" />}
                cursor={{ stroke: CHART_TEXT, strokeDasharray: "4 4" }}
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
  stats,
  description
}: {
  title: string;
  primary?: string | undefined;
  stats?: Array<{ label: string; value: string }>;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border px-3 py-3 sm:gap-4 sm:px-5 sm:py-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground sm:text-base">
          {title}
        </h2>
        {primary ? (
          <div className="mt-1 whitespace-nowrap text-xl font-semibold leading-tight text-foreground sm:mt-2 sm:text-2xl">
            {primary}
          </div>
        ) : null}
        {description ? (
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted sm:mt-2 sm:text-sm sm:leading-6">
            {description}
          </p>
        ) : null}
      </div>
      {stats?.length ? (
        <dl className="grid grid-cols-3 gap-2 text-right text-xs sm:grid-cols-3 sm:gap-x-5 sm:gap-y-2 sm:text-sm">
          {stats.map((stat) => (
            <div
              key={`${stat.label}-${stat.value}`}
              className="min-w-0 rounded-md bg-background/35 px-2 py-1.5 sm:bg-transparent sm:p-0"
            >
              <dt className="truncate text-[10px] text-muted sm:text-xs">{stat.label}</dt>
              <dd className="mt-1 truncate font-medium text-foreground">{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function HistorySummaryTable({
  days,
  summaryLabel,
  expectedDays,
  premiumStats,
  spreadStats,
  currentSpreadAmount
}: {
  days: number;
  summaryLabel: string;
  expectedDays: number;
  premiumStats: ReturnType<typeof getPercentStats>;
  spreadStats: ReturnType<typeof getPercentStats>;
  currentSpreadAmount: number | null;
}) {
  const premiumDifference = premiumStats.latest - premiumStats.median;
  const spreadDifference = spreadStats.latest - spreadStats.median;
  const rows = [
    {
      label: "Premium",
      current: formatPercent(premiumStats.latest),
      typical: formatPercent(premiumStats.median),
      position: `Cao hơn ${premiumStats.percentile}% số ngày`,
      difference: formatMedianDifference(premiumDifference),
      accent: premiumDifference > 0 ? "text-warning" : "text-positive",
      note: "Chênh so với vàng thế giới quy đổi"
    },
    {
      label: "Spread",
      current:
        currentSpreadAmount === null
          ? formatPercent(spreadStats.latest)
          : formatVnd(currentSpreadAmount),
      currentMeta: currentSpreadAmount === null ? undefined : formatPercent(spreadStats.latest),
      typical: formatPercent(spreadStats.median),
      position: `Cao hơn ${spreadStats.percentile}% số ngày`,
      difference: formatMedianDifference(spreadDifference),
      accent: spreadDifference > 0 ? "text-warning" : "text-positive",
      note: "Chênh giữa giá mua và giá bán"
    }
  ];

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-panel shadow-panel">
      <div className="border-b border-border px-3 py-3 sm:px-5 sm:py-4">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground sm:text-base">
          Tóm tắt lịch sử {summaryLabel}
        </h2>
        <p className="mt-1 text-xs leading-5 text-muted sm:mt-2 sm:text-sm sm:leading-6">
          {days < expectedDays
            ? `Hiện có ${days} ngày dữ liệu trong kỳ này. So sánh premium và spread hiện tại với mức thường gặp trong phần lịch sử đã có.`
            : "So sánh premium và spread hiện tại với mức thường gặp trong lịch sử."}
        </p>
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th className="w-[18%] px-5 py-3 font-medium">Chỉ số</th>
              <th className="w-[16%] px-5 py-3 font-medium">Hiện tại</th>
              <th className="w-[18%] px-5 py-3 font-medium">Mức thường gặp</th>
              <th className="w-[22%] px-5 py-3 font-medium">Vị trí lịch sử</th>
              <th className="w-[26%] px-5 py-3 font-medium">So với lịch sử</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-border last:border-b-0">
                <th className="px-5 py-4 align-top font-medium text-foreground">
                  <div>{row.label}</div>
                  <div className="mt-1 text-xs font-normal text-muted">{row.note}</div>
                </th>
                <td className={`px-5 py-4 align-top text-lg font-semibold ${row.accent}`}>
                  <div>{row.current}</div>
                  {"currentMeta" in row && row.currentMeta ? (
                    <div className="mt-1 text-xs font-medium text-muted">{row.currentMeta}</div>
                  ) : null}
                </td>
                <td className="px-5 py-4 align-top text-foreground">{row.typical}</td>
                <td className="px-5 py-4 align-top text-foreground">{row.position}</td>
                <td className="px-5 py-4 align-top">
                  <div className="font-medium text-foreground">{row.difference}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-border md:hidden">
        {rows.map((row) => (
          <div key={row.label} className="p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <h3 className="font-medium leading-tight text-foreground">{row.label}</h3>
                <p className="mt-1 text-[11px] leading-4 text-muted">{row.note}</p>
              </div>
              <div
                className={`whitespace-nowrap text-right text-lg font-semibold leading-none ${row.accent}`}
              >
                <span>{row.current}</span>
                {"currentMeta" in row && row.currentMeta ? (
                  <span className="mt-1 block text-xs font-medium leading-none text-muted">
                    {row.currentMeta}
                  </span>
                ) : null}
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-background/30 px-2 py-1.5">
                <dt className="text-[10px] text-muted">Thường gặp</dt>
                <dd className="mt-1 font-medium text-foreground">{row.typical}</dd>
              </div>
              <div className="rounded-md bg-background/30 px-2 py-1.5">
                <dt className="text-[10px] text-muted">Vị trí</dt>
                <dd className="mt-1 font-medium text-foreground">{row.position}</dd>
              </div>
              <div className="rounded-md bg-background/30 px-2 py-1.5">
                <dt className="text-[10px] text-muted">So với lịch sử</dt>
                <dd className="mt-1 font-medium text-foreground">{row.difference}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReferenceLabel({
  value,
  viewBox
}: {
  value: string;
  viewBox?: { x?: number; y?: number };
}) {
  if (!viewBox) return null;
  return (
    <text
      x={(viewBox.x ?? 0) + 6}
      y={(viewBox.y ?? 0) - 4}
      fill={CHART_TEXT}
      fontSize={11}
      textAnchor="start"
    >
      {value}
    </text>
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
  const priceRows =
    mode === "price" && point?.buy !== null
      ? [
          { name: "Giá mua vào", value: point?.buy, color: "#38bdf8" },
          { name: "Giá bán ra", value: point?.sell, color: CHART_COLORS.sell }
        ]
      : null;

  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-panel">
      <div className="mb-2 font-medium text-foreground">{point?.fullDate}</div>
      <div className="space-y-1">
        {(priceRows ?? payload).map((item) => (
          <div
            key={String("dataKey" in item ? item.dataKey : item.name)}
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

function formatMedianDifference(value: number): string {
  if (Math.abs(value) < 0.0005) return "Gần mức thường gặp";
  const direction = value > 0 ? "Cao hơn" : "Thấp hơn";
  return `${direction} ${formatNumber(Math.abs(value) * 100)} điểm %`;
}
