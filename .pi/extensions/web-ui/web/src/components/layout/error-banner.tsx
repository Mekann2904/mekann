/**
 * @abdd.meta
 * path: .pi/extensions/web-ui/web/src/components/layout/error-banner.tsx
 * role: エラー表示用のバナーコンポーネント
 * why: 全ページで統一されたエラー表示を提供
 * related: page-layout.tsx, loading-state.tsx
 * public_api: ErrorBanner, InlineError, ErrorBannerProps, ErrorVariant
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 *
 * @abdd.explain
 * overview: エラー表示バナーコンポーネント
 * what_it_does: 統一されたエラーメッセージと再試行ボタンを表示、タイプ別のアイコンを提供
 * why_it_exists: エラー表示を統一し、ユーザーフレンドリーなフィードバックを提供するため
 * scope(in/out): in=message, variant, onRetry, onDismiss / out=統一されたエラーUI
 */

import { h } from "preact";
import { AlertCircle, AlertTriangle, Info, X, RefreshCw } from "lucide-preact";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { cn } from "@/lib/utils";

/** @summary エラーの種類 */
export type ErrorVariant = "error" | "warning" | "info";

/** @summary エラータイプ別のスタイルとアイコン */
const ERROR_CONFIG: Record<ErrorVariant, {
  icon: typeof AlertCircle;
  colorClass: string;
  bgClass: string;
  borderClass: string;
}> = {
  error: {
    icon: AlertCircle,
    colorClass: "text-destructive",
    bgClass: "bg-red-500/10",
    borderClass: "border-red-500/30",
  },
  warning: {
    icon: AlertTriangle,
    colorClass: "text-yellow-600 dark:text-yellow-400",
    bgClass: "bg-yellow-500/10",
    borderClass: "border-yellow-500/30",
  },
  info: {
    icon: Info,
    colorClass: "text-blue-600 dark:text-blue-400",
    bgClass: "bg-blue-500/10",
    borderClass: "border-blue-500/30",
  },
};

/** @summary ユーザーフレンドリーなエラーメッセージに変換 */
function getUserFriendlyMessage(message: string): string {
  const lowerMessage = message.toLowerCase();

  // ネットワークエラー
  if (lowerMessage.includes("failed to fetch") || lowerMessage.includes("network error")) {
    return "ネットワークに接続できません。インターネット接続を確認してください。";
  }
  if (lowerMessage.includes("timeout") || lowerMessage.includes("timed out")) {
    return "リクエストがタイムアウトしました。しばらく待ってから再試行してください。";
  }

  // 認証エラー
  if (lowerMessage.includes("unauthorized") || lowerMessage.includes("401")) {
    return "認証が必要です。ログインし直してください。";
  }
  if (lowerMessage.includes("forbidden") || lowerMessage.includes("403")) {
    return "このリソースにアクセスする権限がありません。";
  }

  // サーバーエラー
  if (lowerMessage.includes("500") || lowerMessage.includes("internal server error")) {
    return "サーバーエラーが発生しました。しばらく待ってから再試行してください。";
  }
  if (lowerMessage.includes("503") || lowerMessage.includes("service unavailable")) {
    return "サービスが一時的に利用できません。しばらく待ってから再試行してください。";
  }

  // タスク関連
  if (lowerMessage.includes("cannot complete") && lowerMessage.includes("subtask")) {
    return "すべてのサブタスクを完了してから、このタスクを完了してください。";
  }

  // その他
  if (lowerMessage.includes("not found") || lowerMessage.includes("404")) {
    return "リソースが見つかりません。";
  }

  // デフォルト: 元のメッセージを返す
  return message;
}

/** @summary ErrorBannerのプロパティ */
export interface ErrorBannerProps {
  /** エラーメッセージ */
  message: string;
  /** エラーの種類（デフォルト: error） */
  variant?: ErrorVariant;
  /** タイトル（オプション） */
  title?: string;
  /** ユーザーフレンドリーなメッセージに変換するか（デフォルト: true） */
  userFriendly?: boolean;
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
  variant = "error",
  title,
  userFriendly = true,
  onRetry,
  onDismiss,
  showCard = true,
  className,
  testId,
}: ErrorBannerProps) {
  const config = ERROR_CONFIG[variant];
  const Icon = config.icon;
  const displayMessage = userFriendly ? getUserFriendlyMessage(message) : message;

  const content = (
    <div
      class={cn(
        "flex flex-col gap-1",
        config.colorClass,
        showCard ? "" : cn("p-3 rounded-md border", config.bgClass, config.borderClass),
        className
      )}
      data-testid={testId}
    >
      <div class="flex items-center gap-2">
        <Icon class="h-4 w-4 shrink-0" />
        {title && <span class="text-sm font-medium flex-1">{title}</span>}
        {!title && <span class="text-sm flex-1">{displayMessage}</span>}
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            class="shrink-0"
          >
            <RefreshCw class="h-3.5 w-3.5 mr-1" />
            再試行
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
      {title && <span class="text-sm pl-6">{displayMessage}</span>}
    </div>
  );

  if (showCard) {
    return (
      <Card class={cn("shrink-0", config.borderClass)}>
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
  /** エラーの種類（デフォルト: error） */
  variant?: ErrorVariant;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * @summary インラインエラー（小さい表示）
 * @param props プロパティ
 * @returns 小さいエラー表示
 */
export function InlineError({ message, variant = "error", className }: InlineErrorProps) {
  const config = ERROR_CONFIG[variant];
  const Icon = config.icon;

  return (
    <div class={cn("flex items-center gap-1.5 text-xs", config.colorClass, className)}>
      <Icon class="h-3 w-3" />
      <span>{message}</span>
    </div>
  );
}
