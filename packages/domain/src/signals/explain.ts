import type { DecisionSignal, SignalInput, SignalOutput } from "../types/index.js";

const IDEAL_PERCENTILE_SAMPLE_SIZE = 30;

/** Ngưỡng hiệu chỉnh cho thị trường vàng Việt Nam (nhẫn 9999 / SJC). */
const VN_THRESHOLDS = {
  /** Premium bán cực đoan — hiếm khi vượt 14–15% với nhẫn 9999. */
  premiumAvoidAbsolute: 0.16,
  /** Spread > 4% là bất lợi rõ cho người mua tích sản. */
  spreadAvoidAbsolute: 0.04,
  /** Premium cao hơn ~88% lịch sử → tránh mua mới. */
  premiumPercentileAvoid: 88,
  /** Premium thấp hơn ~40% lịch sử → vùng mua dần hợp lý. */
  premiumPercentileBuy: 40,
  /** Spread ≤ 3% là bình thường cho nhẫn/SJC; dùng ngưỡng tuyệt đối thay vì percentile. */
  spreadBuyAbsolute: 0.03,
  /** Cho phép vàng thế giới giảm nhẹ (−3%) khi premium trong nước đang hấp dẫn. */
  xauMomentumBuyFloor: -0.03,
  /** Premium cao + giá trong nước tăng nhanh → cân nhắc chốt lời. */
  premiumPercentileTakeProfit: 82,
  domesticMomentumTakeProfit: 0.025,
  /** Spread nới rộng khi thị trường sôi động. */
  spreadTakeProfitAbsolute: 0.028,
  spreadPercentileTakeProfit: 75
} as const;

type BuyThresholds = {
  premiumPercentileBuy: number;
  premiumBuyAbsolute: number;
  xauMomentumBuyFloor: number;
  bottomCatchPremiumPercentile: number;
  bottomCatchPremiumAbsolute: number;
  bottomCatchSpreadAbsolute: number;
  bottomCatchXauMomentumFloor: number;
};

const DEFAULT_BUY_THRESHOLDS: BuyThresholds = {
  premiumPercentileBuy: 40,
  premiumBuyAbsolute: Number.POSITIVE_INFINITY,
  xauMomentumBuyFloor: -0.03,
  bottomCatchPremiumPercentile: Number.NEGATIVE_INFINITY,
  bottomCatchPremiumAbsolute: Number.NEGATIVE_INFINITY,
  bottomCatchSpreadAbsolute: Number.NEGATIVE_INFINITY,
  bottomCatchXauMomentumFloor: Number.POSITIVE_INFINITY
};

const SJC_BUY_THRESHOLDS: BuyThresholds = {
  premiumPercentileBuy: 10,
  premiumBuyAbsolute: 0.05,
  xauMomentumBuyFloor: -0.08,
  bottomCatchPremiumPercentile: 2,
  bottomCatchPremiumAbsolute: 0.07,
  bottomCatchSpreadAbsolute: 0.04,
  bottomCatchXauMomentumFloor: -0.13
};

interface PercentileHistory {
  percentile: number | null;
  sampleSize: number;
  usable: boolean;
}

interface ResolvedMomentum {
  value: number | null;
  days: number | null;
}

export interface SignalConditionCheck {
  label: string;
  actual: string;
  requirement: string;
  passed: boolean;
}

export interface SignalRuleTrace {
  id: string;
  label: string;
  signal: DecisionSignal;
  matched: boolean;
  score: number | null;
  scoreFormula: string | null;
  conditions: SignalConditionCheck[];
}

export interface SignalAlgorithmExplanation {
  output: SignalOutput;
  matchedRuleId: string;
  rules: SignalRuleTrace[];
}

function hasMissingNumber(input: SignalInput): boolean {
  const required = [
    input.domesticBuyPriceVnd,
    input.domesticSellPriceVnd,
    input.xauUsdPerOz,
    input.usdVnd,
    input.worldVndPerLuong,
    input.premiumBuyPct,
    input.premiumSellPct,
    input.spreadAbsVnd,
    input.spreadPct,
    input.dataQualityScore
  ];

  return required.some((value) => !Number.isFinite(value));
}

function formatPercent(value: number): string {
  return `${(value * 100).toLocaleString("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}

function formatPercentile(value: number): string {
  return `${value.toLocaleString("vi-VN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })}%`;
}

function formatSampleSize(value: number): string {
  return value.toLocaleString("vi-VN");
}

function resolvePercentileHistory(
  percentile: number | null,
  sampleSize: number
): PercentileHistory {
  return {
    percentile,
    sampleSize,
    usable: percentile !== null && sampleSize > 0
  };
}

function formatSampleRequirement(sampleSize: number): string {
  if (sampleSize >= IDEAL_PERCENTILE_SAMPLE_SIZE) {
    return `≥ ${IDEAL_PERCENTILE_SAMPLE_SIZE} mẫu`;
  }
  if (sampleSize > 0) {
    return `Tính theo ${formatSampleSize(sampleSize)} mẫu hiện có`;
  }
  return "Cần ≥ 1 mẫu";
}

function formatPercentileActual(history: PercentileHistory): string {
  if (!history.usable || history.percentile === null) return "Chưa có lịch sử";
  const percentile = formatPercentile(history.percentile);
  if (history.sampleSize >= IDEAL_PERCENTILE_SAMPLE_SIZE) return percentile;
  return `${percentile} (${formatSampleSize(history.sampleSize)} mẫu)`;
}

function resolveXauMomentum(input: SignalInput): ResolvedMomentum {
  if (input.xauMomentum30d !== null) {
    return {
      value: input.xauMomentum30d,
      days: input.xauMomentum30dDays ?? 30
    };
  }
  if (input.xauMomentum7d !== null) {
    return {
      value: input.xauMomentum7d,
      days: input.xauMomentum7dDays ?? 7
    };
  }
  return { value: null, days: null };
}

function formatXauMomentumLabel(days: number | null, suffix = ""): string {
  const base = days ? `Momentum XAU ${days} ngày` : "Momentum XAU";
  return suffix ? `${base} ${suffix}` : base;
}

function formatDomesticMomentumLabel(days: number | null, suffix = ""): string {
  const base = days ? `Momentum giá trong nước ${days} ngày` : "Momentum giá trong nước";
  return suffix ? `${base} ${suffix}` : base;
}

function formatMomentumRequirement(days: number | null): string {
  if (days === null) return "Có dữ liệu";
  if (days < 30) return `Dùng ${days} ngày hiện có`;
  return "Có dữ liệu";
}

function buildConfidence(input: SignalInput): number {
  return Math.max(0.2, Math.min(0.95, input.dataQualityScore / 100));
}

function evaluateDataQuality(input: SignalInput): SignalRuleTrace | null {
  if (!input.isDataValid || input.dataQualityScore <= 0 || hasMissingNumber(input)) {
    return {
      id: "DATA_UNRELIABLE",
      label: "Dữ liệu chưa đủ tin cậy",
      signal: "DATA_UNRELIABLE",
      matched: true,
      score: 0,
      scoreFormula: "Điểm = 0 (dữ liệu không hợp lệ)",
      conditions: [
        {
          label: "Dữ liệu hợp lệ",
          actual: input.isDataValid ? "Có" : "Không",
          requirement: "Phải hợp lệ",
          passed: input.isDataValid
        },
        {
          label: "Chất lượng dữ liệu",
          actual: formatPercent(input.dataQualityScore / 100),
          requirement: "> 0%",
          passed: input.dataQualityScore > 0
        }
      ]
    };
  }

  return null;
}

function evaluateAvoidRule(
  input: SignalInput,
  premiumPercentile: number,
  premiumHistory: PercentileHistory
): SignalRuleTrace {
  const premiumTooHigh = input.premiumSellPct > VN_THRESHOLDS.premiumAvoidAbsolute;
  const spreadTooHigh = input.spreadPct > VN_THRESHOLDS.spreadAvoidAbsolute;
  const premiumPercentileTooHigh =
    premiumHistory.usable && premiumPercentile > VN_THRESHOLDS.premiumPercentileAvoid;
  const matched = premiumTooHigh || spreadTooHigh || premiumPercentileTooHigh;

  return {
    id: "AVOID",
    label: "Không nên mua (AVOID)",
    signal: "AVOID",
    matched,
    score: matched ? 35 : null,
    scoreFormula: matched ? "Điểm = 35 (cố định khi AVOID)" : null,
    conditions: [
      {
        label: "Premium bán ra (kích hoạt AVOID)",
        actual: formatPercent(input.premiumSellPct),
        requirement: `> ${formatPercent(VN_THRESHOLDS.premiumAvoidAbsolute)}`,
        passed: premiumTooHigh
      },
      {
        label: "Spread (kích hoạt AVOID)",
        actual: formatPercent(input.spreadPct),
        requirement: `> ${formatPercent(VN_THRESHOLDS.spreadAvoidAbsolute)}`,
        passed: spreadTooHigh
      },
      {
        label: "Premium percentile (kích hoạt AVOID)",
        actual: formatPercentileActual(premiumHistory),
        requirement: premiumHistory.usable
          ? `> ${formatPercentile(VN_THRESHOLDS.premiumPercentileAvoid)}`
          : formatSampleRequirement(premiumHistory.sampleSize),
        passed: premiumPercentileTooHigh
      }
    ]
  };
}

function isSpreadAcceptableForBuy(input: SignalInput): boolean {
  return input.spreadPct <= VN_THRESHOLDS.spreadBuyAbsolute;
}

function resolveBuyThresholds(productCode: SignalInput["productCode"]): BuyThresholds {
  return productCode === "SJC_BAR" ? SJC_BUY_THRESHOLDS : DEFAULT_BUY_THRESHOLDS;
}

function isPremiumAbsoluteAcceptableForBuy(
  input: SignalInput,
  buyThresholds: BuyThresholds
): boolean {
  if (!Number.isFinite(buyThresholds.premiumBuyAbsolute)) return true;
  return input.premiumSellPct <= buyThresholds.premiumBuyAbsolute;
}

function isXauMomentumAcceptableForBuy(
  xauMomentum: ResolvedMomentum,
  buyThresholds: BuyThresholds
): boolean {
  return xauMomentum.value !== null && xauMomentum.value >= buyThresholds.xauMomentumBuyFloor;
}

function isBottomCatchAcceptableForBuy(
  input: SignalInput,
  premiumPercentile: number,
  premiumHistory: PercentileHistory,
  xauMomentum: ResolvedMomentum,
  buyThresholds: BuyThresholds
): boolean {
  return (
    premiumHistory.usable &&
    xauMomentum.value !== null &&
    premiumPercentile <= buyThresholds.bottomCatchPremiumPercentile &&
    input.premiumSellPct <= buyThresholds.bottomCatchPremiumAbsolute &&
    input.spreadPct <= buyThresholds.bottomCatchSpreadAbsolute &&
    xauMomentum.value >= buyThresholds.bottomCatchXauMomentumFloor
  );
}

function isBottomCatchEnabled(buyThresholds: BuyThresholds): boolean {
  return (
    Number.isFinite(buyThresholds.bottomCatchPremiumPercentile) &&
    Number.isFinite(buyThresholds.bottomCatchPremiumAbsolute) &&
    Number.isFinite(buyThresholds.bottomCatchSpreadAbsolute) &&
    Number.isFinite(buyThresholds.bottomCatchXauMomentumFloor)
  );
}

function evaluateBuyDcaRule(
  input: SignalInput,
  premiumPercentile: number,
  spreadPercentile: number,
  premiumHistory: PercentileHistory,
  spreadHistory: PercentileHistory,
  xauMomentum: ResolvedMomentum
): SignalRuleTrace {
  const buyThresholds = resolveBuyThresholds(input.productCode);
  const hasXauMomentum = xauMomentum.value !== null;
  const spreadAcceptable = isSpreadAcceptableForBuy(input);
  const premiumAbsoluteAcceptable = isPremiumAbsoluteAcceptableForBuy(input, buyThresholds);
  const xauMomentumAcceptable = isXauMomentumAcceptableForBuy(xauMomentum, buyThresholds);
  const bottomCatchEnabled = isBottomCatchEnabled(buyThresholds);
  const bottomCatchAcceptable = isBottomCatchAcceptableForBuy(
    input,
    premiumPercentile,
    premiumHistory,
    xauMomentum,
    buyThresholds
  );
  const conditions: SignalConditionCheck[] = [
    {
      label: "Lịch sử premium",
      actual: formatSampleSize(premiumHistory.sampleSize),
      requirement: formatSampleRequirement(premiumHistory.sampleSize),
      passed: premiumHistory.usable
    },
    {
      label: formatXauMomentumLabel(xauMomentum.days),
      actual: hasXauMomentum ? formatPercent(xauMomentum.value!) : "Không có",
      requirement: formatMomentumRequirement(xauMomentum.days),
      passed: hasXauMomentum
    },
    {
      label: "Premium percentile (lịch sử hiện có)",
      actual: formatPercentileActual(premiumHistory),
      requirement: bottomCatchEnabled
        ? `≤ ${formatPercentile(buyThresholds.premiumPercentileBuy)} hoặc bắt đáy ≤ ${formatPercentile(
            buyThresholds.bottomCatchPremiumPercentile
          )}`
        : `≤ ${formatPercentile(buyThresholds.premiumPercentileBuy)}`,
      passed:
        bottomCatchAcceptable ||
        (premiumHistory.usable && premiumPercentile <= buyThresholds.premiumPercentileBuy)
    },
    {
      label: "Premium bán tuyệt đối",
      actual: formatPercent(input.premiumSellPct),
      requirement: Number.isFinite(buyThresholds.premiumBuyAbsolute)
        ? bottomCatchEnabled
          ? `≤ ${formatPercent(buyThresholds.premiumBuyAbsolute)} hoặc bắt đáy ≤ ${formatPercent(
              buyThresholds.bottomCatchPremiumAbsolute
            )}`
          : `≤ ${formatPercent(buyThresholds.premiumBuyAbsolute)}`
        : "Không áp dụng",
      passed: bottomCatchAcceptable || premiumAbsoluteAcceptable
    },
    {
      label: "Spread (mua–bán)",
      actual: formatPercent(input.spreadPct),
      requirement: bottomCatchEnabled
        ? `≤ ${formatPercent(VN_THRESHOLDS.spreadBuyAbsolute)} hoặc bắt đáy ≤ ${formatPercent(
            buyThresholds.bottomCatchSpreadAbsolute
          )}`
        : `≤ ${formatPercent(VN_THRESHOLDS.spreadBuyAbsolute)}`,
      passed: bottomCatchAcceptable || spreadAcceptable
    },
    {
      label: formatXauMomentumLabel(xauMomentum.days, "không giảm mạnh"),
      actual: hasXauMomentum ? formatPercent(xauMomentum.value!) : "Không có",
      requirement: bottomCatchEnabled
        ? `≥ ${formatPercent(buyThresholds.xauMomentumBuyFloor)} hoặc bắt đáy ≥ ${formatPercent(
            buyThresholds.bottomCatchXauMomentumFloor
          )}`
        : `≥ ${formatPercent(buyThresholds.xauMomentumBuyFloor)}`,
      passed: bottomCatchAcceptable || xauMomentumAcceptable
    }
  ];

  const matched = conditions.every((condition) => condition.passed);
  const score = matched
    ? Math.round(65 + Math.min(15, (buyThresholds.premiumPercentileBuy - premiumPercentile) / 2))
    : null;

  return {
    id: "BUY_DCA",
    label: "Nên mua dần (BUY_DCA)",
    signal: "BUY_DCA",
    matched,
    score,
    scoreFormula: matched
      ? `Điểm = round(65 + min(15, (${buyThresholds.premiumPercentileBuy} − ${formatPercentile(premiumPercentile)}) / 2)) = ${score}`
      : null,
    conditions
  };
}

function isSpreadHotForTakeProfit(
  input: SignalInput,
  spreadPercentile: number,
  spreadHistory: PercentileHistory
): boolean {
  return (
    input.spreadPct >= VN_THRESHOLDS.spreadTakeProfitAbsolute ||
    (spreadHistory.usable && spreadPercentile > VN_THRESHOLDS.spreadPercentileTakeProfit)
  );
}

function evaluateTakeProfitRule(
  input: SignalInput,
  premiumPercentile: number,
  spreadPercentile: number,
  premiumHistory: PercentileHistory,
  spreadHistory: PercentileHistory,
  domesticMomentum7d: ResolvedMomentum
): SignalRuleTrace {
  const hasDomesticMomentum = domesticMomentum7d.value !== null;
  const spreadHot = isSpreadHotForTakeProfit(input, spreadPercentile, spreadHistory);
  const conditions: SignalConditionCheck[] = [
    {
      label: "Lịch sử premium",
      actual: formatSampleSize(premiumHistory.sampleSize),
      requirement: formatSampleRequirement(premiumHistory.sampleSize),
      passed: premiumHistory.usable
    },
    {
      label: formatDomesticMomentumLabel(domesticMomentum7d.days),
      actual: hasDomesticMomentum ? formatPercent(domesticMomentum7d.value!) : "Không có",
      requirement: formatMomentumRequirement(domesticMomentum7d.days),
      passed: hasDomesticMomentum
    },
    {
      label: "Premium percentile (lịch sử hiện có)",
      actual: formatPercentileActual(premiumHistory),
      requirement: `> ${formatPercentile(VN_THRESHOLDS.premiumPercentileTakeProfit)}`,
      passed: premiumHistory.usable && premiumPercentile > VN_THRESHOLDS.premiumPercentileTakeProfit
    },
    {
      label: formatDomesticMomentumLabel(
        domesticMomentum7d.days,
        `> ${formatPercent(VN_THRESHOLDS.domesticMomentumTakeProfit)}`
      ),
      actual: hasDomesticMomentum ? formatPercent(domesticMomentum7d.value!) : "Không có",
      requirement: `> ${formatPercent(VN_THRESHOLDS.domesticMomentumTakeProfit)}`,
      passed:
        hasDomesticMomentum && domesticMomentum7d.value! > VN_THRESHOLDS.domesticMomentumTakeProfit
    },
    {
      label: "Spread (mua–bán)",
      actual: formatPercent(input.spreadPct),
      requirement: `≥ ${formatPercent(VN_THRESHOLDS.spreadTakeProfitAbsolute)} hoặc percentile cao`,
      passed: spreadHot
    }
  ];

  const matched = conditions.every((condition) => condition.passed);
  const score = matched
    ? Math.round(
        20 + Math.min(15, (premiumPercentile - VN_THRESHOLDS.premiumPercentileTakeProfit) / 2)
      )
    : null;

  return {
    id: "TAKE_PROFIT",
    label: "Chốt lời một phần (TAKE_PROFIT)",
    signal: "TAKE_PROFIT",
    matched,
    score,
    scoreFormula: matched
      ? `Điểm = round(20 + min(15, (${formatPercentile(premiumPercentile)} − ${VN_THRESHOLDS.premiumPercentileTakeProfit}) / 2)) = ${score}`
      : null,
    conditions
  };
}

function buildHoldScore(
  input: SignalInput,
  premiumPercentile: number,
  premiumHistory: PercentileHistory,
  xauMomentum: ResolvedMomentum,
  domesticMomentum7d: ResolvedMomentum
): number {
  let score = 50;
  const buyThresholds = resolveBuyThresholds(input.productCode);

  if (premiumHistory.usable) {
    score += Math.min(12, (50 - premiumPercentile) * 0.24);
  }

  if (input.spreadPct <= 0.025) score += 3;
  else if (input.spreadPct > VN_THRESHOLDS.spreadBuyAbsolute) score -= 5;

  if (xauMomentum.value !== null) {
    if (xauMomentum.value >= 0.01) score += 3;
    else if (xauMomentum.value < buyThresholds.xauMomentumBuyFloor) score -= 5;
  }

  if (
    domesticMomentum7d.value !== null &&
    domesticMomentum7d.value > VN_THRESHOLDS.domesticMomentumTakeProfit
  ) {
    score -= 4;
  }

  return Math.max(38, Math.min(62, Math.round(score)));
}

function buildHoldReasons(
  input: SignalInput,
  premiumPercentile: number,
  premiumHistory: PercentileHistory,
  xauMomentum: ResolvedMomentum,
  score: number
): string[] {
  const buyThresholds = resolveBuyThresholds(input.productCode);

  if (
    premiumHistory.usable &&
    premiumPercentile <= buyThresholds.premiumPercentileBuy &&
    isPremiumAbsoluteAcceptableForBuy(input, buyThresholds) &&
    isSpreadAcceptableForBuy(input) &&
    xauMomentum.value !== null &&
    xauMomentum.value < buyThresholds.xauMomentumBuyFloor
  ) {
    return [
      `Premium đang hấp dẫn so với lịch sử, nhưng vàng thế giới giảm mạnh hơn ${formatPercent(
        buyThresholds.xauMomentumBuyFloor
      )}.`,
      "Phù hợp chia nhỏ lệnh mua nếu mua dài hạn; chưa nên mua gấp."
    ];
  }

  if (premiumHistory.usable && premiumPercentile < 30) {
    return [
      "Premium thấp hơn nhiều giai đoạn trước — thị trường trong nước tương đối hấp dẫn.",
      score >= 58
        ? "Có thể cân nhắc mua dần nếu nhu cầu tích sản dài hạn."
        : "Nên theo dõi thêm vài phiên trước khi quyết định."
    ];
  }

  if (premiumHistory.usable && premiumPercentile > 70) {
    return [
      "Premium đang cao hơn phần lớn lịch sử gần đây.",
      "Người mua mới nên chờ premium thu hẹp; người đang giữ có thể theo dõi."
    ];
  }

  return [
    "Tín hiệu hiện tại chưa đủ hấp dẫn để mua mới mạnh.",
    "Người đang nắm giữ có thể tiếp tục theo dõi."
  ];
}

function evaluateHoldRule(
  input: SignalInput,
  premiumPercentile: number,
  premiumHistory: PercentileHistory,
  xauMomentum: ResolvedMomentum,
  domesticMomentum7d: ResolvedMomentum
): SignalRuleTrace {
  const score = buildHoldScore(
    input,
    premiumPercentile,
    premiumHistory,
    xauMomentum,
    domesticMomentum7d
  );

  return {
    id: "HOLD",
    label: "Chờ thêm (HOLD — mặc định)",
    signal: "HOLD",
    matched: true,
    score,
    scoreFormula: `Điểm = ${score} (tính từ premium lịch sử, spread và momentum hiện có)`,
    conditions: [
      {
        label: "Không khớp AVOID, BUY_DCA hay TAKE_PROFIT",
        actual: "Không khớp",
        requirement: "Rơi vào nhánh mặc định",
        passed: true
      }
    ]
  };
}

export function explainDecisionSignal(input: SignalInput): SignalAlgorithmExplanation {
  const dataQualityRule = evaluateDataQuality(input);
  if (dataQualityRule) {
    return {
      output: {
        signal: "DATA_UNRELIABLE",
        score: 0,
        confidence: 0,
        reasons: ["Dữ liệu hiện tại chưa đủ tin cậy để đưa ra tín hiệu."]
      },
      matchedRuleId: dataQualityRule.id,
      rules: [dataQualityRule]
    };
  }

  const premiumHistory = resolvePercentileHistory(
    input.premiumPercentile180d,
    input.premiumSampleSize180d
  );
  const spreadHistory = resolvePercentileHistory(
    input.spreadPercentile180d,
    input.spreadSampleSize180d
  );
  const premiumPercentile = premiumHistory.percentile ?? 50;
  const spreadPercentile = spreadHistory.percentile ?? 50;
  const xauMomentum = resolveXauMomentum(input);
  const domesticMomentum7d: ResolvedMomentum = {
    value: input.domesticMomentum7d,
    days: input.domesticMomentum7d !== null ? (input.domesticMomentum7dDays ?? 7) : null
  };
  const confidence = buildConfidence(input);

  const avoidRule = evaluateAvoidRule(input, premiumPercentile, premiumHistory);
  if (avoidRule.matched) {
    return {
      output: {
        signal: "AVOID",
        score: 35,
        confidence,
        reasons: [
          "Premium đang ở vùng cao so với lịch sử.",
          "Premium hoặc spread đang ở mức bất lợi cho việc mua mới."
        ]
      },
      matchedRuleId: avoidRule.id,
      rules: [avoidRule]
    };
  }

  const buyDcaRule = evaluateBuyDcaRule(
    input,
    premiumPercentile,
    spreadPercentile,
    premiumHistory,
    spreadHistory,
    xauMomentum
  );
  if (buyDcaRule.matched) {
    const buyThresholds = resolveBuyThresholds(input.productCode);
    const momentumDays = xauMomentum.days ?? 30;
    const bottomCatchAcceptable = isBottomCatchAcceptableForBuy(
      input,
      premiumPercentile,
      premiumHistory,
      xauMomentum,
      buyThresholds
    );
    return {
      output: {
        signal: "BUY_DCA",
        score: buyDcaRule.score!,
        confidence,
        reasons:
          bottomCatchAcceptable && !isPremiumAbsoluteAcceptableForBuy(input, buyThresholds)
            ? [
                "Premium rơi vào nhóm cực thấp so với 180 ngày gần đây — nhánh bắt đáy thận trọng.",
                `Premium bán ≤ ${formatPercent(buyThresholds.bottomCatchPremiumAbsolute)} và spread ≤ ${formatPercent(
                  buyThresholds.bottomCatchSpreadAbsolute
                )}.`,
                `Vàng thế giới ${momentumDays} ngày giảm mạnh nhưng còn trong ngưỡng bắt đáy (≥ ${formatPercent(
                  buyThresholds.bottomCatchXauMomentumFloor
                )}).`,
                "Chỉ phù hợp chia nhỏ lệnh, không nên mua dồn."
              ]
            : [
                "Premium đang thấp hơn nhiều giai đoạn trong lịch sử — vùng hấp dẫn cho tích sản.",
                Number.isFinite(buyThresholds.premiumBuyAbsolute)
                  ? `Premium bán ≤ ${formatPercent(buyThresholds.premiumBuyAbsolute)}.`
                  : "Premium bán không bị chặn bởi ngưỡng tuyệt đối.",
                `Spread mua–bán ≤ ${formatPercent(VN_THRESHOLDS.spreadBuyAbsolute)} (bình thường thị trường VN).`,
                `Vàng thế giới ${momentumDays} ngày chưa giảm mạnh (≥ ${formatPercent(buyThresholds.xauMomentumBuyFloor)}).`
              ]
      },
      matchedRuleId: buyDcaRule.id,
      rules: [avoidRule, buyDcaRule]
    };
  }

  const takeProfitRule = evaluateTakeProfitRule(
    input,
    premiumPercentile,
    spreadPercentile,
    premiumHistory,
    spreadHistory,
    domesticMomentum7d
  );
  if (takeProfitRule.matched) {
    return {
      output: {
        signal: "TAKE_PROFIT",
        score: takeProfitRule.score!,
        confidence,
        reasons: [
          "Giá trong nước tăng nhanh trong ngắn hạn.",
          "Premium và spread đều ở vùng cao.",
          "Người đang có lãi lớn có thể cân nhắc chốt lời một phần."
        ]
      },
      matchedRuleId: takeProfitRule.id,
      rules: [avoidRule, buyDcaRule, takeProfitRule]
    };
  }

  const holdRule = evaluateHoldRule(
    input,
    premiumPercentile,
    premiumHistory,
    xauMomentum,
    domesticMomentum7d
  );
  return {
    output: {
      signal: "HOLD",
      score: holdRule.score!,
      confidence,
      reasons: buildHoldReasons(
        input,
        premiumPercentile,
        premiumHistory,
        xauMomentum,
        holdRule.score!
      )
    },
    matchedRuleId: holdRule.id,
    rules: [avoidRule, buyDcaRule, takeProfitRule, holdRule]
  };
}
