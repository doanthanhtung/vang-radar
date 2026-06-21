import type { Metadata } from "next";
import { Radar } from "lucide-react";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "VangScore | Dữ liệu và chỉ số giá vàng Việt Nam",
    template: "%s | VangScore"
  },
  description:
    "Theo dõi giá vàng Việt Nam, premium, spread và các chỉ số thị trường được cập nhật liên tục.",
  icons: {
    icon: "/dashboard-gold.png"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <Providers>
          <header className="border-b border-border bg-background/95">
            <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
              <Link href="/" className="flex items-center gap-2 font-semibold text-gold">
                <Radar className="h-5 w-5 text-gold" aria-hidden />
                <span>VangScore</span>
              </Link>
            </nav>
          </header>
          {children}
          <footer className="border-t border-border bg-background">
            <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-muted">
              Thông tin chỉ mang tính tham khảo, không phải khuyến nghị đầu tư.
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
