import type { SignalRuleTrace } from "@vang-radar/domain";
import type { ScoreExplanation } from "../../lib/vang-score";
import { formatPercent } from "../../lib/utils";
import { SignalBadge } from "./signal-badge";

function buildRuleNonMatchSummary(rule: SignalRuleTrace): string | null {
  if (rule.matched) return null;

  const failed = rule.conditions.filter((condition) => !condition.passed);
  if (failed.length === 0) return null;

  if (rule.id === "AVOID") {
    return `Không khớp: chưa có cảnh báo nào kích hoạt (cần ít nhất 1 trong ${failed.length} điều kiện đỏ bên dưới).`;
  }

  return `Không khớp: ${failed.length} điều kiện chưa đạt (đánh dấu đỏ).`;
}

export function ScoreExplanationCard({ explanation }: { explanation: ScoreExplanation }) {
  const title = explanation.ready
    ? `Vì sao ${explanation.productName} có điểm ${explanation.score}?`
    : "Vì sao điểm DOJI như vậy?";

  return (
    <section className="research-card rounded-lg">
      <div className="p-4">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      </div>

      <div className="space-y-4 border-t border-white/[0.07] px-4 pb-4 pt-3 text-sm leading-6">
        <p className="text-foreground">{explanation.summary}</p>

        {explanation.ready && explanation.signal ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-white/[0.08] bg-slate-950/30 px-3 py-3">
            <div>
              <div className="text-xs text-muted">Điểm sản phẩm</div>
              <div className="mt-1 text-lg font-semibold text-gold">{explanation.score}/100</div>
            </div>
            <SignalBadge signal={explanation.signal} />
            {explanation.premiumSellPct !== null && explanation.spreadPct !== null ? (
              <div className="grid grid-cols-2 gap-3 text-xs sm:ml-auto">
                <div>
                  <div className="text-muted">Premium</div>
                  <div className="mt-1 font-medium text-foreground">
                    {formatPercent(explanation.premiumSellPct)}
                  </div>
                </div>
                <div>
                  <div className="text-muted">Spread</div>
                  <div className="mt-1 font-medium text-foreground">
                    {formatPercent(explanation.spreadPct)}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {explanation.reasons.length > 0 ? (
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
              Kết luận engine
            </h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-300">
              {explanation.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </section>
  );
}

export function EngineAlgorithmDetails({ explanation }: { explanation: ScoreExplanation }) {
  if (!explanation.algorithm) {
    return (
      <div className="research-card rounded-lg p-4 text-sm text-muted">
        Chưa có dữ liệu thuật toán để hiển thị.
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Thuật toán tính điểm
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Engine kiểm tra lần lượt từng quy tắc. Quy tắc đầu tiên khớp sẽ quyết định tín hiệu và
          điểm.
        </p>
      </div>
      <ol className="space-y-3">
        {explanation.algorithm.rules.map((rule, index) => {
          const nonMatchSummary = buildRuleNonMatchSummary(rule);

          return (
            <li
              key={rule.id}
              className={`rounded-md border px-3 py-3 ${
                rule.id === explanation.algorithm?.matchedRuleId
                  ? "border-gold/40 bg-gold/5"
                  : "border-white/[0.08] bg-slate-950/28"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted">Bước {index + 1}</span>
                <span className="font-medium text-foreground">{rule.label}</span>
                {rule.id === explanation.algorithm?.matchedRuleId ? (
                  <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-medium text-gold">
                    Khớp {"->"} {rule.score}/100
                  </span>
                ) : (
                  <span className="rounded-full bg-muted/20 px-2 py-0.5 text-xs text-muted">
                    Không khớp
                  </span>
                )}
              </div>
              {rule.scoreFormula ? (
                <p className="mt-2 font-mono text-xs text-gold/90">{rule.scoreFormula}</p>
              ) : null}
              {nonMatchSummary ? (
                <p className="mt-2 rounded-md border border-red-400/30 bg-red-400/10 px-2.5 py-2 text-xs text-red-300">
                  {nonMatchSummary}
                </p>
              ) : null}
              <ul className="mt-2 space-y-1.5">
                {rule.conditions.map((condition) => (
                  <li
                    key={`${rule.id}-${condition.label}`}
                    className="grid gap-1 text-xs sm:grid-cols-[1fr_auto]"
                  >
                    <span className={condition.passed ? "text-muted" : "text-red-400"}>
                      <span className={condition.passed ? "text-muted" : "text-red-400"}>
                        {condition.passed ? "✓" : "✗"}
                      </span>{" "}
                      <span
                        className={condition.passed ? "text-muted" : "font-medium text-red-400"}
                      >
                        {condition.label}
                      </span>
                      :{" "}
                      <span
                        className={
                          condition.passed ? "text-foreground" : "font-medium text-red-400"
                        }
                      >
                        {condition.actual}
                      </span>
                    </span>
                    <span
                      className={
                        condition.passed ? "text-muted sm:text-right" : "text-red-400 sm:text-right"
                      }
                    >
                      Yêu cầu: {condition.requirement}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
