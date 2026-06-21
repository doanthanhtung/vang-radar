"use client";

import { useState } from "react";
import { KeyRound, ShieldAlert } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { getAdminJson } from "../lib/api-client";
import { saveAdminCredentials, type AdminCredentials } from "../lib/admin-auth";

export function AdminLogin({ onAuthenticated }: { onAuthenticated: (credentials: AdminCredentials) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await getAdminJson("/admin/jobs", username, password);
      const credentials = { username, password };
      saveAdminCredentials(credentials);
      onAuthenticated(credentials);
    } catch {
      setError("Tên đăng nhập hoặc mật khẩu không đúng.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-8">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Đăng nhập quản trị</CardTitle>
          <p className="text-sm leading-6 text-muted">Xác thực để truy cập VangScore Admin Console.</p>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={submit}>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Username</span>
              <span className="flex h-10 items-center gap-2 rounded-md border border-border bg-panel px-3">
                <KeyRound className="h-4 w-4 text-muted" aria-hidden />
                <input
                  autoComplete="username"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Password</span>
              <span className="flex h-10 items-center gap-2 rounded-md border border-border bg-panel px-3">
                <ShieldAlert className="h-4 w-4 text-muted" aria-hidden />
                <input
                  autoComplete="current-password"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </span>
            </label>
            {error ? <p className="text-sm text-warning">{error}</p> : null}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Đang xác thực" : "Đăng nhập"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
