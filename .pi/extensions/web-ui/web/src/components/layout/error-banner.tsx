/**
 * @abdd.meta
 * path: .pi/extensions/web-ui/web/src/components/layout/error-banner.tsx
 * role: エラー表示用のバナーコンポーネント
 * why: 全ページで統一されたエラー表示を提供
 * related: page-layout.tsx, loading-state.tsx
 * public_api: ErrorBanner, ErrorBannerProps
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 *
 * @abdd.explain
 * overview: エラー表示バナーコンポーネント
 * what_it_does: 統一されたエラーメッセージと再試行ボタンを表示
 * why_it_exists: エラー表示を統一するため
 * scope(in/out): in=message, onRetry, onDismiss / out=統一されたエラーUI
 */

import { h } from "preact";
import { AlertCircle, X, RefreshCw } from "lucide-preact";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { cn } from "@/lib/utils";

/** @summary ErrorBannerのプロパティ */
export interface ErrorBannerProps {
  /** エラーメッセージ */
  message: string;
  /** 再試行ハンドラ */
  onRetry?: () => void;
  /** 閉じるハンドラ */
  onDismiss?: () => void;
  /** カード形式で表示するか（デフォルト: true） */
  showCard?: boolean;
  /** カスタムクラス名 */
  className?: string;
  /** テスト用data-testid */
  testId?: string;
}

/**
 * @summary エラーバナーコンポーネント
 * @param props エラーバナーのプロパティ
 * @returns 統一されたエラー表示
 */
export function ErrorBanner({
  message,
  onRetry,
  onDismiss,
  showCard = true,
  className,
  testId,
}: ErrorBannerProps) {
  const content = (
    <div
      class={cn(
        "flex items-center gap-2 text-destructive",
        showCard ? "" : "p-3 bg-red-500/10 border border-red-500/30 rounded-md",
        className
      )}
      data-testid={testId}
    >
      <AlertCircle class="h-4 w-4 shrink-0" />
      <span class="text-sm flex-1">{message}</span>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          class="shrink-0"
        >
          <RefreshCw class="h-3.5 w-3.5 mr-1" />
          Retry
        </Button>
      )}
      {onDismiss && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          class="shrink-0"
        >
          <X class="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );

  if (showCard) {
    return (
      <Card class="border-destructive shrink-0">
        <CardContent class="py-3">
          {content}
        </CardContent>
      </Card>
    );
  }

  return content;
}

/** @summary インラインエラーのプロパティ */
export interface InlineErrorProps {
  /** エラーメッセージ */
  message: string;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * @summary インラインエラー（小さい表示）
 * @param props プロパティ
 * @returns 小さいエラー表示
 */
export function InlineError({ message, className }: InlineErrorProps) {
  return (
    <div class={cn("flex items-center gap-1.5 text-destructive text-xs", className)}>
      <AlertCircle class="h-3 w-3" />
      <span>{message}</span>
    </div>
  );
}
