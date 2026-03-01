/**
 * @abdd.meta
 * path: .pi/extensions/web-ui/web/src/components/layout/empty-state.tsx
 * role: 空状態の表示コンポーネント
 * why: 全ページで統一された空状態表示を提供
 * related: page-layout.tsx, loading-state.tsx
 * public_api: EmptyState, EmptyStateProps
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 *
 * @abdd.explain
 * overview: 空状態表示コンポーネント
 * what_it_does: データがない場合の統一されたプレースホルダーを表示
 * why_it_exists: 空状態の表示を統一するため
 * scope(in/out): in=message, icon, action / out=統一された空状態UI
 */

import { h } from "preact";
import { Inbox } from "lucide-preact";
import { Card, CardContent } from "../ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-preact";

/** @summary EmptyStateのプロパティ */
export interface EmptyStateProps {
  /** メッセージ */
  message?: string;
  /** アイコン */
  icon?: LucideIcon;
  /** アクション（ボタン等） */
  action?: preact.ComponentChildren;
  /** カード形式で表示するか */
  showCard?: boolean;
  /** カスタムクラス名 */
  className?: string;
  /** テスト用data-testid */
  testId?: string;
}

/**
 * @summary 空状態コンポーネント
 * @param props 空状態のプロパティ
 * @returns 統一された空状態表示
 */
export function EmptyState({
  message = "No data available",
  icon: Icon = Inbox,
  action,
  showCard = true,
  className,
  testId,
}: EmptyStateProps) {
  const content = (
    <div
      class={cn("flex flex-col items-center justify-center gap-2", className)}
      data-testid={testId}
    >
      <Icon class="h-8 w-8 text-muted-foreground/50" />
      <p class="text-sm text-muted-foreground">{message}</p>
      {action && <div class="mt-2">{action}</div>}
    </div>
  );

  if (showCard) {
    return (
      <Card>
        <CardContent class="py-8 flex items-center justify-center">
          {content}
        </CardContent>
      </Card>
    );
  }

  return content;
}

/** @summary チャート用空状態のプロパティ */
export interface ChartEmptyStateProps {
  /** メッセージ */
  message?: string;
  /** チャートの高さ */
  height?: number | string;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * @summary チャート用の空状態
 * @param props プロパティ
 * @returns チャート領域の空状態表示
 */
export function ChartEmptyState({
  message = "No data available",
  height = 150,
  className,
}: ChartEmptyStateProps) {
  return (
    <div
      class={cn("flex items-center justify-center text-muted-foreground text-xs", className)}
      style={{ height: typeof height === "number" ? `${height}px` : height }}
    >
      {message}
    </div>
  );
}
