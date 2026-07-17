"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMetricHistory, type MetricPoint } from "../../lib/api-client";

type HistoryRange = "7d" | "30d" | "180d" | "1y";

const RANGE_OPTIONS: Array<{
  label: string;
  value: HistoryRange;
  summaryLabel: string;
  expectedDays: number;
}> = [
  { label: "7N", value: "7d", summaryLabel: "7 ngày", expectedDays: 7 },
  { label: "30N", value: "30d", summaryLabel: "30 ngày", expectedDays: 30 },
  { label: "180N", value: "180d", summaryLabel: "180 ngày", expectedDays: 180 },
  { label: "1Y", value: "1y", summaryLabel: "1 năm", expectedDays: 365 }
];

const MetricCharts = dynamic(() => import("./metric-charts"), {
  ssr: false,
  loading: () => <ChartSkeleton />
});

export function MetricChartsPanel({
  productCode,
  initialData
}: {
  productCode: string;
  initialData?: MetricPoint[];
}) {
  const [range, setRange] = useState<HistoryRange>("180d");
  const selectedRange = RANGE_OPTIONS.find((option) => option.value === range) ?? RANGE_OPTIONS[2]!;

  useEffect(() => {
    void import("./metric-charts");
  }, []);
  const history = useQuery({
    queryKey: ["metric-history", productCode, range],
    queryFn: () => getMetricHistory(productCode, range),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    ...(range === "180d" && initialData?.length
      ? { initialData, initialDataUpdatedAt: Date.now() }
      : {})
  });

  return (
    <section className="space-y-3 sm:space-y-4">
      <div className="sticky top-2 z-10 -mx-1 flex items-center justify-center px-1 sm:static sm:justify-end sm:px-0">
        <div className="grid w-full grid-cols-4 rounded-md border border-border bg-panel/95 p-1 shadow-panel backdrop-blur sm:inline-flex sm:w-auto">
          {RANGE_OPTIONS.map((option) => {
            const selected = option.value === range;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                className={`min-h-11 rounded px-2 text-sm font-medium transition sm:min-w-12 sm:px-3 ${
                  selected
                    ? "bg-gold text-slate-950 shadow-sm"
                    : "text-muted hover:bg-background hover:text-foreground"
                }`}
                aria-pressed={selected}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {history.isLoading ? (
        <div aria-live="polite" aria-busy="true">
          <ChartSkeleton />
        </div>
      ) : history.isError ? (
        <ChartMessage message="Không tải được dữ liệu biểu đồ." />
      ) : !history.data?.length ? (
        <ChartMessage message="Chưa có đủ dữ liệu lịch sử để vẽ biểu đồ." />
      ) : (
        <MetricCharts
          data={history.data}
          summaryLabel={selectedRange.summaryLabel}
          expectedDays={selectedRange.expectedDays}
        />
      )}
    </section>
  );
}

function ChartSkeleton() {
  return (
    <div className="space-y-3 sm:space-y-4">
      {["Giá bán ra", "Premium so với vàng thế giới", "Spread mua bán"].map((title) => (
        <section key={title} className="rounded-lg border border-border bg-panel shadow-panel">
          <div className="border-b border-border px-4 py-3 sm:px-5 sm:py-4">
            <h2 className="text-base font-semibold">{title}</h2>
            <div className="mt-3 h-7 w-44 animate-pulse rounded-md bg-background" />
          </div>
          <div className="h-64 p-3 sm:h-[340px] sm:p-4">
            <div className="h-full animate-pulse rounded-md bg-background" />
          </div>
        </section>
      ))}
    </div>
  );
}

function ChartMessage({ message }: { message: string }) {
  return (
    <section className="rounded-lg border border-border bg-panel p-5 text-sm text-muted">
      {message}
    </section>
  );
}
