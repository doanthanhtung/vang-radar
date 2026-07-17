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
    title: "Gọn và riêng tư",
    description: "Chỉ dùng email của bạn để gửi cảnh báo, không gửi nội dung quảng cáo."
  }
];

export default function AlertsPage() {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-[calc(100dvh-8rem)]">
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16 lg:py-20">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-md border border-gold/25 bg-gold/10 px-3 py-2 text-sm font-semibold text-gold">
            <BellRing className="h-4 w-4" aria-hidden />
            Cảnh báo mua vàng qua email
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-slate-50 sm:text-5xl lg:text-6xl">
            Nhận thông báo khi dữ liệu nghiêng về vùng mua hợp lý.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            VangScore theo dõi premium, spread, giá vàng thế giới và các chỉ báo thị trường để gửi
            email khi xác suất mua tốt hơn mặt bằng gần đây.
          </p>

          <div className="mt-8 max-w-2xl divide-y divide-white/[0.08] border-y border-white/[0.08]">
            {signalItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="grid grid-cols-[2.75rem_1fr] gap-3 py-4 sm:grid-cols-[3rem_1fr]"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-md border border-gold/20 bg-gold/[0.08] text-gold">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">
                      <span className="mr-2 text-xs font-medium text-gold/70">0{index + 1}</span>
                      {item.title}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-muted">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="w-full lg:justify-self-end">
          <AlertSubscribeForm />
          <p className="mt-4 px-1 text-xs leading-5 text-muted">
            Tần suất phụ thuộc vào tín hiệu thị trường; có thể không có email nếu dữ liệu chưa đủ
            rõ.
          </p>
        </aside>
      </section>
    </main>
  );
}
