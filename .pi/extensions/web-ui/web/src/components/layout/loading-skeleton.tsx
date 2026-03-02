/**
 * @abdd.meta
 * path: .pi/extensions/web-ui/web/src/components/layout/loading-skeleton.tsx
 * role: 統一されたローディングスケルトンコンポーネント
 * why: 全ページで統一されたスケルトンローディング表示を提供
 * related: loading-state.tsx, error-banner.tsx
 * public_api: Skeleton, SkeletonCard, SkeletonList, SkeletonTable
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 *
 * @abdd.explain
 * overview: ローディングスケルトンコンポーネント群
 * what_it_does: カード、リスト、テーブル形式のスケルトンを表示
 * why_it_exists: ローディング中のレイアウトシフトを防ぎ、統一感のあるUXを提供
 * scope(in/out): in=variant, count / out=統一されたスケルトンUI
 */

import { h } from "preact";
import { cn } from "@/lib/utils";

/** @summary スケルトンのプロパティ */
export interface SkeletonProps {
  /** カスタムクラス名 */
  class?: string;
  /** テスト用data-testid */
  testId?: string;
}

/**
 * @summary ベーススケルトン要素
 * @param props スケルトンのプロパティ
 * @returns パルスアニメーション付きのスケルトン
 */
export function Skeleton({ class: className, testId }: SkeletonProps) {
  return (
    <div
      class={cn(
        "animate-pulse rounded-md bg-muted",
        className
      )}
      data-testid={testId}
    />
  );
}

/** @summary SkeletonCardのプロパティ */
export interface SkeletonCardProps {
  /** カスタムクラス名 */
  className?: string;
  /** テスト用data-testid */
  testId?: string;
}

/**
 * @summary カード形式のスケルトン
 * @param props カードスケルトンのプロパティ
 * @returns タスクカード風のスケルトン
 */
export function SkeletonCard({ className, testId }: SkeletonCardProps) {
  return (
    <div
      class={cn(
        "bg-card rounded-md border border-border p-2.5 space-y-2",
        className
      )}
      data-testid={testId}
    >
      {/* Priority badge + tags row */}
      <div class="flex items-center gap-1.5">
        <Skeleton class="h-5 w-14 rounded-full" />
        <Skeleton class="h-5 w-12 rounded-full" />
      </div>

      {/* Title */}
      <Skeleton class="h-4 w-3/4" />

      {/* Description preview */}
      <Skeleton class="h-3 w-full" />
      <Skeleton class="h-3 w-2/3" />

      {/* Meta info */}
      <div class="flex items-center justify-between pt-1">
        <div class="flex items-center gap-1.5">
          <Skeleton class="h-4 w-16 rounded-full" />
          <Skeleton class="h-4 w-12 rounded-full" />
        </div>
        <Skeleton class="h-5 w-5 rounded-full" />
      </div>
    </div>
  );
}

/** @summary SkeletonListのプロパティ */
export interface SkeletonListProps {
  /** アイテム数 */
  count?: number;
  /** カスタムクラス名 */
  className?: string;
  /** テスト用data-testid */
  testId?: string;
}

/**
 * @summary リスト形式のスケルトン
 * @param props リストスケルトンのプロパティ
 * @returns インスタンス一覧風のスケルトン
 */
export function SkeletonList({ count = 3, className, testId }: SkeletonListProps) {
  return (
    <div class={cn("space-y-2", className)} data-testid={testId}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          class="flex items-center gap-3 p-3 bg-card rounded-md border border-border"
        >
          {/* Status indicator */}
          <Skeleton class="h-2 w-2 rounded-full" />

          {/* Instance info */}
          <div class="flex-1 space-y-1.5">
            <Skeleton class="h-4 w-32" />
            <Skeleton class="h-3 w-48" />
          </div>

          {/* Actions */}
          <Skeleton class="h-8 w-8 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/** @summary SkeletonTableのプロパティ */
export interface SkeletonTableProps {
  /** 行数 */
  rows?: number;
  /** 列数 */
  cols?: number;
  /** カスタムクラス名 */
  className?: string;
  /** テスト用data-testid */
  testId?: string;
}

/**
 * @summary テーブル形式のスケルトン
 * @param props テーブルスケルトンのプロパティ
 * @returns アナリティクス風のスケルトン
 */
export function SkeletonTable({ rows = 5, cols = 4, className, testId }: SkeletonTableProps) {
  return (
    <div class={cn("bg-card rounded-md border border-border overflow-hidden", className)} data-testid={testId}>
      {/* Header */}
      <div class="flex items-center gap-4 p-3 border-b border-border bg-muted/30">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} class="h-4 flex-1" />
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          class="flex items-center gap-4 p-3 border-b border-border last:border-b-0"
        >
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              class={cn(
                "h-4",
                colIndex === 0 ? "w-32" : "flex-1"
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** @summary SkeletonBoardのプロパティ */
export interface SkeletonBoardProps {
  /** 列数 */
  columns?: number;
  /** カスタムクラス名 */
  className?: string;
  /** テスト用data-testid */
  testId?: string;
}

/**
 * @summary ボード形式のスケルトン
 * @param props ボードスケルトンのプロパティ
 * @returns カンバンボード風のスケルトン
 */
export function SkeletonBoard({ columns = 3, className, testId }: SkeletonBoardProps) {
  return (
    <div class={cn("flex gap-4", className)} data-testid={testId}>
      {Array.from({ length: columns }).map((_, colIndex) => (
        <div key={colIndex} class="flex flex-col w-[280px] shrink-0 bg-muted/30 rounded-md">
          {/* Column header */}
          <div class="flex items-center justify-between px-3 py-2 border-b border-border">
            <div class="flex items-center gap-2">
              <Skeleton class="h-4 w-4 rounded-full" />
              <Skeleton class="h-4 w-20" />
              <Skeleton class="h-5 w-6 rounded-full" />
            </div>
          </div>

          {/* Task cards */}
          <div class="flex-1 p-2 space-y-2">
            {Array.from({ length: 3 }).map((_, cardIndex) => (
              <SkeletonCard key={cardIndex} />
            ))}
          </div>

          {/* Add button */}
          <div class="p-2 border-t border-border">
            <Skeleton class="h-8 w-full rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
