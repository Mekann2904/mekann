/**
 * @abdd.meta
 * path: .pi/extensions/web-ui/web/src/components/layout/page-layout.tsx
 * role: ページのルートコンテナとして一貫したレイアウト構造を提供
 * why: 全ページで統一されたパディング、スクロール、flex構造を保証
 * related: page-header.tsx, dashboard-page.tsx, analytics-page.tsx
 * public_api: PageLayout, PageLayoutProps
 * invariants: 必ずflex-col構造を持つ
 * side_effects: なし
 * failure_modes: なし
 *
 * @abdd.explain
 * overview: ページのルートコンテナコンポーネント
 * what_it_does: 統一されたパディング、ギャップ、スクロール動作を提供
 * why_it_exists: ページ間の一貫性を保つため
 * scope(in/out): in=children, header, className, variant / out=統一されたページ構造
 */

import { h } from "preact";
import { cn } from "@/lib/utils";

/** @summary ページレイアウトのバリアント */
export type PageLayoutVariant = "default" | "fixed" | "board";

/** @summary PageLayoutのプロパティ */
export interface PageLayoutProps {
  /** ページの内容 */
  children: preact.ComponentChildren;
  /** カスタムクラス名 */
  className?: string;
  /** レイアウトバリアント
   * - default: スクロール可能な標準レイアウト
   * - fixed: ヘッダー固定のスクロール領域
   * - board: カンバン用のオーバーフロー非表示レイアウト
   */
  variant?: PageLayoutVariant;
  /** テスト用data-testid */
  testId?: string;
}

/**
 * @summary ページのルートコンテナ
 * @param props ページレイアウトのプロパティ
 * @returns 統一されたページコンテナ
 */
export function PageLayout({
  children,
  className,
  variant = "default",
  testId,
}: PageLayoutProps) {
  // board variant uses flex-row for side panel layout
  const baseClasses = variant === "board" ? "flex h-full flex-row" : "flex h-full flex-col";

  const variantClasses: Record<PageLayoutVariant, string> = {
    default: "gap-4 p-4 overflow-auto",
    fixed: "overflow-hidden",
    board: "overflow-hidden",
  };

  return (
    <div
      class={cn(baseClasses, variantClasses[variant], className)}
      data-testid={testId}
    >
      {children}
    </div>
  );
}
