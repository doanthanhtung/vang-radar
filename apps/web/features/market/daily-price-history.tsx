"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { DailyGoldPrice, GoldPriceHistory } from "../../lib/api-client";

const CHART_GRID = "#2a3648";
const CHART_TEXT = "#94a3b8";
const CHART_GOLD = "#d9b159";
const CHART_BUY = "#38bdf8";

function formatCompactPrice(value: number): string {
  return `${(value / 1_000_000).toLocaleString("vi-VN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })}tr`;
}

function formatFullPrice(value: number): string {
  return `${value.toLocaleString("vi-VN")} ₫`;
}

function formatSignedVnd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value === 0) return "0 ₫";
  const sign = value > 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toLocaleString("vi-VN")} ₫`;
}

function formatNonZeroSignedVnd(value: number | null): string | null {
  if (value === 0) return null;
  return formatSignedVnd(value);
}

function changeColor(value: number | null): string {
  if (value === null || value === 0) return "text-muted";
  return value > 0 ? "text-positive" : "text-red-400";
}

function dateLabel(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function shortDateLabel(date: string): string {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

function chartDomain(data: DailyGoldPrice[]): [number, number] {
  const minimum = Math.min(...data.map((point) => point.close));
  const maximum = Math.max(...data.map((point) => point.close));
  const margin = Math.max(maximum * 0.01, 100_000);
  return [Math.max(0, minimum - margin), maximum + margin];
}

export function DailyPriceHistory({ history }: { history: GoldPriceHistory }) {
  if (history.data.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted">
        Chưa có dữ liệu lịch sử cho loại vàng này.
      </div>
    );
  }

  const latest = history.data[history.data.length - 1]!;
  const domain = chartDomain(history.data);
  const latestChange = formatNonZeroSignedVnd(latest.sellChangeVnd);
  const lowest = Math.min(...history.data.map((point) => point.close));
  const highest = Math.max(...history.data.map((point) => point.close));
  const title =
    history.data.length >= 7
      ? "Diễn biến 7 ngày gần nhất"
      : `Diễn biến ${history.data.length}/7 ngày gần nhất`;

  return (
    <section className="rounded-lg border border-white/[0.08] bg-slate-950/24 p-3 sm:p-4">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold tracking-tight text-foreground">{title}</h3>
        </div>
        <span className="w-fit rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[11px] text-muted">
          Lịch sử gần nhất
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:mb-4 sm:grid-cols-4">
        <SummaryCard
          label="Bán ra hiện tại"
          value={formatFullPrice(latest.close)}
          meta={latestChange ?? undefined}
          tone={changeColor(latest.sellChangeVnd)}
        />
        <SummaryCard label="Mua vào hiện tại" value={formatFullPrice(latest.buyClose)} />
        <SummaryCard label="Thấp nhất 7N" value={formatFullPrice(lowest)} />
        <SummaryCard label="Cao nhất 7N" value={formatFullPrice(highest)} />
      </div>

      <div
        className="h-[22rem] rounded-md border border-white/[0.06] bg-background/35 p-2 sm:h-[30rem] sm:p-3"
        role="img"
        aria-label={`${title}. Giá bán mới nhất ${formatFullPrice(latest.close)}.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history.data} margin={{ top: 10, right: 12, bottom: 4, left: 6 }}>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="4 6" />
            <XAxis
              dataKey="date"
              tickFormatter={shortDateLabel}
              interval={0}
              tick={{ fill: CHART_TEXT, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: CHART_GRID }}
            />
            <YAxis
              dataKey="close"
              domain={domain}
              tickFormatter={formatCompactPrice}
              tick={{ fill: CHART_TEXT, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              content={<HistoryTooltip />}
              cursor={{ stroke: CHART_TEXT, strokeDasharray: "4 4" }}
            />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="plainline"
              wrapperStyle={{ color: CHART_TEXT, fontSize: 12, paddingBottom: 12 }}
            />
            <Line
              type="monotone"
              dataKey="buyClose"
              name="Mua vào"
              stroke={CHART_BUY}
              strokeWidth={2.25}
              dot={{ r: 3, fill: CHART_BUY, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: CHART_BUY, strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="close"
              name="Bán ra"
              stroke={CHART_GOLD}
              strokeWidth={2.5}
              dot={{ r: 3, fill: CHART_GOLD, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: CHART_GOLD, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  meta,
  tone = "text-foreground"
}: {
  label: string;
  value: React.ReactNode;
  meta?: string | undefined;
  tone?: string;
}) {
  return (
    <div className="metric-panel rounded-md px-2.5 py-2 sm:px-3 sm:py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500 sm:text-[11px]">
        {label}
      </div>
      <div className="mt-1 text-[13px] font-semibold leading-tight text-foreground sm:text-base">
        {value}
      </div>
      {meta ? (
        <div className={`mt-0.5 text-[11px] font-semibold sm:text-xs ${tone}`}>{meta}</div>
      ) : null}
    </div>
  );
}

function HistoryTooltip({
  active,
  payload,
  point: selected
}: {
  active?: boolean;
  payload?: Array<{ payload?: DailyGoldPrice }>;
  point?: DailyGoldPrice;
}) {
  const point = selected ?? payload?.[0]?.payload;
  if ((!active && !selected) || !point) return null;
  return (
    <div className="min-w-[245px] rounded-md border border-border bg-background p-3 text-xs shadow-panel">
      <div className="mb-2 font-semibold text-foreground">{dateLabel(point.date)}</div>
      <div className="space-y-1 text-foreground">
        <TooltipLine
          label="Mua vào"
          value={
            <PriceWithChange
              price={point.buyClose}
              change={point.buyChangeVnd}
              align="right"
              compact
            />
          }
        />
        <TooltipLine
          label="Bán ra"
          value={
            <PriceWithChange
              price={point.close}
              change={point.sellChangeVnd}
              align="right"
              compact
            />
          }
        />
        <TooltipLine label="Cao nhất" value={formatFullPrice(point.high)} />
        <TooltipLine label="Thấp nhất" value={formatFullPrice(point.low)} />
        {point.premiumPercent !== null ? (
          <TooltipLine
            label="Premium"
            value={`${point.premiumPercent.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`}
          />
        ) : null}
        {point.spreadPercent !== null ? (
          <TooltipLine
            label="Spread"
            value={`${point.spreadPercent.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`}
          />
        ) : null}
      </div>
      {point.isToday ? <p className="mt-2 text-muted">Dữ liệu hôm nay có thể thay đổi.</p> : null}
    </div>
  );
}

function PriceWithChange({
  label,
  price,
  change,
  align = "left",
  compact = false
}: {
  label?: string;
  price: number;
  change: number | null;
  align?: "left" | "right";
  compact?: boolean;
}) {
  const changeLabel = formatNonZeroSignedVnd(change);
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="font-medium text-foreground">
        {label ? <span className="mr-1 text-xs font-medium text-muted">{label}</span> : null}
        {formatFullPrice(price)}
      </div>
      {changeLabel ? (
        <div
          className={`${compact ? "text-[11px]" : "text-xs"} font-semibold ${changeColor(change)}`}
        >
          {changeLabel}
        </div>
      ) : null}
    </div>
  );
}

function TooltipLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
