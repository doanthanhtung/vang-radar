import type { DecisionSignal } from "@vang-radar/domain";

export const signalUi: Record<DecisionSignal, { label: string; className: string }> = {
  BUY_DCA: {
    label: "Nên mua dần",
    className: "border-positive/25 bg-positive/10 text-positive"
  },
  HOLD: {
    label: "Chờ thêm",
    className: "border-gold/25 bg-gold/10 text-gold"
  },
  AVOID: {
    label: "Không nên mua / Cân nhắc bán",
    className: "border-warning/30 bg-warning/10 text-warning"
  },
  TAKE_PROFIT: {
    label: "Chốt lời một phần",
    className: "border-positive/30 bg-positive/10 text-positive"
  },
  DATA_UNRELIABLE: {
    label: "Dữ liệu chưa tin cậy",
    className: "border-unreliable/30 bg-unreliable/10 text-unreliable"
  }
};
