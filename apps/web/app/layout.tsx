import { BarChart3 } from "lucide-react";
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
              <Link href="/" className="flex items-center gap-2.5 font-semibold text-foreground">
                <span className="grid h-8 w-8 place-items-center rounded-md border border-gold/25 bg-gold/10 text-gold">
                  <BarChart3 className="h-4.5 w-4.5" aria-hidden />
                </span>
                <span>VangScore</span>
              </Link>
              <span className="hidden text-xs font-medium text-muted sm:block">
                Bảng nghiên cứu premium, spread và tín hiệu mua
              </span>
              <Link
                href={alertsRoute}
                className="rounded-md border border-gold/25 px-3 py-2 text-sm font-semibold text-gold transition-colors hover:border-gold/50 hover:bg-gold/10"
              >
                Nhận cảnh báo
              </Link>
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
