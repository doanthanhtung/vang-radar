import { BarChart3, BellRing } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { rootMetadata } from "../lib/seo";

export const metadata = rootMetadata;

const alertsRoute = "/alerts" as Route;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="research-shell">
        <Providers>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-gold focus:px-3 focus:py-2 focus:text-slate-950"
          >
            Đi tới nội dung chính
          </a>
          <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-background/78 backdrop-blur-xl">
            <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
              <Link
                href="/"
                className="flex min-h-11 items-center gap-2.5 font-semibold text-foreground"
              >
                <span className="grid h-8 w-8 place-items-center rounded-md border border-gold/25 bg-gold/10 text-gold">
                  <BarChart3 className="h-4.5 w-4.5" aria-hidden />
                </span>
                <span>VangScore</span>
              </Link>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Link
                  href={alertsRoute}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-gold/25 px-3 text-sm font-semibold text-gold transition-colors hover:border-gold/50 hover:bg-gold/10 active:translate-y-px"
                >
                  <BellRing className="h-4 w-4 sm:hidden" aria-hidden />
                  <span className="hidden sm:inline">Nhận cảnh báo</span>
                  <span className="sm:hidden">Cảnh báo</span>
                </Link>
              </div>
            </nav>
          </header>
          {children}
          <footer className="border-t border-white/[0.07] bg-background/70">
            <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-muted">
              <p>Thông tin chỉ mang tính tham khảo, không phải khuyến nghị đầu tư.</p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
