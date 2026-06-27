import type { DecisionSignal } from "@vang-radar/domain";
import { Badge } from "../../components/ui/badge";
import { signalUi } from "../../lib/signal-ui";

const compactLabels: Partial<Record<DecisionSignal, string>> = {
  AVOID: "Tránh mua",
  DATA_UNRELIABLE: "Chưa tin cậy"
};

export function SignalBadge({
  signal,
  compact = false
}: {
  signal: DecisionSignal;
  compact?: boolean;
}) {
  const ui = signalUi[signal];
  return (
    <Badge className={ui.className}>
      {compact ? (compactLabels[signal] ?? ui.label) : ui.label}
    </Badge>
  );
}
