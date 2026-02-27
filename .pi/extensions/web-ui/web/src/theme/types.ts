/**
 * @abdd.meta
 * path: .pi/extensions/web-ui/web/src/theme/types.ts
 * role: Web UIテーマの型契約を定義する。
 * why: テーマ定義と画面実装の依存を疎結合に保つため。
 * related: .pi/extensions/web-ui/web/src/theme/registry.ts, .pi/extensions/web-ui/web/src/theme/runtime.ts, .pi/extensions/web-ui/web/src/components/theme-page.tsx
 * public_api: Mode, ThemeMeta, ThemeColors, Theme, ThemeCatalog
 * invariants: Themeはlightかdarkのいずれかを必ず持つ。
 * side_effects: なし。
 * failure_modes: 型不整合はTypeScriptコンパイルで検出される。
 *
 * @abdd.explain
 * overview: テーマの共通型を集約する。
 * what_it_does: テーマ識別子、メタ情報、カラー変数、カタログ型を提供する。
 * why_it_exists: 型を一元化し、テーマ拡張時の破壊的変更を減らすため。
 * scope(in/out): in=テーマ構造定義, out=DOM適用や永続化処理
 */

/** @summary モードを表す */
export type Mode = "light" | "dark";

/** @summary テーマメタ情報 */
export interface ThemeMeta {
  id: string;
  name: string;
  author: string;
  tags: string[];
  category: "dark" | "light" | "both";
  popularity: number;
}

/** @summary テーマ色定義 */
export interface ThemeColors {
  "--background": string;
  "--foreground": string;
  "--card": string;
  "--card-foreground": string;
  "--popover": string;
  "--popover-foreground": string;
  "--primary": string;
  "--primary-foreground": string;
  "--secondary": string;
  "--secondary-foreground": string;
  "--muted": string;
  "--muted-foreground": string;
  "--accent": string;
  "--accent-foreground": string;
  "--destructive": string;
  "--destructive-foreground": string;
  "--border": string;
  "--input": string;
  "--ring": string;
}

/** @summary テーマ定義 */
export interface Theme {
  meta: ThemeMeta;
  light?: ThemeColors;
  dark?: ThemeColors;
}

/** @summary テーマ一覧型 */
export type ThemeCatalog = Record<string, Theme>;
