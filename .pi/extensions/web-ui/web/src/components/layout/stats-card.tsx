/**
 * @abdd.meta
 * path: .pi/extensions/web-ui/web/src/components/layout/stats-card.tsx
 * role: 統計表示用のカードコンポーネント
 * why: 全ページで統一された統計カード表示を提供
 * related: page-header.tsx, dashboard-page.tsx, analytics-page.tsx
 * public_api: StatsCard, StatsCardProps, StatsGrid, StatsGridProps
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 *
 * @abdd.explain
 * overview: 統計カードとグリッドコンポーネント
 * what_it_does: 数値とラベルを一貫したデザインで表示
 * why_it_exists: 統計表示のデザインを統一するため
 * scope(in/out): in=value, label, icon, progress等 / out=統一された統計カード
 */

import { h } from "preact";
import { Card, CardContent } from "../ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-preact";

/** @summary StatsCardのバリアント */
export type StatsCardVariant = "default" | "warning" | "success" | "destructive";

/** @summary StatsCardのプロパティ */
export interface StatsCardProps {
  /** 表示する値 */
  value: string | number;
  /** ラベル */
  label: string;
  /** アイコン（オプション） */
  icon?: LucideIcon;
  /** 進捗バー（0-100） */
  progress?: number;
  /** バリアント */
  variant?: StatsCardVariant;
  /** クリックハンドラ */
  onClick?: () => void;
  /** カスタムクラス名 */
  className?: string;
  /** テスト用data-testid */
  testId?: string;
}

/**
 * @summary 統計カードコンポーネント
 * @param props 統計カードのプロパティ
 * @returns 統一された統計カード
 */
export function StatsCard({
  value,
  label,
  icon: Icon,
  progress,
  variant = "default",
  onClick,
  className,
  testId,
}: StatsCardProps) {
  const variantClasses: Record<StatsCardVariant, string> = {
    default: "",
    warning: "border-yellow-500/50",
    success: "border-green-500/50",
    destructive: "border-red-500/50",
  };

  const progressColorClasses: Record<StatsCardVariant, string> = {
    default: progress !== undefined && progress >= 70
      ? "bg-green-500"
      : progress !== undefined && progress >= 40
        ? "bg-yellow-500"
        : "bg-red-500",
    warning: "bg-yellow-500",
    success: "bg-green-500",
    destructive: "bg-red-500",
  };

  return (
    <Card
      class={cn(
        variantClasses[variant],
        onClick && "cursor-pointer hover:bg-muted/50 transition-colors"
      )}
      onClick={onClick}
      data-testid={testId}
    >
      <CardContent class="py-3">
        {Icon && (
          <div class="flex items-center gap-2 mb-1">
            <Icon class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="text-xs text-muted-foreground">{label}</span>
          </div>
        )}
        {!Icon && (
          <div class="text-xs text-muted-foreground mb-1">{label}</div>
        )}
        <div class="text-lg font-bold">{value}</div>
        {progress !== undefined && (
          <div class="mt-1.5 h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              class={cn(
                "h-full rounded-full transition-all",
                progressColorClasses[variant]
              )}
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** @summary シンプルな統計カード（中央揃え）のプロパティ */
export interface SimpleStatsCardProps {
  /** 表示する値 */
  value: string | number;
  /** ラベル */
  label: string;
  /** 値の色クラス */
  valueClassName?: string;
  /** カスタムクラス名 */
  className?: string;
  /** テスト用data-testid */
  testId?: string;
}

/**
 * @summary シンプルな統計カード（中央揃え）
 * @param props プロパティ
 * @returns 中央揃えの統計カード
 */
export function SimpleStatsCard({
  value,
  label,
  valueClassName,
  className,
  testId,
}: SimpleStatsCardProps) {
  return (
    <Card class={className} data-testid={testId}>
      <CardContent class="py-3 text-center">
        <div class={cn("text-lg font-bold", valueClassName)}>{value}</div>
        <div class="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

/** @summary グリッドの列数 */
export type StatsGridCols = 2 | 3 | 4 | 6;

/** @summary StatsGridのプロパティ */
export interface StatsGridProps {
  /** カードの子要素 */
  children: preact.ComponentChildren;
  /** 列数（デフォルト: 4） */
  cols?: StatsGridCols;
  /** カスタムクラス名 */
  className?: string;
}

const COLS_CLASSES: Record<StatsGridCols, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  6: "grid-cols-6",
};

/**
 * @summary 統計カードグリッド
 * @param props グリッドのプロパティ
 * @returns 統一されたグリッドレイアウト
 */
export function StatsGrid({
  children,
  cols = 4,
  className,
}: StatsGridProps) {
  return (
    <div class={cn("grid gap-2 shrink-0", COLS_CLASSES[cols], className)}>
      {children}
    </div>
  );
}
