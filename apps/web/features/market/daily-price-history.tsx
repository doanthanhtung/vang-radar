"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { DailyGoldPrice, GoldPriceHistory } from "../../lib/api-client";
import { getPremiumLevel, getSpreadLevel, getSpreadPremiumBadgeClassName } from "../../lib/utils";

const CHART_GRID = "#334155";
const CHART_TEXT = "#94a3b8";
const CHART_GOLD = "#facc15";

function formatPrice(value: number): string {
  return `${(value / 1_000_000).toLocaleString("vi-VN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })}tr`;
}

function formatPercent(value: number | null, signed = false): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${(value * 100).toLocaleString("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
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
  const minimum = Math.min(...data.map((point) => point.low));
  const maximum = Math.max(...data.map((point) => point.high));
  const margin = Math.max(maximum * 0.01, 100_000);
  return [Math.max(0, minimum - margin), maximum + margin];
}

export function DailyPriceHistory({ history }: { history: GoldPriceHistory }) {
  const [selectedMobile, setSelectedMobile] = useState<DailyGoldPrice | null>(null);
  if (history.data.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted">
        Chưa có dữ liệu lịch sử cho loại vàng này.
      </div>
    );
  }

  const latest = history.data[history.data.length - 1]!;
  const first = history.data[0]!;
  const periodChange = first.close === 0 ? null : (latest.close - first.close) / first.close;
  const domain = chartDomain(history.data);
  const title =
    history.data.length >= 7
      ? "Diễn biến 7 ngày gần nhất"
      : `Diễn biến ${history.data.length}/7 ngày gần nhất`;

  return (
    <section className="rounded-lg border border-border bg-background p-3 sm:p-4">
      <div className="mb-4">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted">
          Dùng giá bán ra cuối ngày. Hôm nay tạm tính theo giá mới nhất.
        </p>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <SummaryCard
          label="Giá hôm nay"
          value={formatPrice(latest.close)}
          meta={formatPercent(latest.changePercent, true)}
          tone={changeColor(latest.changePercent)}
        />
        <SummaryCard
          label={`Xu hướng ${history.data.length} ngày`}
          value={formatPercent(periodChange, true)}
          tone={changeColor(periodChange)}
        />
        <SummaryCard
          label="Chi phí mua"
          value={<RateValue prefix="Premium" value={latest.premiumPercent} type="premium" />}
        />
      </div>

      <div className="h-52 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history.data} margin={{ top: 10, right: 8, bottom: 4, left: 6 }}>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="4 6" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDateLabel}
              minTickGap={20}
              tick={{ fill: CHART_TEXT, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: CHART_GRID }}
            />
            <YAxis
              dataKey="close"
              domain={domain}
              tickFormatter={formatPrice}
              tick={{ fill: CHART_TEXT, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              content={<HistoryTooltip />}
              cursor={{ stroke: CHART_TEXT, strokeDasharray: "4 4" }}
            />
            <Line
              type="monotone"
              dataKey="close"
              name="Giá"
              stroke={CHART_GOLD}
              strokeWidth={2.5}
              dot={{ r: 3, fill: CHART_GOLD, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: CHART_GOLD, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 hidden sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-y border-border text-muted">
            <tr>
              <th className="px-2 py-2 font-medium">Ngày</th>
              <th className="px-2 py-2 font-medium">Giá</th>
              <th className="px-2 py-2 font-medium">Thay đổi</th>
              <th className="px-2 py-2 font-medium">Spread</th>
              <th className="px-2 py-2 font-medium">Premium</th>
            </tr>
          </thead>
          <tbody>
            {[...history.data].reverse().map((point) => (
              <HistoryRow key={point.date} point={point} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 space-y-2 sm:hidden">
        {[...history.data].reverse().map((point) => (
          <HistoryCard key={point.date} point={point} onSelect={setSelectedMobile} />
        ))}
      </div>
      {selectedMobile ? (
        <div className="mt-3 sm:hidden">
          <HistoryTooltip point={selectedMobile} />
        </div>
      ) : null}
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
    <div className="rounded-md border border-border bg-panel px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 font-semibold ${tone}`}>{value}</div>
      {meta ? <div className={`mt-0.5 text-xs ${tone}`}>{meta}</div> : null}
    </div>
  );
}

function HistoryRow({ point }: { point: DailyGoldPrice }) {
  return (
    <tr className="border-b border-border/70">
      <td className="px-2 py-2 font-medium text-foreground">
        {dateLabel(point.date)} {point.isToday ? <TodayBadges /> : null}
      </td>
      <td className="px-2 py-2 font-medium text-foreground">{formatPrice(point.close)}</td>
      <td className={`px-2 py-2 font-medium ${changeColor(point.changePercent)}`}>
        {formatPercent(point.changePercent, true)}
      </td>
      <td className="px-2 py-2">
        <RateValue value={point.spreadPercent} type="spread" />
      </td>
      <td className="px-2 py-2">
        <RateValue value={point.premiumPercent} type="premium" />
      </td>
    </tr>
  );
}

function HistoryCard({
  point,
  onSelect
}: {
  point: DailyGoldPrice;
  onSelect: (point: DailyGoldPrice) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(point)}
      onMouseEnter={() => onSelect(point)}
      className="w-full rounded-md border border-border bg-panel p-3 text-left"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="font-medium text-foreground">
          {dateLabel(point.date)} {point.isToday ? <TodayBadges /> : null}
        </div>
        <div className="text-right">
          <div className="font-semibold text-foreground">{formatPrice(point.close)}</div>
          <div className={`mt-0.5 text-xs font-medium ${changeColor(point.changePercent)}`}>
            {formatPercent(point.changePercent, true)}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Metric label="Spread" value={<RateValue value={point.spreadPercent} type="spread" />} />
        <Metric label="Premium" value={<RateValue value={point.premiumPercent} type="premium" />} />
      </div>
    </button>
  );
}

function TodayBadges() {
  return (
    <span className="ml-1 inline-flex items-center gap-1">
      <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[11px] font-medium text-gold">
        Hôm nay
      </span>
      <span className="rounded bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted">
        Tạm tính
      </span>
    </span>
  );
}
function RateValue({
  prefix,
  value,
  type
}: {
  prefix?: string;
  value: number | null;
  type: "spread" | "premium";
}) {
  const levelInfo = type === "spread" ? getSpreadLevel(value) : getPremiumLevel(value);
  if (!levelInfo) return <span>—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {prefix ? `${prefix} ` : ""}
      {formatPercent(value!)}
      <span
        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${getSpreadPremiumBadgeClassName(levelInfo)}`}
      >
        {levelInfo.label}
      </span>
    </span>
  );
}
function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted">{label}</div>
      <div className="mt-0.5 font-medium text-foreground">{value}</div>
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
      <div className="mb-2 font-semibold text-foreground">
        {dateLabel(point.date)} {point.isToday ? "· Tạm tính" : ""}
      </div>
      <div className="space-y-1 text-foreground">
        <TooltipLine label="Giá" value={formatPrice(point.close)} />
        <TooltipLine label="Thay đổi" value={formatPercent(point.changePercent, true)} />
        <TooltipLine
          label="Spread"
          value={<RateValue value={point.spreadPercent} type="spread" />}
        />
        <TooltipLine
          label="Premium"
          value={<RateValue value={point.premiumPercent} type="premium" />}
        />
      </div>
      {point.isToday ? <p className="mt-2 text-muted">Dữ liệu hôm nay có thể thay đổi.</p> : null}
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
