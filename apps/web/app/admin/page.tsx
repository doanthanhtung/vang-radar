"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Database,
  LogOut,
  Mail,
  Play,
  RefreshCw,
  Trash2,
  ServerCog,
  Workflow
} from "lucide-react";
import { useEffect, useState } from "react";
import { AdminLogin } from "../../components/admin-login";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Table, Td, Th } from "../../components/ui/table";
import { deleteAdminJson, getAdminJson, getMarketSummary, postAdminJson } from "../../lib/api-client";
import {
  clearAdminCredentials,
  loadAdminCredentials,
  type AdminCredentials
} from "../../lib/admin-auth";
import { formatNumber, formatVnd } from "../../lib/utils";

type SourceHealth = {
  code: string;
  name: string;
  type: string;
  health: "healthy" | "degraded" | string;
};

type JobsPayload = {
  queues: string[];
  note?: string;
};

type DataQualityPayload = {
  domesticInvalid?: UnknownRecord[];
  worldInvalid?: UnknownRecord[];
  fxInvalid?: UnknownRecord[];
};

type RunIngestionPayload = {
  accepted?: boolean;
  scope?: string;
  requestId?: string;
  message?: string;
};

type NotificationSubscriber = {
  id: string;
  email: string;
  status: string;
  buyAlertEnabled: boolean;
  subscribedAt: string;
  unsubscribedAt: string | null;
  lastNotifiedAt: string | null;
  notificationCount: number;
};

type NotificationSubscribersPayload = {
  items: NotificationSubscriber[];
  total: number;
  skip: number;
  take: number;
};

type UnknownRecord = Record<string, unknown>;

const DEFAULT_SCOPE = "all";

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [credentials, setCredentials] = useState<AdminCredentials | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [scope, setScope] = useState(DEFAULT_SCOPE);
  const [subscriberPage, setSubscriberPage] = useState(0);
  const username = credentials?.username ?? "";
  const password = credentials?.password ?? "";
  const hasCredentials = credentials !== null;
  const subscriberTake = 20;

  useEffect(() => {
    setCredentials(loadAdminCredentials());
    setSessionReady(true);
  }, []);

  const health = useQuery({
    queryKey: ["admin-health", username],
    queryFn: async () =>
      getAdminJson("/admin/sources/health", username, password) as Promise<SourceHealth[]>,
    enabled: hasCredentials
  });
  const jobs = useQuery({
    queryKey: ["admin-jobs", username],
    queryFn: async () => getAdminJson("/admin/jobs", username, password) as Promise<JobsPayload>,
    enabled: hasCredentials
  });
  const dataQuality = useQuery({
    queryKey: ["admin-data-quality", username],
    queryFn: async () =>
      getAdminJson("/admin/data-quality/latest", username, password) as Promise<DataQualityPayload>,
    enabled: hasCredentials
  });
  const subscribers = useQuery({
    queryKey: ["admin-notification-subscribers", username, subscriberPage],
    queryFn: async () =>
      getAdminJson(
        `/admin/notifications/subscribers?take=${subscriberTake}&skip=${subscriberPage * subscriberTake}`,
        username,
        password
      ) as Promise<NotificationSubscribersPayload>,
    enabled: hasCredentials
  });
  const summary = useQuery({ queryKey: ["summary"], queryFn: getMarketSummary });
  const runIngestion = useMutation({
    mutationFn: async () =>
      postAdminJson("/admin/jobs/run-ingestion", username, password, {
        scope
      }) as Promise<RunIngestionPayload>,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-health"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-data-quality"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
    }
  });
  const removeSubscriber = useMutation({
    mutationFn: async (subscriberId: string) =>
      deleteAdminJson(`/admin/notifications/subscribers/${encodeURIComponent(subscriberId)}`, username, password),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-notification-subscribers"] });
    }
  });

  const sources = health.data ?? [];
  const queueNames = jobs.data?.queues ?? [];
  const invalidCounts = getInvalidCounts(dataQuality.data);
  const degradedSources = sources.filter((source) => source.health !== "healthy").length;
  const latestSummaryTime = summary.data?.time
    ? formatVietnamDateTime(summary.data.time)
    : "Chưa có dữ liệu";

  if (!sessionReady) return null;
  if (!credentials) return <AdminLogin onAuthenticated={setCredentials} />;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <section className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium uppercase text-muted">Operations</p>
          <h1 className="mt-2 text-3xl font-semibold">Admin Console</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Theo dõi pipeline dữ liệu, nguồn ingest và chất lượng bản ghi mới nhất.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/admin/engine"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-panel px-4 text-sm font-medium text-foreground ring-1 ring-border transition-colors hover:bg-background"
          >
            <Workflow className="h-4 w-4" aria-hidden />
            Engine rules
          </a>
          <a
            href="/admin/audit"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-panel px-4 text-sm font-medium text-foreground ring-1 ring-border transition-colors hover:bg-background"
          >
            <ClipboardList className="h-4 w-4" aria-hidden />
            Audit log
          </a>
          <Button
            className="bg-panel text-foreground ring-1 ring-border hover:bg-background"
            onClick={() => refetchAll()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Làm mới
          </Button>
          <Button
            onClick={() => runIngestion.mutate()}
            disabled={!hasCredentials || runIngestion.isPending}
          >
            <Play className="h-4 w-4" aria-hidden />
            {runIngestion.isPending ? "Đang chạy" : "Chạy ingestion"}
          </Button>
        </div>
      </section>

      <section className="mb-6 grid gap-3 lg:grid-cols-[1fr_180px]">
        <div className="flex items-end justify-between gap-3 rounded-md border border-border bg-panel px-3 py-2">
          <div>
            <div className="text-xs font-medium text-muted">Đã đăng nhập</div>
            <div className="text-sm font-medium">{username}</div>
          </div>
          <Button
            className="bg-background text-foreground ring-1 ring-border hover:bg-panel"
            onClick={() => {
              clearAdminCredentials();
              setCredentials(null);
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Đăng xuất
          </Button>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Scope</span>
          <select
            className="h-10 w-full rounded-md border border-border bg-panel px-3 text-sm outline-none"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          >
            <option value="all">All</option>
            <option value="domestic">Domestic</option>
            <option value="world">World</option>
            <option value="fx">FX</option>
          </select>
        </label>
      </section>

      {getErrorMessage(health.error ?? jobs.error ?? dataQuality.error) ? (
        <section className="mb-6 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          {getErrorMessage(health.error ?? jobs.error ?? dataQuality.error)}
        </section>
      ) : null}

      <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          title="Nguồn dữ liệu"
          value={`${sources.length}`}
          detail={`${degradedSources} degraded`}
          icon={<ServerCog className="h-5 w-5" />}
          tone={degradedSources > 0 ? "warning" : "healthy"}
        />
        <StatusCard
          title="Pipeline jobs"
          value={`${queueNames.length}`}
          detail={jobs.isFetching ? "Đang đồng bộ" : "Worker queues"}
          icon={<Workflow className="h-5 w-5" />}
          tone="neutral"
        />
        <StatusCard
          title="Invalid records"
          value={`${invalidCounts.total}`}
          detail={`Domestic ${invalidCounts.domestic} / World ${invalidCounts.world} / FX ${invalidCounts.fx}`}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={invalidCounts.total > 0 ? "warning" : "healthy"}
        />
        <StatusCard
          title="Market summary"
          value={summary.data ? formatVnd(summary.data.world.worldVndPerLuong) : "N/A"}
          detail={latestSummaryTime}
          icon={<Activity className="h-5 w-5" />}
          tone="neutral"
        />
      </section>

      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Email nhận cảnh báo</CardTitle>
            <p className="mt-1 text-sm text-muted">
              Tổng {subscribers.data?.total ?? 0} email đã đăng ký nhận tín hiệu mua vàng.
            </p>
          </div>
          <QueryBadge
            loading={subscribers.isLoading || subscribers.isFetching}
            error={Boolean(subscribers.error)}
          />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Email</Th>
                  <Th>Trạng thái</Th>
                  <Th>Ngày đăng ký</Th>
                  <Th>Lần gửi gần nhất</Th>
                  <Th>Số lần gửi</Th>
                  <Th>Thao tác</Th>
                </tr>
              </thead>
              <tbody>
                {(subscribers.data?.items ?? []).length === 0 ? (
                  <tr>
                    <Td colSpan={6} className="py-8 text-center text-muted">
                      {subscribers.isLoading ? "Đang tải danh sách email" : "Chưa có email đăng ký"}
                    </Td>
                  </tr>
                ) : (
                  subscribers.data?.items.map((subscriber) => (
                    <tr key={subscriber.id} className="hover:bg-background/70">
                      <Td>
                        <div className="flex items-center gap-2 font-medium text-foreground">
                          <Mail className="h-4 w-4 text-muted" aria-hidden />
                          <span>{subscriber.email}</span>
                        </div>
                      </Td>
                      <Td>
                        <Badge
                          className={
                            subscriber.status === "active" && subscriber.buyAlertEnabled
                              ? "border-positive/25 bg-positive/10 text-positive"
                              : "border-warning/30 bg-warning/10 text-warning"
                          }
                        >
                          {subscriber.status === "active" && subscriber.buyAlertEnabled
                            ? "Active"
                            : subscriber.status}
                        </Badge>
                      </Td>
                      <Td>{formatVietnamDateTime(subscriber.subscribedAt)}</Td>
                      <Td>
                        {subscriber.lastNotifiedAt
                          ? formatVietnamDateTime(subscriber.lastNotifiedAt)
                          : "Chưa gửi"}
                      </Td>
                      <Td>{subscriber.notificationCount}</Td>
                      <Td>
                        <Button
                          className="bg-background text-warning ring-1 ring-warning/30 hover:bg-warning/10"
                          disabled={
                            removeSubscriber.isPending ||
                            subscriber.status !== "active" ||
                            !subscriber.buyAlertEnabled
                          }
                          onClick={() => removeSubscriber.mutate(subscriber.id)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          Gỡ
                        </Button>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>
          {removeSubscriber.error ? (
            <p className="mt-3 text-sm text-warning">{getErrorMessage(removeSubscriber.error)}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
            <span>
              Trang {subscriberPage + 1} / {Math.max(1, Math.ceil((subscribers.data?.total ?? 0) / subscriberTake))}
            </span>
            <div className="flex items-center gap-2">
              <Button
                className="bg-panel text-foreground ring-1 ring-border hover:bg-background"
                disabled={subscriberPage === 0 || subscribers.isFetching}
                onClick={() => setSubscriberPage((page) => Math.max(0, page - 1))}
              >
                Trước
              </Button>
              <Button
                className="bg-panel text-foreground ring-1 ring-border hover:bg-background"
                disabled={
                  subscribers.isFetching ||
                  (subscriberPage + 1) * subscriberTake >= (subscribers.data?.total ?? 0)
                }
                onClick={() => setSubscriberPage((page) => page + 1)}
              >
                Sau
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Source Health</CardTitle>
            <QueryBadge
              loading={health.isLoading || health.isFetching}
              error={Boolean(health.error)}
            />
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Source</Th>
                    <Th>Type</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {sources.length === 0 ? (
                    <tr>
                      <Td colSpan={3} className="py-8 text-center text-muted">
                        {health.isLoading ? "Đang tải nguồn dữ liệu" : "Chưa có nguồn dữ liệu"}
                      </Td>
                    </tr>
                  ) : (
                    sources.map((source) => (
                      <tr key={source.code} className="hover:bg-background/70">
                        <Td>
                          <div className="font-medium text-foreground">{source.name}</div>
                          <div className="text-xs text-muted">{source.code}</div>
                        </Td>
                        <Td>{source.type}</Td>
                        <Td>
                          <HealthBadge health={source.health} />
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Ingestion Pipeline</CardTitle>
            <QueryBadge loading={jobs.isLoading || jobs.isFetching} error={Boolean(jobs.error)} />
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {queueNames.map((queue, index) => (
                <li
                  key={queue}
                  className="flex items-center gap-3 rounded-md border border-border p-3"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-sm font-medium">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-sm font-medium">{queue}</span>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-positive" aria-hidden />
                </li>
              ))}
              {queueNames.length === 0 ? (
                <li className="rounded-md border border-border p-4 text-sm text-muted">
                  {jobs.isLoading ? "Đang tải queue" : "Chưa có queue"}
                </li>
              ) : null}
            </ol>
            {runIngestion.data ? (
              <div className="mt-4 rounded-md border border-positive/25 bg-positive/10 p-3 text-sm text-positive">
                Request {runIngestion.data.requestId ?? "accepted"} đã được nhận.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Data Quality</CardTitle>
            <QueryBadge
              loading={dataQuality.isLoading || dataQuality.isFetching}
              error={Boolean(dataQuality.error)}
            />
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <QualityRow label="Domestic invalid" count={invalidCounts.domestic} />
              <QualityRow label="World invalid" count={invalidCounts.world} />
              <QualityRow label="FX invalid" count={invalidCounts.fx} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Market Snapshot</CardTitle>
            <QueryBadge
              loading={summary.isLoading || summary.isFetching}
              error={Boolean(summary.error)}
            />
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <SnapshotMetric
                label="XAU/USD"
                value={
                  summary.data ? `${formatNumber(summary.data.world.xauUsdPerOz)} USD/oz` : "N/A"
                }
              />
              <SnapshotMetric
                label="USD/VND"
                value={summary.data ? formatNumber(summary.data.world.usdVnd) : "N/A"}
              />
              <SnapshotMetric
                label="Sản phẩm"
                value={summary.data ? `${summary.data.products.length}` : "N/A"}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <details className="mt-4 rounded-lg border border-border bg-panel">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Raw responses</summary>
        <div className="grid gap-4 border-t border-border p-4 lg:grid-cols-2">
          <JsonPanel title="Source health" value={health.data} />
          <JsonPanel title="Jobs" value={jobs.data} />
          <JsonPanel title="Data quality" value={dataQuality.data} />
          <JsonPanel title="Run ingestion" value={runIngestion.data ?? runIngestion.error} />
        </div>
      </details>
    </main>
  );

  function refetchAll() {
    void health.refetch();
    void jobs.refetch();
    void dataQuality.refetch();
    void subscribers.refetch();
    void summary.refetch();
  }
}

function StatusCard({
  title,
  value,
  detail,
  icon,
  tone
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: "healthy" | "warning" | "neutral";
}) {
  const toneClass =
    tone === "healthy"
      ? "bg-positive/10 text-positive"
      : tone === "warning"
        ? "bg-warning/10 text-warning"
        : "bg-background text-muted";

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-muted">{title}</div>
          <div className="mt-2 break-words text-xl font-semibold">{value}</div>
          <div className="mt-1 break-words text-xs text-muted">{detail}</div>
        </div>
        <div className={`rounded-md p-2 ${toneClass}`}>{icon}</div>
      </CardContent>
    </Card>
  );
}

function QueryBadge({ loading, error }: { loading: boolean; error: boolean }) {
  if (error) return <Badge className="border-warning/30 bg-warning/10 text-warning">Error</Badge>;
  if (loading) return <Badge className="border-border bg-background text-muted">Loading</Badge>;
  return <Badge className="border-positive/25 bg-positive/10 text-positive">Synced</Badge>;
}

function HealthBadge({ health }: { health: string }) {
  const healthy = health === "healthy";
  return (
    <Badge
      className={
        healthy
          ? "border-positive/25 bg-positive/10 text-positive"
          : "border-warning/30 bg-warning/10 text-warning"
      }
    >
      {healthy ? "Healthy" : "Degraded"}
    </Badge>
  );
}

function QualityRow({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="flex min-w-0 items-center gap-3">
        <Database className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <span className="break-words text-sm font-medium">{label}</span>
      </div>
      <Badge
        className={
          count > 0
            ? "border-warning/30 bg-warning/10 text-warning"
            : "border-positive/25 bg-positive/10 text-positive"
        }
      >
        {count}
      </Badge>
    </div>
  );
}

function SnapshotMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{value}</div>
    </div>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 text-sm font-medium">{title}</div>
      <pre className="max-h-80 overflow-auto rounded-md bg-background p-3 text-xs leading-5 text-muted">
        {value === undefined ? "No data" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function getInvalidCounts(data?: DataQualityPayload) {
  const domestic = data?.domesticInvalid?.length ?? 0;
  const world = data?.worldInvalid?.length ?? 0;
  const fx = data?.fxInvalid?.length ?? 0;
  return { domestic, world, fx, total: domestic + world + fx };
}

function getErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  return String(error);
}

function formatVietnamDateTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date(value));
}
