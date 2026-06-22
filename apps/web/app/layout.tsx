import { Radar } from "lucide-react";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";
import { rootMetadata } from "../lib/seo";

export const metadata = rootMetadata;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <Providers>
          <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-gold focus:px-3 focus:py-2 focus:text-slate-950">
            Đi tới nội dung chính
          </a>
          <header className="border-b border-border bg-background/95">
            <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
              <Link href="/" className="flex items-center gap-2 font-semibold text-gold">
                <Radar className="h-5 w-5 text-gold" aria-hidden />
                <span>VangScore</span>
              </Link>
            </nav>
          </header>
          {children}
          <footer className="border-t border-border/70 bg-background/80">
            <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-7 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
              <p>Thông tin chỉ mang tính tham khảo, không phải khuyến nghị đầu tư.</p>
              <a href="#main-content" className="w-fit text-slate-300 transition-colors hover:text-gold">
                Về đầu trang
              </a>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
