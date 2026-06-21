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

type TodayIpAccess = {
  ipAddress: string;
  visitCount: number;
  firstAccessAt: string;
  lastAccessAt: string;
  lastPath: string | null;
};

type TodayAccessResponse = {
  date: string;
  items: TodayIpAccess[];
  totalVisits: number;
};

const PAGE_SIZE = 50;

export default function AdminAuditPage() {
  const [credentials, setCredentials] = useState<AdminCredentials | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [action, setAction] = useState("");
  const [appliedAction, setAppliedAction] = useState("");
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
      return getAdminJson(`/admin/audit?${params.toString()}`, username, password) as Promise<AuditResponse>;
    },
    enabled: hasCredentials
  });
  const todayAccessQuery = useQuery({
    queryKey: ["admin-access-today", username],
    queryFn: async () =>
      getAdminJson("/admin/access/today", username, password) as Promise<TodayAccessResponse>,
    enabled: hasCredentials
  });

  const logs = query.data?.items ?? [];
  const todayAccess = todayAccessQuery.data?.items ?? [];
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
            Theo dõi IP truy cập trong ngày và nhật ký append-only cho các thao tác quản trị.
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
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" aria-hidden />
            IP truy cập hôm nay
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-border bg-background text-muted">
              {todayUniqueIps} IP
            </Badge>
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
                  <Th>Số lượt</Th>
                  <Th>Lần đầu</Th>
                  <Th>Lần cuối</Th>
                  <Th>Đường dẫn gần nhất</Th>
                </tr>
              </thead>
              <tbody>
                {todayAccess.length === 0 ? (
                  <tr>
                    <Td colSpan={5} className="py-10 text-center text-muted">
                      {todayAccessQuery.isLoading
                        ? "Đang tải IP truy cập"
                        : "Chưa có IP truy cập trong ngày"}
                    </Td>
                  </tr>
                ) : (
                  todayAccess.map((entry) => (
                    <tr key={entry.ipAddress} className="align-top hover:bg-background/70">
                      <Td className="font-mono text-xs">{entry.ipAddress}</Td>
                      <Td>{entry.visitCount}</Td>
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
                      <Td className="max-w-40 break-all text-xs text-muted">{log.requestId ?? "—"}</Td>
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
