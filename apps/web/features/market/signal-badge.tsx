import type { DecisionSignal } from "@vang-radar/domain";
import { Badge } from "../../components/ui/badge";
import { signalUi } from "../../lib/signal-ui";

export function SignalBadge({ signal }: { signal: DecisionSignal }) {
  const ui = signalUi[signal];
  return <Badge className={ui.className}>{ui.label}</Badge>;
}
