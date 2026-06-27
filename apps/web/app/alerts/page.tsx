import { BellRing, Check, Clock3, TrendingDown } from "lucide-react";
import { AlertSubscribeForm } from "../../features/alerts/alert-subscribe-form";
import { createPageMetadata } from "../../lib/seo";

export const metadata = createPageMetadata({
  title: "Đăng ký nhận thông báo mua vàng",
  description:
    "Nhận email khi VangScore phát hiện thời điểm mua vàng hợp lý dựa trên premium, spread và tín hiệu thị trường.",
  path: "/alerts"
});

const signalItems = [
  {
    icon: TrendingDown,
    title: "Premium hạ nhiệt",
    description: "Theo dõi chênh lệch giá vàng trong nước với giá thế giới."
  },
  {
    icon: Clock3,
    title: "Tín hiệu đúng thời điểm",
    description: "Ưu tiên gửi khi dữ liệu đủ rõ thay vì spam theo lịch cố định."
  },
  {
    icon: Check,
    title: "Một email, một hồ sơ",
    description: "Mỗi địa chỉ được lưu riêng, có trạng thái để mở rộng cho hàng ngàn người dùng."
  }
];

export default function AlertsPage() {
  return (
    <main id="main-content" className="min-h-[calc(100dvh-8rem)]">
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-20">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-md border border-gold/25 bg-gold/10 px-3 py-2 text-sm font-semibold text-gold">
            <BellRing className="h-4 w-4" aria-hidden />
            Cảnh báo mua vàng qua email
          </div>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight text-slate-50 sm:text-5xl lg:text-6xl">
            Nhận thông báo khi dữ liệu nghiêng về vùng mua hợp lý.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            VangScore theo dõi premium, spread, giá vàng thế giới và các chỉ báo thị trường để
            gửi email khi xác suất mua tốt hơn mặt bằng gần đây.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {signalItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="metric-panel rounded-lg p-4">
                  <Icon className="h-5 w-5 text-gold" aria-hidden />
                  <h2 className="mt-3 text-sm font-semibold text-slate-100">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="lg:justify-self-end">
          <AlertSubscribeForm />
          <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/35 p-4 text-sm leading-6 text-muted">
            <p>
              Danh sách email được lưu trong database riêng cho notification, tách khỏi dữ liệu
              giá vàng và chỉ số thị trường.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
