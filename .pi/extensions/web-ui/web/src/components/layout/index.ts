/**
 * @abdd.meta
 * path: .pi/extensions/web-ui/web/src/components/layout/index.ts
 * role: レイアウトコンポーネントのエクスポート
 * why: 共通レイアウトコンポーネントへの一元アクセスを提供
 * related: dashboard-page.tsx, analytics-page.tsx, agent-usage-page.tsx
 * public_api: PageLayout, PageHeader, StatsCard, LoadingState, ErrorBanner, EmptyState
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 *
 * @abdd.explain
 * overview: レイアウトコンポーネントのエントリポイント
 * what_it_does: 共通レイアウトコンポーネントを一括エクスポート
 * why_it_exists: import文を簡潔にするため
 * scope(in/out): すべてのレイアウトコンポーネント
 */

export { PageLayout } from "./page-layout";
export type { PageLayoutProps, PageLayoutVariant } from "./page-layout";

export { PageHeader, SimpleHeader } from "./page-header";
export type { PageHeaderProps, SimpleHeaderProps } from "./page-header";

export { StatsCard, SimpleStatsCard, StatsGrid } from "./stats-card";
export type { StatsCardProps, SimpleStatsCardProps, StatsGridProps, StatsCardVariant, StatsGridCols } from "./stats-card";

export { LoadingState, InlineLoading } from "./loading-state";
export type { LoadingStateProps, InlineLoadingProps, LoadingSize } from "./loading-state";

export { ErrorBanner, InlineError } from "./error-banner";
export type { ErrorBannerProps, InlineErrorProps } from "./error-banner";

export { EmptyState, ChartEmptyState } from "./empty-state";
export type { EmptyStateProps, ChartEmptyStateProps } from "./empty-state";

export {
  CHART_TOOLTIP_STYLE,
  CHART_COLORS,
  CHART_MARGIN,
  CHART_AXIS_STYLE,
  formatChartNumber,
  formatChartPercent,
  createTickFormatter,
} from "./chart-utils";
