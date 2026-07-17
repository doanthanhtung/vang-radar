"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ErrorPage({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-[65vh] max-w-2xl items-center px-4 py-12 text-center"
    >
      <section className="research-card w-full rounded-lg p-6 sm:p-10">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-warning/30 bg-warning/10 text-warning">
          <AlertTriangle className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-foreground">
          Chưa tải được nội dung
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
          Kết nối có thể đang gián đoạn. Bạn có thể thử tải lại mà không làm mất dữ liệu đã nhập.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-gold px-4 text-sm font-semibold text-slate-950 transition hover:bg-gold/90 active:translate-y-px"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Thử lại
        </button>
      </section>
    </main>
  );
}
