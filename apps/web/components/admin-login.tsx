"use client";

import { useState } from "react";
import { KeyRound, ShieldAlert } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { getAdminJson } from "../lib/api-client";
import { saveAdminCredentials, type AdminCredentials } from "../lib/admin-auth";

export function AdminLogin({
  onAuthenticated
}: {
  onAuthenticated: (credentials: AdminCredentials) => void;
}) {
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
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-8"
    >
      <Card className="research-card w-full overflow-hidden">
        <CardHeader>
          <h1 className="text-lg font-semibold tracking-tight">Đăng nhập quản trị</h1>
          <p className="text-sm leading-6 text-muted">
            Xác thực để truy cập bảng điều khiển vận hành VangScore.
          </p>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={submit}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                Tên đăng nhập
              </span>
              <span className="flex h-12 items-center gap-2 rounded-md border border-border bg-background/45 px-3 transition focus-within:border-gold/70 focus-within:ring-1 focus-within:ring-gold/25">
                <KeyRound className="h-4 w-4 text-muted" aria-hidden />
                <input
                  autoComplete="username"
                  aria-describedby={error ? "admin-login-error" : undefined}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">Mật khẩu</span>
              <span className="flex h-12 items-center gap-2 rounded-md border border-border bg-background/45 px-3 transition focus-within:border-gold/70 focus-within:ring-1 focus-within:ring-gold/25">
                <ShieldAlert className="h-4 w-4 text-muted" aria-hidden />
                <input
                  autoComplete="current-password"
                  aria-describedby={error ? "admin-login-error" : undefined}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </span>
            </label>
            {error ? (
              <p id="admin-login-error" role="alert" className="text-sm text-rose-300">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Đang xác thực…" : "Đăng nhập"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
