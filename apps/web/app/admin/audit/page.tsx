"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, Globe, LogOut, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminLogin } from "../../../components/admin-login";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Table, Td, Th } from "../../../components/ui/table";
import { getAdminJson } from "../../../lib/api-client";
import {
  clearAdminCredentials,
  loadAdminCredentials,
  type AdminCredentials
} from "../../../lib/admin-auth";

type AuditLog = {
  id: string;
  occurredAt: string;
  actor: string;
  action: string;
  outcome: string;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
};

type AuditResponse = {
  items: AuditLog[];
  total: number;
  skip: number;
  take: number;
};

type VisitorAudience = "human" | "bot" | "all";

type TodayIpAccess = {
  ipAddress: string;
  visitCount: number;
  firstAccessAt: string;
  lastAccessAt: string;
  lastPath: string | null;
  country?: string | null;
  userAgent?: string | null;
  audience?: VisitorAudience | "human" | "bot";
};

type TodayAccessResponse = {
  date: string;
  audience: VisitorAudience;
  country?: string | null;
  items: TodayIpAccess[];
  totalVisits: number;
};

const PAGE_SIZE = 50;
const AUDIENCE_OPTIONS: Array<{ value: VisitorAudience; label: string }> = [
  { value: "human", label: "Người dùng" },
  { value: "bot", label: "Bot / scanner" },
  { value: "all", label: "Tất cả" }
];

export default function AdminAuditPage() {
  const [credentials, setCredentials] = useState<AdminCredentials | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [action, setAction] = useState("");
  const [appliedAction, setAppliedAction] = useState("");
  const [audience, setAudience] = useState<VisitorAudience>("human");
  const [country, setCountry] = useState("all");
  const [skip, setSkip] = useState(0);
  const username = credentials?.username ?? "";
  const password = credentials?.password ?? "";
  const hasCredentials = credentials !== null;

  useEffect(() => {
    setCredentials(loadAdminCredentials());
    setSessionReady(true);
  }, []);
  const query = useQuery({
    queryKey: ["admin-audit", username, appliedAction, skip],
    queryFn: async () => {
      const params = new URLSearchParams({ skip: String(skip), take: String(PAGE_SIZE) });
      if (appliedAction) params.set("action", appliedAction);
      return getAdminJson(
        `/admin/audit?${params.toString()}`,
        username,
        password
      ) as Promise<AuditResponse>;
    },
    enabled: hasCredentials
  });
  const todayAccessQuery = useQuery({
    queryKey: ["admin-access-today", username, audience, country],
    queryFn: async () => {
      const params = new URLSearchParams({ audience });
      if (country !== "all") params.set("country", country);
      return getAdminJson(
        `/admin/access/today?${params.toString()}`,
        username,
        password
      ) as Promise<TodayAccessResponse>;
    },
    enabled: hasCredentials
  });
  const countryOptionsQuery = useQuery({
    queryKey: ["admin-access-country-options", username, audience],
    queryFn: async () => {
      const params = new URLSearchParams({ audience });
      return getAdminJson(
        `/admin/access/today?${params.toString()}`,
        username,
        password
      ) as Promise<TodayAccessResponse>;
    },
    enabled: hasCredentials
  });

  const logs = query.data?.items ?? [];
  const todayAccess = todayAccessQuery.data?.items ?? [];
  const countryOptions = buildCountryOptions(countryOptionsQuery.data?.items ?? todayAccess);
  const todayUniqueIps = todayAccess.length;
  const todayTotalVisits = todayAccessQuery.data?.totalVisits ?? 0;
  const total = query.data?.total ?? 0;
  const start = total === 0 ? 0 : skip + 1;
  const end = Math.min(skip + PAGE_SIZE, total);

  function applyFilter() {
    setSkip(0);
    setAppliedAction(action.trim());
  }

  if (!sessionReady) return null;
  if (!credentials) return <AdminLogin onAuthenticated={setCredentials} />;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <section className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Admin Console
          </Link>
          <p className="mt-5 text-sm font-medium uppercase text-muted">Security</p>
          <h1 className="mt-2 text-3xl font-semibold">Admin Audit Log</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Theo dõi IP người dùng thật trong ngày, bot/scanner (debug), và nhật ký append-only cho
            các thao tác quản trị.
          </p>
        </div>
        <Button
          className="bg-panel text-foreground ring-1 ring-border hover:bg-background"
          onClick={() => {
            void query.refetch();
            void todayAccessQuery.refetch();
          }}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Làm mới
        </Button>
      </section>

      <section className="mb-6 grid gap-3 lg:grid-cols-[1fr_1.2fr_auto]">
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
          <span className="mb-1 block text-xs font-medium text-muted">Action</span>
          <input
            className="h-10 w-full rounded-md border border-border bg-panel px-3 text-sm outline-none"
            value={action}
            onChange={(event) => setAction(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && applyFilter()}
            placeholder="Ví dụ: ingestion.requested"
          />
        </label>
        <Button className="self-end" onClick={applyFilter} disabled={!hasCredentials}>
          <Search className="h-4 w-4" aria-hidden />
          Lọc
        </Button>
      </section>

      {query.error || todayAccessQuery.error ? (
        <section className="mb-6 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          {getErrorMessage(query.error ?? todayAccessQuery.error)}
        </section>
      ) : null}

      <Card className="mb-6">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" aria-hidden />
            IP truy cập hôm nay
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-muted">
              <span>Loại</span>
              <select
                className="h-9 rounded-md border border-border bg-panel px-3 text-sm text-foreground outline-none"
                value={audience}
                onChange={(event) => setAudience(event.target.value as VisitorAudience)}
              >
                {AUDIENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-muted">
              <span>Quốc gia</span>
              <select
                className="h-9 rounded-md border border-border bg-panel px-3 text-sm text-foreground outline-none"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
              >
                <option value="all">Tất cả</option>
                {countryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <Badge className="border-border bg-background text-muted">{todayUniqueIps} IP</Badge>
            <Badge className="border-border bg-background text-muted">
              {todayTotalVisits} lượt
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>IP</Th>
                  {audience === "all" ? <Th>Loại</Th> : null}
                  <Th>Số lượt</Th>
                  <Th>Quốc gia</Th>
                  <Th>Lần đầu</Th>
                  <Th>Lần cuối</Th>
                  <Th>Đường dẫn gần nhất</Th>
                </tr>
              </thead>
              <tbody>
                {todayAccess.length === 0 ? (
                  <tr>
                    <Td
                      colSpan={audience === "all" ? 7 : 6}
                      className="py-10 text-center text-muted"
                    >
                      {todayAccessQuery.isLoading
                        ? "Đang tải IP truy cập"
                        : audience === "human"
                          ? "Chưa có người dùng thật trong ngày"
                          : audience === "bot"
                            ? "Chưa có bot/scanner trong ngày"
                            : "Chưa có IP truy cập trong ngày"}
                    </Td>
                  </tr>
                ) : (
                  todayAccess.map((entry) => (
                    <tr
                      key={`${entry.audience ?? audience}-${entry.ipAddress}`}
                      className="align-top hover:bg-background/70"
                    >
                      <Td className="font-mono text-xs">{entry.ipAddress}</Td>
                      {audience === "all" ? (
                        <Td>
                          <Badge
                            className={
                              entry.audience === "bot"
                                ? "border-warning/25 bg-warning/10 text-warning"
                                : "border-positive/25 bg-positive/10 text-positive"
                            }
                          >
                            {entry.audience === "bot" ? "Bot" : "Human"}
                          </Badge>
                        </Td>
                      ) : null}
                      <Td>{entry.visitCount}</Td>
                      <Td>{entry.country ?? "—"}</Td>
                      <Td className="whitespace-nowrap">
                        {formatVietnamDateTime(entry.firstAccessAt)}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {formatVietnamDateTime(entry.lastAccessAt)}
                      </Td>
                      <Td className="max-w-60 break-all text-xs text-muted">
                        {entry.lastPath ?? "—"}
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
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" aria-hidden />
            Events
          </CardTitle>
          <Badge className="border-border bg-background text-muted">{total} events</Badge>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Thời điểm</Th>
                  <Th>Admin</Th>
                  <Th>Action</Th>
                  <Th>Request</Th>
                  <Th>IP</Th>
                  <Th>Metadata</Th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <Td colSpan={6} className="py-10 text-center text-muted">
                      {query.isLoading ? "Đang tải audit log" : "Chưa có audit event"}
                    </Td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="align-top hover:bg-background/70">
                      <Td className="whitespace-nowrap">{formatVietnamDateTime(log.occurredAt)}</Td>
                      <Td>{log.actor}</Td>
                      <Td>
                        <Badge className="border-positive/25 bg-positive/10 text-positive">
                          {log.action}
                        </Badge>
                      </Td>
                      <Td className="max-w-40 break-all text-xs text-muted">
                        {log.requestId ?? "—"}
                      </Td>
                      <Td className="max-w-40 break-all font-mono text-xs text-muted">
                        {log.ipAddress ?? "Không có"}
                      </Td>
                      <Td className="max-w-80">
                        {log.metadata && Object.keys(log.metadata).length > 0 ? (
                          <pre className="overflow-auto rounded bg-background p-2 text-xs text-muted">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted">
            <span>{total === 0 ? "Không có kết quả" : `${start}–${end} / ${total}`}</span>
            <div className="flex gap-2">
              <Button
                className="bg-panel text-foreground ring-1 ring-border hover:bg-background"
                disabled={skip === 0 || query.isFetching}
                onClick={() => setSkip((value) => Math.max(0, value - PAGE_SIZE))}
              >
                Trước
              </Button>
              <Button
                className="bg-panel text-foreground ring-1 ring-border hover:bg-background"
                disabled={skip + PAGE_SIZE >= total || query.isFetching}
                onClick={() => setSkip((value) => value + PAGE_SIZE)}
              >
                Sau
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Không thể tải audit log";
}

function buildCountryOptions(items: TodayIpAccess[]): string[] {
  return [...new Set(items.map((item) => item.country?.trim()).filter(Boolean) as string[])].sort(
    (left, right) => left.localeCompare(right)
  );
}

function formatVietnamDateTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date(value));
}
