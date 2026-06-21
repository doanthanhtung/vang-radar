import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toLocaleString("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}

export type SpreadPremiumColor = "emerald" | "green" | "yellow" | "orange" | "red";

export interface SpreadPremiumLevel {
  label: string;
  color: SpreadPremiumColor;
  severity: number;
}

type SpreadPremiumThreshold = SpreadPremiumLevel & { upperBound?: number };

const SPREAD_THRESHOLDS: SpreadPremiumThreshold[] = [
  { upperBound: 0.01, label: "Rất thấp", color: "emerald", severity: 0 },
  { upperBound: 0.015, label: "Thấp", color: "green", severity: 1 },
  { upperBound: 0.025, label: "Trung bình", color: "yellow", severity: 2 },
  { upperBound: 0.04, label: "Cao", color: "orange", severity: 3 },
  { label: "Rất cao", color: "red", severity: 4 }
];

const PREMIUM_THRESHOLDS: SpreadPremiumThreshold[] = [
  { upperBound: 0.03, label: "Rất thấp", color: "emerald", severity: 0 },
  { upperBound: 0.06, label: "Thấp", color: "green", severity: 1 },
  { upperBound: 0.1, label: "Trung bình", color: "yellow", severity: 2 },
  { upperBound: 0.15, label: "Cao", color: "orange", severity: 3 },
  { label: "Rất cao", color: "red", severity: 4 }
];

const SPREAD_PREMIUM_COLOR_CLASSES: Record<SpreadPremiumColor, { badge: string; text: string }> = {
  emerald: { badge: "bg-emerald-400/15 text-emerald-300", text: "text-emerald-300" },
  green: { badge: "bg-positive/15 text-positive", text: "text-positive" },
  yellow: { badge: "bg-gold/10 text-gold/80", text: "text-gold/80" },
  orange: { badge: "bg-warning/15 text-warning", text: "text-warning" },
  red: { badge: "bg-caution/15 text-red-300", text: "text-red-300" }
};

function getLevel(
  value: number | null | undefined,
  thresholds: SpreadPremiumThreshold[]
): SpreadPremiumLevel | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const level = thresholds.find(({ upperBound }) => upperBound === undefined || value < upperBound);
  if (!level) return null;
  return { label: level.label, color: level.color, severity: level.severity };
}

export function getSpreadLevel(value: number | null | undefined): SpreadPremiumLevel | null {
  return getLevel(value, SPREAD_THRESHOLDS);
}

export function getPremiumLevel(value: number | null | undefined): SpreadPremiumLevel | null {
  return getLevel(value, PREMIUM_THRESHOLDS);
}

export function getSpreadPremiumBadgeClassName(level: SpreadPremiumLevel): string {
  return SPREAD_PREMIUM_COLOR_CLASSES[level.color].badge;
}

export function getSpreadPremiumTextClassName(level: SpreadPremiumLevel): string {
  return SPREAD_PREMIUM_COLOR_CLASSES[level.color].text;
}
