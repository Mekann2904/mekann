/**
 * @abdd.meta
 * path: .pi/extensions/web-ui/web/src/components/layout/chart-utils.ts
 * role: チャート関連の共通スタイルとユーティリティ
 * why: 全チャートで統一されたTooltipスタイルを提供
 * related: dashboard-page.tsx, analytics-page.tsx, agent-usage-page.tsx
 * public_api: CHART_TOOLTIP_STYLE, CHART_COLORS, formatChartNumber
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 *
 * @abdd.explain
 * overview: チャート共通ユーティリティ
 * what_it_does: Tooltipスタイル、色定義、フォーマット関数を提供
 * why_it_exists: チャートのデザインを統一するため
 * scope(in/out): in=なし / out=共通スタイルとユーティリティ
 */

import type { CSSProperties } from "preact";

/** @summary チャートTooltipの共通スタイル */
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: "11px",
};

/** @summary チャート色の定義（CSS変数ベース） */
export const CHART_COLORS = {
  /** メイン色（青系） */
  primary: "hsl(var(--chart-1))",
  /** セカンダリ色（緑系） */
  secondary: "hsl(var(--chart-2))",
  /** 第三色（黄系） */
  tertiary: "hsl(var(--chart-3))",
  /** 第四色（紫系） */
  quaternary: "hsl(var(--chart-4))",
  /** 第五色（赤系） */
  quinary: "hsl(var(--chart-5))",
} as const;

/** @summary チャートのデータ点 */
export interface ChartDataPoint {
  [key: string]: string | number;
}

/**
 * @summary 数値をチャート用にフォーマット
 * @param value 数値
 * @returns フォーマットされた文字列
 */
export function formatChartNumber(value: number | undefined): string {
  if (value === undefined || isNaN(value)) return "0";
  if (value < 1000) return String(value);
  if (value < 1000000) return `${(value / 1000).toFixed(1)}K`;
  return `${(value / 1000000).toFixed(1)}M`;
}

/**
 * @summary パーセンテージをフォーマット
 * @param value 数値（0-1）
 * @returns フォーマットされたパーセント文字列
 */
export function formatChartPercent(value: number | undefined): string {
  if (value === undefined || isNaN(value)) return "-";
  return `${(value * 100).toFixed(0)}%`;
}

/**
 * @summary チャートのY軸ティックフォーマッタを作成
 * @param type フォーマットタイプ
 * @returns フォーマッタ関数
 */
export function createTickFormatter(
  type: "number" | "percent" | "duration" = "number"
): (value: number) => string {
  switch (type) {
    case "percent":
      return (value: number) => `${value}%`;
    case "duration":
      return (value: number) => {
        if (value < 1000) return `${value}ms`;
        if (value < 60000) return `${(value / 1000).toFixed(1)}s`;
        return `${(value / 60000).toFixed(1)}m`;
      };
    default:
      return formatChartNumber;
  }
}

/** @summary チャートの共通margin設定 */
export const CHART_MARGIN = {
  small: { top: 5, right: 5, left: 0, bottom: 0 },
  medium: { top: 5, right: 20, left: 0, bottom: 0 },
  large: { top: 10, right: 30, left: 10, bottom: 5 },
} as const;

/** @summary チャートの共通軸スタイル */
export const CHART_AXIS_STYLE = {
  tick: { fontSize: 9 },
  className: "text-muted-foreground",
} as const;
