import { ArrowLeft, SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-[65vh] max-w-2xl items-center px-4 py-12 text-center"
    >
      <section className="research-card w-full rounded-lg p-6 sm:p-10">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-gold/25 bg-gold/10 text-gold">
          <SearchX className="h-6 w-6" aria-hidden />
        </span>
        <p className="mt-5 text-sm font-semibold uppercase tracking-[0.16em] text-gold">Lỗi 404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Không tìm thấy trang
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
          Đường dẫn có thể đã thay đổi hoặc sản phẩm này chưa có dữ liệu trên VangScore.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-gold px-4 text-sm font-semibold text-slate-950 transition hover:bg-gold/90 active:translate-y-px"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Về bảng giá
        </Link>
      </section>
    </main>
  );
}
