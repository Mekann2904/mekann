/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/layout/design-tokens.ts
 * @role デザイントークン定義
 * @why UI全体で一貫したスペーシング・タイポグラフィ・スタイルを提供
 * @related globals.css, tailwind.config.js
 * @public_api SPACING, TYPOGRAPHY, CARD_STYLES, FORM_STYLES
 * @invariants トークンは不変
 * @side_effects なし
 * @failure_modes なし
 *
 * @abdd.explain
 * @overview デザインシステムのトークン定義
 * @what_it_does スペーシング、タイポグラフィ、カード、フォームのスタイル定数を提供
 * @why_it_exists UIの視覚的一貫性を保証するため
 * @scope(in) なし
 * @scope(out) スタイル定数
 */

import { cn } from "@/lib/utils";

// ============================================================================
// Spacing Tokens
// ============================================================================

/**
 * スペーシングスケール
 * - page: ページレベルの余白 (p-4)
 * - section: セクション間の余白 (gap-4)
 * - card: カード内の余白 (gap-3, p-3)
 * - element: 要素間の余白 (gap-2)
 * - tight: 密な余白 (gap-1)
 */
export const SPACING = {
  page: "p-4",
  section: "gap-4",
  card: "gap-3 p-3",
  element: "gap-2",
  tight: "gap-1",
} as const;

/**
 * グリッドカラム数
 */
export const GRID_COLS = {
  stats: {
    sm: 2,
    md: 4,
    lg: 6,
  },
  charts: 2,
  panels: 3,
} as const;

// ============================================================================
// Typography Tokens
// ============================================================================

/**
 * タイポグラフィスタイル
 */
export const TYPOGRAPHY = {
  // 見出し
  h1: "text-xl font-bold",
  h2: "text-lg font-semibold",
  h3: "text-base font-semibold",
  h4: "text-sm font-semibold",

  // 本文
  body: "text-sm",
  bodyLarge: "text-base",
  bodySmall: "text-xs",

  // ラベル
  label: "text-xs font-medium",
  labelLarge: "text-sm font-medium",

  // 値（統計カード等）
  value: "text-lg font-bold",
  valueLarge: "text-2xl font-bold",
  valueSmall: "text-base font-semibold",

  // 補足
  muted: "text-xs text-muted-foreground",
  mutedLarge: "text-sm text-muted-foreground",

  // モノスペース
  mono: "font-mono text-xs",
  monoSm: "font-mono text-[10px]",
} as const;

// ============================================================================
// Card Style Patterns
// ============================================================================

/**
 * カードベーススタイル
 */
export const CARD_STYLES = {
  // 基本カード
  base: "rounded-lg border border-border bg-card text-card-foreground shadow-sm",

  // ヘッダー
  header: "flex flex-col space-y-1.5 p-3 pb-2",
  headerCompact: "flex flex-row items-center justify-between p-3 pb-2",

  // タイトル
  title: "text-sm font-semibold leading-none tracking-tight",
  titleLarge: "text-base font-semibold leading-none tracking-tight",

  // 説明
  description: "text-xs text-muted-foreground",

  // コンテンツ
  content: "p-3 pt-0",
  contentCompact: "p-3 pt-2",

  // バリアント
  variants: {
    default: "",
    outline: "border-border/50",
    ghost: "border-transparent bg-transparent shadow-none",
    elevated: "shadow-md",
  },
} as const;

/**
 * カードコンポーネント用クラス生成
 */
export function cardClasses(variant: keyof typeof CARD_STYLES.variants = "default") {
  return cn(CARD_STYLES.base, CARD_STYLES.variants[variant]);
}

// ============================================================================
// Form Style Patterns
// ============================================================================

/**
 * フォーム要素スタイル
 */
export const FORM_STYLES = {
  // インプット
  input: cn(
    "flex h-8 w-full rounded-md border border-input bg-background px-2.5 py-1.5",
    "text-sm ring-offset-background",
    "placeholder:text-muted-foreground/50",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
    "disabled:cursor-not-allowed disabled:opacity-50"
  ),

  // インプット（小）
  inputSm: cn(
    "flex h-7 w-full rounded-md border border-input bg-background px-2 py-1",
    "text-xs ring-offset-background",
    "placeholder:text-muted-foreground/50",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
    "disabled:cursor-not-allowed disabled:opacity-50"
  ),

  // テキストエリア
  textarea: cn(
    "flex min-h-[60px] w-full rounded-md border border-input bg-background px-2.5 py-1.5",
    "text-sm ring-offset-background",
    "placeholder:text-muted-foreground/50",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "resize-none"
  ),

  // セレクト
  select: cn(
    "flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 py-1.5",
    "text-sm ring-offset-background",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
    "disabled:cursor-not-allowed disabled:opacity-50"
  ),

  // セレクト（小）
  selectSm: cn(
    "flex h-7 w-full items-center justify-between rounded-md border border-input bg-background px-2 py-1",
    "text-xs ring-offset-background",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
    "disabled:cursor-not-allowed disabled:opacity-50"
  ),

  // ボタンサイズ
  buttonSizes: {
    sm: "h-7 px-2.5 text-xs",
    md: "h-8 px-3 text-sm",
    lg: "h-9 px-4 text-sm",
    icon: "h-8 w-8",
    iconSm: "h-7 w-7",
  },

  // ボタンサイズ（Compact）
  buttonCompact: "h-6 px-2 text-xs",

  // ラベル
  label: "text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",

  // フォームグループ
  formGroup: "space-y-1.5",
  formRow: "flex items-center gap-2",
} as const;

// ============================================================================
// State Style Patterns
// ============================================================================

/**
 * 状態表示スタイル
 */
export const STATE_STYLES = {
  // 成功
  success: {
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    text: "text-green-600 dark:text-green-400",
    icon: "text-green-500",
  },

  // 警告
  warning: {
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    text: "text-yellow-600 dark:text-yellow-400",
    icon: "text-yellow-500",
  },

  // エラー
  error: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-600 dark:text-red-400",
    icon: "text-red-500",
  },

  // 情報
  info: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-blue-600 dark:text-blue-400",
    icon: "text-blue-500",
  },
} as const;

// ============================================================================
// Animation Tokens
// ============================================================================

/**
 * アニメーション
 */
export const ANIMATION = {
  fadeIn: "animate-in fade-in-0 duration-200",
  slideIn: "animate-in slide-in-from-bottom-2 duration-200",
  scaleIn: "animate-in zoom-in-95 duration-150",
  spin: "animate-spin",
  pulse: "animate-pulse",

  // トランジション
  transition: "transition-colors duration-150",
  transitionFast: "transition-colors duration-100",
  transitionSlow: "transition-colors duration-300",
} as const;

// ============================================================================
// Common Patterns
// ============================================================================

/**
 * よく使うパターン
 */
export const PATTERNS = {
  // アイコン付きアイテム
  iconItem: "flex items-center gap-2",

  // アイコン付きラベル
  iconLabel: "flex items-center gap-1.5 text-xs text-muted-foreground",

  // ステータスバッジ
  badge: "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
  badgeSm: "inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium",

  // 区切り線
  divider: "border-t border-border",
  dividerVertical: "border-l border-border h-full",

  // ホバー効果
  hover: "hover:bg-muted/50 transition-colors",
  hoverActive: "hover:bg-muted/50 data-[state=active]:bg-muted",

  // クリック可能
  clickable: "cursor-pointer select-none",

  // テーブル行
  tableRow: "border-b hover:bg-muted/50 transition-colors",
  tableRowClickable: "border-b hover:bg-muted/50 transition-colors cursor-pointer",

  // モノスペース
  mono: "font-mono text-xs",
  monoSm: "font-mono text-[10px]",
} as const;
