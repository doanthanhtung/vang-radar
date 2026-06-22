import {
  explainDecisionSignal,
  generateDecisionSignal,
  type DecisionSignal,
  type ProductCode,
  type SignalAlgorithmExplanation,
  type SignalInput,
  type SignalOutput
} from "@vang-radar/domain";
import type { MarketSummary, MarketSummaryProduct } from "./api-client";

export interface VangDecision {
  title: string;
  score: number | null;
  reason: string;
  action: string;
}

export interface ScoreExplanationInput {
  code: ProductCode;
  name: string;
  premiumBuyPct: number;
  premiumSellPct: number;
  spreadPct: number;
  buyPrice: number;
  sellPrice: number;
  xauUsdPerOz: number;
  usdVnd: number;
  worldVndPerLuong: number;
  premiumPercentile180d: number | null;
  spreadPercentile180d: number | null;
  historySampleSize180d: number;
  xauMomentum7d: number | null;
  xauMomentum30d: number | null;
  xauMomentum7dDays: number | null;
  xauMomentum30dDays: number | null;
  domesticMomentum7d: number | null;
  domesticMomentum7dDays: number | null;
}

export interface ScoreExplanation {
  ready: boolean;
  productName: string;
  score: number | null;
  signal: DecisionSignal | null;
  summary: string;
  reasons: string[];
  premiumSellPct: number | null;
  spreadPct: number | null;
  algorithm: SignalAlgorithmExplanation | null;
}

export function average(values: Array<number | string>): number {
  const numbers = values.map(Number).filter(Number.isFinite);
  return numbers.reduce((sum, value) => sum + value, 0) / Math.max(numbers.length, 1);
}

export function calculateVangScore(scores: number[]): number {
  const averageScore = Math.round(average(scores));
  return Math.max(0, Math.min(100, averageScore));
}

export function toScoreExplanationInput(
  product: MarketSummaryProduct,
  world: MarketSummary["world"]
): ScoreExplanationInput {
  return {
    code: product.code as ProductCode,
    name: product.name,
    premiumBuyPct: product.premiumBuyPct,
    premiumSellPct: product.premiumSellPct,
    spreadPct: product.spreadPct,
    buyPrice: product.buyPrice,
    sellPrice: product.sellPrice,
    xauUsdPerOz: world.xauUsdPerOz,
    usdVnd: world.usdVnd,
    worldVndPerLuong: world.worldVndPerLuong,
    premiumPercentile180d: product.premiumPercentile180d,
    spreadPercentile180d: product.spreadPercentile180d,
    historySampleSize180d: product.historySampleSize180d,
    xauMomentum7d: product.xauMomentum7d,
    xauMomentum30d: product.xauMomentum30d,
    xauMomentum7dDays: product.xauMomentum7dDays,
    xauMomentum30dDays: product.xauMomentum30dDays,
    domesticMomentum7d: product.domesticMomentum7d,
    domesticMomentum7dDays: product.domesticMomentum7dDays
  };
}

export function computeLiveProductSignal(
  product: MarketSummaryProduct,
  world: MarketSummary["world"]
): SignalOutput {
  return generateDecisionSignal(toSignalInput(toScoreExplanationInput(product, world)));
}

export function enrichProductWithLiveSignal(
  product: MarketSummaryProduct,
  world: MarketSummary["world"]
): MarketSummaryProduct {
  const output = computeLiveProductSignal(product, world);
  return {
    ...product,
    signal: output.signal,
    score: output.score,
    confidence: output.confidence,
    reasons: output.reasons
  };
}

export function enrichSummaryProducts(summary: MarketSummary): MarketSummaryProduct[] {
  const isDataReady =
    summary.products.length > 0 && summary.world.xauUsdPerOz > 0 && summary.world.usdVnd > 0;
  if (!isDataReady) return summary.products;
  return summary.products.map((product) => enrichProductWithLiveSignal(product, summary.world));
}

function toSignalInput(product: ScoreExplanationInput): SignalInput {
  return {
    productCode: product.code,
    domesticBuyPriceVnd: product.buyPrice,
    domesticSellPriceVnd: product.sellPrice,
    xauUsdPerOz: product.xauUsdPerOz,
    usdVnd: product.usdVnd,
    worldVndPerLuong: product.worldVndPerLuong,
    premiumBuyPct: product.premiumBuyPct,
    premiumSellPct: product.premiumSellPct,
    spreadAbsVnd: product.sellPrice - product.buyPrice,
    spreadPct: product.spreadPct,
    premiumPercentile180d: product.premiumPercentile180d,
    spreadPercentile180d: product.spreadPercentile180d,
    premiumSampleSize180d: product.historySampleSize180d,
    spreadSampleSize180d: product.historySampleSize180d,
    xauMomentum7d: product.xauMomentum7d,
    xauMomentum30d: product.xauMomentum30d,
    xauMomentum7dDays: product.xauMomentum7dDays,
    xauMomentum30dDays: product.xauMomentum30dDays,
    domesticMomentum7d: product.domesticMomentum7d,
    domesticMomentum7dDays: product.domesticMomentum7dDays,
    dataQualityScore: 100,
    isDataValid: true
  };
}

export function buildScoreExplanation(product: ScoreExplanationInput | null): ScoreExplanation {
  if (!product) {
    return {
      ready: false,
      productName: "Nhẫn 9999 DOJI",
      score: null,
      signal: null,
      summary: "Chưa có dữ liệu DOJI để giải thích điểm số.",
      reasons: [],
      premiumSellPct: null,
      spreadPct: null,
      algorithm: null
    };
  }

  const algorithm = explainDecisionSignal(toSignalInput(product));
  const { signal, score, reasons } = algorithm.output;

  return {
    ready: true,
    productName: product.name,
    score,
    signal,
    summary: buildProductScoreSummary(product.name, signal, score, algorithm),
    reasons,
    premiumSellPct: product.premiumSellPct,
    spreadPct: product.spreadPct,
    algorithm
  };
}

function buildProductScoreSummary(
  productName: string,
  signal: DecisionSignal,
  score: number,
  algorithm: SignalAlgorithmExplanation
): string {
  const matchedRule = algorithm.rules.find((rule) => rule.id === algorithm.matchedRuleId);
  const formula = matchedRule?.scoreFormula ?? `Điểm = ${score}`;

  return [
    `${productName} có điểm ${score}/100 với tín hiệu ${signalLabel(signal)}.`,
    `Engine khớp quy tắc "${matchedRule?.label ?? signal}".`,
    formula
  ].join(" ");
}

function signalLabel(signal: DecisionSignal): string {
  switch (signal) {
    case "BUY_DCA":
      return "Nên mua dần";
    case "HOLD":
      return "Chờ thêm";
    case "AVOID":
      return "Không nên mua";
    case "TAKE_PROFIT":
      return "Chốt lời một phần";
    default:
      return "Dữ liệu chưa tin cậy";
  }
}

export function getVangDecision(
  ready: boolean,
  score: number,
  priceGap: number,
  premium: number
): VangDecision {
  if (!ready) {
    return {
      title: "ĐANG CHỜ THÊM DỮ LIỆU",
      score: null,
      reason:
        "Chưa có đủ giá vàng trong nước, giá thế giới hoặc tỷ giá để đưa ra kết luận đáng tin.",
      action: "Chờ dữ liệu đầy đủ trước khi quyết định mua."
    };
  }

  const reason = `Vàng trong nước đang cao hơn giá thế giới quy đổi khoảng ${formatDecisionVnd(Math.max(0, priceGap))}/lượng. Premium hiện ở mức ${formatDecisionPercent(premium)}.`;

  if (score >= 70) {
    return {
      title: "CÓ THỂ MUA",
      score,
      reason,
      action: "Phù hợp hơn với nhu cầu tích sản dài hạn; vẫn nên chia nhỏ số tiền mua."
    };
  }

  if (score >= 40) {
    return {
      title: "CÂN NHẮC",
      score,
      reason,
      action: "Chỉ mua nếu có nhu cầu dài hạn; chưa phù hợp để mua lướt sóng."
    };
  }

  return {
    title: "NÊN CHỜ THÊM",
    score,
    reason,
    action: "Chỉ mua nếu có nhu cầu dài hạn; chưa phù hợp để mua lướt sóng."
  };
}

function formatDecisionVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(value);
}

function formatDecisionPercent(value: number): string {
  return `${(value * 100).toLocaleString("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}