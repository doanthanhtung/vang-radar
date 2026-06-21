"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMetricHistory } from "../../lib/api-client";

type HistoryRange = "7d" | "30d" | "180d" | "1y";

const RANGE_OPTIONS: Array<{ label: string; value: HistoryRange }> = [
  { label: "7N", value: "7d" },
  { label: "30N", value: "30d" },
  { label: "180N", value: "180d" },
  { label: "1Y", value: "1y" }
];

const MetricCharts = dynamic(() => import("./metric-charts"), {
  ssr: false,
  loading: () => <ChartSkeleton />
});

export function MetricChartsPanel({ productCode }: { productCode: string }) {
  const [range, setRange] = useState<HistoryRange>("30d");

  useEffect(() => {
    void import("./metric-charts");
  }, []);
  const history = useQuery({
    queryKey: ["metric-history", productCode, range],
    queryFn: () => getMetricHistory(productCode, range),
    staleTime: 60_000
  });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-end">
        <div className="inline-flex rounded-md border border-border bg-panel p-1 shadow-panel">
          {RANGE_OPTIONS.map((option) => {
            const selected = option.value === range;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                className={`min-h-9 min-w-12 rounded px-3 text-sm font-medium transition ${
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
        <ChartSkeleton />
      ) : history.isError ? (
        <ChartMessage message="Không tải được dữ liệu biểu đồ." />
      ) : !history.data?.length ? (
        <ChartMessage message="Chưa có đủ dữ liệu lịch sử để vẽ biểu đồ." />
      ) : (
        <MetricCharts data={history.data} />
      )}
    </section>
  );
}

function ChartSkeleton() {
  return (
    <div className="space-y-4">
      {["Giá bán ra", "Premium và spread"].map((title) => (
        <section key={title} className="rounded-lg border border-border bg-panel shadow-panel">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">{title}</h2>
            <div className="mt-3 h-7 w-44 animate-pulse rounded-md bg-background" />
          </div>
          <div className="h-[340px] p-4">
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
