"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, LogOut, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminLogin } from "../../../components/admin-login";
import { AdminShellLoading } from "../../../components/admin-shell-loading";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import {
  EngineAlgorithmDetails,
  ScoreExplanationCard
} from "../../../features/market/score-explanation";
import { getMarketSummary } from "../../../lib/api-client";
import {
  clearAdminCredentials,
  loadAdminCredentials,
  type AdminCredentials
} from "../../../lib/admin-auth";
import {
  buildScoreExplanation,
  enrichSummaryProducts,
  toScoreExplanationInput
} from "../../../lib/vang-score";

export default function AdminEnginePage() {
  const [credentials, setCredentials] = useState<AdminCredentials | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    setCredentials(loadAdminCredentials());
    setSessionReady(true);
  }, []);

  const summary = useQuery({
    queryKey: ["summary"],
    queryFn: getMarketSummary,
    enabled: credentials !== null
  });

  const explanation = useMemo(() => {
    const data = summary.data;
    if (
      !data ||
      data.products.length === 0 ||
      data.world.xauUsdPerOz <= 0 ||
      data.world.usdVnd <= 0
    ) {
      return buildScoreExplanation(null);
    }

    const products = enrichSummaryProducts(data);
    const dojiProduct = products.find((product) => product.code === "DOJI_RING_9999");
    return buildScoreExplanation(
      dojiProduct ? toScoreExplanationInput(dojiProduct, data.world) : null
    );
  }, [summary.data]);

  if (!sessionReady) return <AdminShellLoading />;
  if (!credentials) return <AdminLogin onAuthenticated={setCredentials} />;

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-8">
      <section className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium uppercase text-muted">Signal Engine</p>
          <h1 className="mt-2 text-3xl font-semibold">Engine rules</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Kiểm tra chi tiết thuật toán, quy tắc khớp và từng điều kiện đang dùng để tính điểm DOJI
            trên market summary hiện tại.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-panel px-4 text-sm font-medium text-foreground ring-1 ring-border transition-colors hover:bg-background active:translate-y-px"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Admin Console
          </Link>
          <Button
            className="bg-panel text-foreground ring-1 ring-border hover:bg-background"
            onClick={() => void summary.refetch()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Làm mới
          </Button>
          <Button
            className="bg-panel text-foreground ring-1 ring-border hover:bg-background"
            onClick={() => {
              clearAdminCredentials();
              setCredentials(null);
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Đăng xuất
          </Button>
        </div>
      </section>

      {summary.error ? (
        <section className="mb-6 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          {summary.error instanceof Error ? summary.error.message : "Không thể tải market summary."}
        </section>
      ) : null}

      <section className="grid gap-4">
        <ScoreExplanationCard explanation={explanation} />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Chi tiết từng bước engine</CardTitle>
            <span className="text-xs text-muted">
              {summary.isFetching ? "Đang đồng bộ" : "Market summary hiện tại"}
            </span>
          </CardHeader>
          <CardContent>
            <EngineAlgorithmDetails explanation={explanation} />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
