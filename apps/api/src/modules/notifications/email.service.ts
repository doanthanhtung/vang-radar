import { Injectable, Logger } from "@nestjs/common";
import { loadConfig } from "@vang-radar/config";

type MailerTransport = {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
};

type NodemailerModule = {
  default?: {
    createTransport(options: unknown): MailerTransport;
  };
  createTransport?(options: unknown): MailerTransport;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendSubscriptionConfirmation(email: string): Promise<boolean> {
    const config = loadConfig();
    if (!config.EMAIL_SENDER || !config.EMAIL_PASSWORD) {
      this.logger.warn("Email SMTP credentials are not configured");
      return false;
    }

    try {
      const nodemailer = (await import("nodemailer")) as NodemailerModule;
      const createTransport = nodemailer.default?.createTransport ?? nodemailer.createTransport;
      if (!createTransport) {
        this.logger.error("Nodemailer createTransport is unavailable");
        return false;
      }

      const transporter = createTransport({
        host: config.SMTP_SERVER,
        port: config.SMTP_PORT,
        secure: config.SMTP_PORT === 465,
        auth: {
          user: config.EMAIL_SENDER,
          pass: config.EMAIL_PASSWORD
        }
      });

      await transporter.sendMail({
        from: `"VangScore" <${config.EMAIL_SENDER}>`,
        to: email,
        subject: "Bạn đã đăng ký nhận cảnh báo mua vàng từ VangScore",
        text: buildConfirmationText(),
        html: buildConfirmationHtml()
      });

      return true;
    } catch (error) {
      this.logger.error(
        `Unable to send subscription confirmation to ${email}`,
        error instanceof Error ? error.stack : undefined
      );
      return false;
    }
  }
}

function buildConfirmationText(): string {
  return [
    "Xin chào,",
    "",
    "Bạn đã đăng ký nhận cảnh báo mua vàng từ VangScore.",
    "Khi hệ thống phát hiện vùng mua hợp lý dựa trên premium, spread, giá vàng thế giới và tín hiệu thị trường, chúng tôi sẽ gửi thông báo tới email này.",
    "",
    "Thông tin chỉ mang tính tham khảo, không phải khuyến nghị đầu tư.",
    "",
    "VangScore"
  ].join("\n");
}

function buildConfirmationHtml(): string {
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Đăng ký nhận cảnh báo VangScore</title>
  </head>
  <body style="margin:0;background:#0b1220;color:#e5e7eb;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b1220;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid rgba(250,204,21,0.22);border-radius:14px;background:#111827;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 18px;">
                <div style="display:inline-block;padding:7px 10px;border-radius:8px;background:rgba(250,204,21,0.12);color:#facc15;font-size:13px;font-weight:700;">
                  VangScore Alerts
                </div>
                <h1 style="margin:18px 0 10px;color:#ffffff;font-size:24px;line-height:1.25;">
                  Đăng ký nhận cảnh báo thành công
                </h1>
                <p style="margin:0;color:#cbd5e1;font-size:15px;line-height:1.7;">
                  Bạn đã được thêm vào danh sách nhận email khi VangScore phát hiện thời điểm mua vàng hợp lý hơn mặt bằng gần đây.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:14px 0;border-top:1px solid rgba(148,163,184,0.18);color:#e2e8f0;font-size:14px;">
                      Theo dõi premium và spread vàng trong nước
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:14px 0;border-top:1px solid rgba(148,163,184,0.18);color:#e2e8f0;font-size:14px;">
                      Kết hợp giá vàng thế giới, USD/VND và tín hiệu thị trường
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:14px 0;border-top:1px solid rgba(148,163,184,0.18);color:#e2e8f0;font-size:14px;">
                      Chỉ gửi khi dữ liệu đủ rõ, hạn chế email không cần thiết
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">
                  Thông tin chỉ mang tính tham khảo, không phải khuyến nghị đầu tư.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
