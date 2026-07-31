import {
  calculatePremiumPct,
  calculateSpreadAbsVnd,
  calculateSpreadPct,
  calculateWorldVndPerLuong
} from "../formulas/gold.js";
import { buildMomentum } from "../formulas/momentum.js";
import type { ProductCode, SignalInput, SignalOutput } from "../types/index.js";
import { generateDecisionSignal } from "./engine.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 180;

export const SIGNAL_ENGINE_VERSION = "2026-07-24";

export interface HistoricalSignalRow {
  date: string | Date;
  productCode: ProductCode;
  domesticBuyPriceVnd: number;
  domesticSellPriceVnd: number;
  xauUsdPerOz: number;
  usdVnd: number;
  dataQualityScore?: number;
  isDataValid?: boolean;
}

export interface HistoricalSignalResult {
  date: string;
  productCode: ProductCode;
  engineVersion: string;
  input: SignalInput;
  output: SignalOutput;
}

interface NormalizedHistoricalRow extends Omit<HistoricalSignalRow, "date"> {
  date: Date;
  originalIndex: number;
}

function parseDate(value: string | Date, rowIndex: number): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Historical row ${rowIndex} has an invalid date`);
  }
  return date;
}

function assertFinitePositive(value: number, name: string, rowIndex: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Historical row ${rowIndex} has invalid ${name}`);
  }
}

function normalizeRows(rows: HistoricalSignalRow[]): NormalizedHistoricalRow[] {
  return rows
    .map((row, originalIndex) => {
      assertFinitePositive(row.domesticBuyPriceVnd, "domesticBuyPriceVnd", originalIndex);
      assertFinitePositive(row.domesticSellPriceVnd, "domesticSellPriceVnd", originalIndex);
      assertFinitePositive(row.xauUsdPerOz, "xauUsdPerOz", originalIndex);
      assertFinitePositive(row.usdVnd, "usdVnd", originalIndex);
      return {
        ...row,
        date: parseDate(row.date, originalIndex),
        originalIndex
      };
    })
    .sort((left, right) => left.date.getTime() - right.date.getTime());
}

function percentileRank(values: number[], current: number): number | null {
  if (values.length === 0) return null;
  return (values.filter((value) => value <= current).length / values.length) * 100;
}

function findMomentumReference(
  history: NormalizedHistoricalRow[],
  now: Date,
  targetDays: 7 | 30,
  selectValue: (row: NormalizedHistoricalRow) => number
): { value: number; time: Date } | null {
  const targetTime = now.getTime() - targetDays * MS_PER_DAY;
  const atTarget = [...history].reverse().find((row) => row.date.getTime() <= targetTime);
  const reference = atTarget ?? history[0];
  return reference ? { value: selectValue(reference), time: reference.date } : null;
}

export function recomputeHistoricalSignals(
  rows: HistoricalSignalRow[]
): HistoricalSignalResult[] {
  const normalized = normalizeRows(rows);

  return normalized.map((row, index) => {
    const previousRows = normalized
      .slice(0, index)
      .filter((item) => item.productCode === row.productCode);
    const since = row.date.getTime() - HISTORY_DAYS * MS_PER_DAY;
    const percentileHistory = previousRows.filter((item) => item.date.getTime() >= since);
    const worldVndPerLuong = calculateWorldVndPerLuong(row.xauUsdPerOz, row.usdVnd);
    const premiumBuyPct = calculatePremiumPct(row.domesticBuyPriceVnd, worldVndPerLuong);
    const premiumSellPct = calculatePremiumPct(row.domesticSellPriceVnd, worldVndPerLuong);
    const spreadAbsVnd = calculateSpreadAbsVnd(
      row.domesticSellPriceVnd,
      row.domesticBuyPriceVnd
    );
    const spreadPct = calculateSpreadPct(row.domesticSellPriceVnd, row.domesticBuyPriceVnd);
    const historicalPremiums = percentileHistory.map((item) => {
      const historicalWorldVnd = calculateWorldVndPerLuong(item.xauUsdPerOz, item.usdVnd);
      return calculatePremiumPct(item.domesticSellPriceVnd, historicalWorldVnd);
    });
    const historicalSpreads = percentileHistory.map((item) =>
      calculateSpreadPct(item.domesticSellPriceVnd, item.domesticBuyPriceVnd)
    );
    const xau7d = buildMomentum(
      row.xauUsdPerOz,
      findMomentumReference(previousRows, row.date, 7, (item) => item.xauUsdPerOz),
      row.date
    );
    const xau30d = buildMomentum(
      row.xauUsdPerOz,
      findMomentumReference(previousRows, row.date, 30, (item) => item.xauUsdPerOz),
      row.date
    );
    const domestic7d = buildMomentum(
      row.domesticSellPriceVnd,
      findMomentumReference(previousRows, row.date, 7, (item) => item.domesticSellPriceVnd),
      row.date
    );
    const input: SignalInput = {
      productCode: row.productCode,
      domesticBuyPriceVnd: row.domesticBuyPriceVnd,
      domesticSellPriceVnd: row.domesticSellPriceVnd,
      xauUsdPerOz: row.xauUsdPerOz,
      usdVnd: row.usdVnd,
      worldVndPerLuong,
      premiumBuyPct,
      premiumSellPct,
      spreadAbsVnd,
      spreadPct,
      premiumPercentile180d: percentileRank(historicalPremiums, premiumSellPct),
      spreadPercentile180d: percentileRank(historicalSpreads, spreadPct),
      premiumSampleSize180d: historicalPremiums.length,
      spreadSampleSize180d: historicalSpreads.length,
      xauMomentum7d: xau7d?.value ?? null,
      xauMomentum30d: xau30d?.value ?? null,
      xauMomentum7dDays: xau7d?.days ?? null,
      xauMomentum30dDays: xau30d?.days ?? null,
      domesticMomentum7d: domestic7d?.value ?? null,
      domesticMomentum7dDays: domestic7d?.days ?? null,
      dataQualityScore: row.dataQualityScore ?? 100,
      isDataValid: row.isDataValid ?? true
    };

    return {
      date: row.date.toISOString(),
      productCode: row.productCode,
      engineVersion: SIGNAL_ENGINE_VERSION,
      input,
      output: generateDecisionSignal(input)
    };
  });
}
