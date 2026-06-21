import type { SignalInput, SignalOutput } from "../types/index.js";

const MIN_PERCENTILE_SAMPLE_SIZE = 30;

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

export function generateDecisionSignal(input: SignalInput): SignalOutput {
  if (!input.isDataValid || input.dataQualityScore <= 0 || hasMissingNumber(input)) {
    return {
      signal: "DATA_UNRELIABLE",
      score: 0,
      confidence: 0,
      reasons: ["Dữ liệu hiện tại chưa đủ tin cậy để đưa ra tín hiệu."]
    };
  }

  const premiumPercentile = input.premiumPercentile180d ?? 50;
  const spreadPercentile = input.spreadPercentile180d ?? 50;
  const hasEnoughPremiumHistory =
    input.premiumPercentile180d !== null &&
    input.premiumSampleSize180d >= MIN_PERCENTILE_SAMPLE_SIZE;
  const hasEnoughSpreadHistory =
    input.spreadPercentile180d !== null && input.spreadSampleSize180d >= MIN_PERCENTILE_SAMPLE_SIZE;
  const hasXauMomentum30d = input.xauMomentum30d !== null;
  const hasDomesticMomentum7d = input.domesticMomentum7d !== null;
  const confidence = Math.max(0.2, Math.min(0.95, input.dataQualityScore / 100));

  if (
    input.premiumSellPct > 0.15 ||
    input.spreadPct > 0.05 ||
    (hasEnoughPremiumHistory && premiumPercentile > 90)
  ) {
    return {
      signal: "AVOID",
      score: 35,
      confidence,
      reasons: [
        "Premium đang ở vùng cao so với lịch sử.",
        "Premium hoặc spread đang ở mức bất lợi cho việc mua mới."
      ]
    };
  }

  if (
    hasEnoughPremiumHistory &&
    hasEnoughSpreadHistory &&
    hasXauMomentum30d &&
    premiumPercentile < 40 &&
    spreadPercentile < 50 &&
    input.xauMomentum30d! >= 0
  ) {
    return {
      signal: "BUY_DCA",
      score: Math.round(65 + Math.min(15, (40 - premiumPercentile) / 3)),
      confidence,
      reasons: [
        "Premium đang thấp hơn nhiều giai đoạn trong lịch sử.",
        "Spread không quá cao.",
        "Xu hướng vàng thế giới 30 ngày không tiêu cực."
      ]
    };
  }

  if (
    hasEnoughPremiumHistory &&
    hasEnoughSpreadHistory &&
    hasDomesticMomentum7d &&
    premiumPercentile > 85 &&
    input.domesticMomentum7d! > 0.03 &&
    spreadPercentile > 80
  ) {
    return {
      signal: "TAKE_PROFIT",
      score: Math.round(55 + Math.min(15, (premiumPercentile - 85) / 2)),
      confidence,
      reasons: [
        "Giá trong nước tăng nhanh trong ngắn hạn.",
        "Premium và spread đều ở vùng cao.",
        "Người đang có lãi lớn có thể cân nhắc chốt lời một phần."
      ]
    };
  }

  return {
    signal: "HOLD",
    score: 55,
    confidence,
    reasons: [
      "Tín hiệu hiện tại chưa đủ hấp dẫn để mua mới mạnh.",
      "Người đang nắm giữ có thể tiếp tục theo dõi."
    ]
  };
}
