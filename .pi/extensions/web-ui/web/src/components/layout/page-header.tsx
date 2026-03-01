/**
 * @abdd.meta
 * path: .pi/extensions/web-ui/web/src/components/layout/page-header.tsx
 * role: ページのヘッダーセクション（タイトル、説明、アクション）
 * why: 全ページで統一されたヘッダー構造を提供
 * related: page-layout.tsx, dashboard-page.tsx, analytics-page.tsx
 * public_api: PageHeader, PageHeaderProps
 * invariants: タイトルは必須
 * side_effects: なし
 * failure_modes: なし
 *
 * @abdd.explain
 * overview: ページヘッダーコンポーネント
 * what_it_does: タイトル、説明、アクション領域を一貫した構造で提供
 * why_it_exists: ヘッダーのデザインを統一するため
 * scope(in/out): in=title, description, actions, badge / out=統一されたヘッダー
 */

import { h } from "preact";
import { cn } from "@/lib/utils";

/** @summary PageHeaderのプロパティ */
export interface PageHeaderProps {
  /** ページタイトル */
  title: string;
  /** 説明文（オプション） */
  description?: string;
  /** 右側のアクション領域（ボタン等） */
  actions?: preact.ComponentChildren;
  /** タイトル横のバッジ（統計数等） */
  badge?: preact.ComponentChildren;
  /** カスタムクラス名 */
  className?: string;
  /** 区切り線を表示するか */
  showBorder?: boolean;
  /** テスト用data-testid */
  testId?: string;
}

/**
 * @summary ページヘッダーコンポーネント
 * @param props ヘッダーのプロパティ
 * @returns 統一されたヘッダー構造
 */
export function PageHeader({
  title,
  description,
  actions,
  badge,
  className,
  showBorder = false,
  testId,
}: PageHeaderProps) {
  return (
    <div
      class={cn(
        "shrink-0 flex items-center justify-between",
        showBorder && "p-4 border-b border-border bg-background",
        !showBorder && "gap-2",
        className
      )}
      data-testid={testId}
    >
      <div class="flex items-center gap-4">
        <div>
          <h1 class="text-xl font-bold">{title}</h1>
          {description && (
            <p class="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {badge && (
          <span class="text-sm text-muted-foreground">{badge}</span>
        )}
      </div>
      {actions && (
        <div class="flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

/** @summary シンプルなヘッダー（タイトルのみ）のプロパティ */
export interface SimpleHeaderProps {
  /** ページタイトル */
  title: string;
  /** 説明文 */
  description?: string;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * @summary シンプルなヘッダー（flex gap-2構造）
 * @param props ヘッダーのプロパティ
 * @returns シンプルなヘッダー構造
 */
export function SimpleHeader({
  title,
  description,
  className,
}: SimpleHeaderProps) {
  return (
    <div class={cn("flex gap-2 shrink-0 items-center justify-between", className)}>
      <div>
        <h1 class="text-xl font-bold">{title}</h1>
        {description && (
          <p class="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}
