/**
 * @abdd.meta
 * path: .pi/extensions/web-ui/web/src/components/layout/loading-state.tsx
 * role: ローディング状態の表示コンポーネント
 * why: 全ページで統一されたローディング表示を提供
 * related: page-layout.tsx, error-banner.tsx
 * public_api: LoadingState, LoadingStateProps
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 *
 * @abdd.explain
 * overview: ローディング状態表示コンポーネント
 * what_it_does: 統一されたローディングスピナーとメッセージを表示
 * why_it_exists: ローディング表示を統一するため
 * scope(in/out): in=message, size / out=統一されたローディングUI
 */

import { h } from "preact";
import { Loader2 } from "lucide-preact";
import { Card, CardContent } from "../ui/card";
import { cn } from "@/lib/utils";

/** @summary ローディングのサイズ */
export type LoadingSize = "sm" | "md" | "lg";

/** @summary LoadingStateのプロパティ */
export interface LoadingStateProps {
  /** ローディングメッセージ */
  message?: string;
  /** サイズ */
  size?: LoadingSize;
  /** カードでラップするか */
  showCard?: boolean;
  /** カスタムクラス名 */
  className?: string;
  /** テスト用data-testid */
  testId?: string;
}

const SIZE_CLASSES: Record<LoadingSize, { icon: string; text: string }> = {
  sm: { icon: "h-4 w-4", text: "text-xs" },
  md: { icon: "h-6 w-6", text: "text-sm" },
  lg: { icon: "h-8 w-8", text: "text-base" },
};

/**
 * @summary ローディング状態コンポーネント
 * @param props ローディングのプロパティ
 * @returns 統一されたローディング表示
 */
export function LoadingState({
  message = "Loading...",
  size = "md",
  showCard = true,
  className,
  testId,
}: LoadingStateProps) {
  const sizeClasses = SIZE_CLASSES[size];

  const content = (
    <div class={cn("flex flex-col items-center gap-2", className)} data-testid={testId}>
      <Loader2 class={cn(sizeClasses.icon, "animate-spin text-primary")} />
      <p class={cn(sizeClasses.text, "text-muted-foreground")}>{message}</p>
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

/** @summary インラインローディングのプロパティ */
export interface InlineLoadingProps {
  /** カスタムクラス名 */
  className?: string;
}

/**
 * @summary インラインローディング（小さいスピナーのみ）
 * @param props プロパティ
 * @returns 小さいスピナー
 */
export function InlineLoading({ className }: InlineLoadingProps) {
  return (
    <Loader2 class={cn("h-4 w-4 animate-spin", className)} />
  );
}
