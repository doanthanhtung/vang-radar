"use client";

import { CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { subscribeToGoldAlerts } from "../../lib/api-client";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AlertSubscribeForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!emailPattern.test(normalizedEmail)) {
      setStatus("error");
      setMessage("Vui lòng nhập một địa chỉ email hợp lệ.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const subscription = await subscribeToGoldAlerts(normalizedEmail);
      setEmail(subscription.email);
      setStatus("success");
      setMessage(
        subscription.alreadySubscribed
          ? "Email này đã có trong danh sách nhận thông báo."
          : subscription.confirmationEmailSent
            ? "Bạn đã đăng ký thành công. Chúng tôi đã gửi email xác nhận tới hộp thư của bạn."
            : "Bạn đã đăng ký thành công. Email xác nhận sẽ được gửi khi hệ thống email sẵn sàng."
      );
    } catch {
      setStatus("error");
      setMessage("Chưa thể lưu email. Vui lòng thử lại sau ít phút.");
    }
  }

  const isLoading = status === "loading";

  return (
    <form
      onSubmit={handleSubmit}
      className="research-card w-full max-w-xl rounded-lg p-5 sm:p-6"
      noValidate
    >
      <label htmlFor="alert-email" className="text-sm font-semibold text-slate-100">
        Email nhận thông báo
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <Mail
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden
          />
          <input
            id="alert-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (status !== "loading") {
                setStatus("idle");
                setMessage("");
              }
            }}
            placeholder="email@domain.com"
            disabled={isLoading}
            className="h-12 w-full rounded-md border border-white/10 bg-slate-950/65 pl-10 pr-3 text-base text-slate-50 placeholder:text-slate-500 transition-colors focus:border-gold/80 disabled:cursor-not-allowed disabled:opacity-70"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-gold px-5 text-sm font-bold text-slate-950 transition-transform hover:bg-yellow-300 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {isLoading ? "Đang đăng ký…" : "Đăng ký"}
        </button>
      </div>

      <div className="mt-4 min-h-6" aria-live="polite">
        {message ? (
          <p
            role={status === "error" ? "alert" : "status"}
            className={
              status === "success"
                ? "flex items-start gap-2 text-sm text-emerald-300"
                : "text-sm text-rose-300"
            }
          >
            {status === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : null}
            <span>{message}</span>
          </p>
        ) : (
          <p className="flex items-start gap-2 text-sm text-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
            <span>Chúng tôi chỉ dùng email này để gửi cảnh báo mua vàng.</span>
          </p>
        )}
      </div>
    </form>
  );
}
