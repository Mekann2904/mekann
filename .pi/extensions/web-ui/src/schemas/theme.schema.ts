/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/schemas/theme.schema.ts
 * @role テーマ設定のZodスキーマ
 * @why テーマ情報の型安全性とバリデーション
 * @related atoms/index.ts, components/ThemeSelector.tsx
 * @public_api ThemeSettings, ThemeId, ThemeMode
 * @invariants なし
 * @side_effects なし
 * @failure_modes なし
 *
 * @abdd.explain
 * @overview テーマ設定の型定義
 * @what_it_does テーマIDとモードのスキーマ定義
 * @why_it_exists テーマ設定の型安全性
 */

import { z } from "zod";

/**
 * テーマID（base-themes.ts + geek-themes.tsと同期）
 */
export const ThemeIdSchema = z.enum([
  // BASE_THEMES
  "zinc",
  "blue",
  "violet",
  "dracula",
  "nord",
  "tokyo-night",
  "catppuccin-mocha",
  "github-dark",
  "rose",
  "green",
  "orange",
  "monokai",
  "gruvbox",
  "one-dark",
  "github-light",
  // GEEK_THEMES
  "ayu-dark",
  "ayu-light",
  "ayu-mirage",
  "catppuccin-frappe",
  "catppuccin-latte",
  "catppuccin-macchiato",
  "cobalt2",
  "cyberpunk",
  "darcula",
  "edge-dark",
  "edge-light",
  "everforest-dark",
  "everforest-light",
  "github-dimmed",
  "gruvbox-light",
  "horizon",
  "horizon-light",
  "kanagawa-wave",
  "material-ocean",
  "night-owl",
  "nord-light",
  "one-light",
  "oxocarbon",
  "palenight",
  "papercolor-light",
  "poimandres",
  "rose-pine",
  "rose-pine-dawn",
  "solarized-dark",
  "solarized-light",
  "synthwave-84",
  "tokyo-night-day",
  "tokyo-night-moon",
  "tokyo-night-storm",
  "tomorrow-night",
  "vscode-dark-plus",
]);
export type ThemeId = z.infer<typeof ThemeIdSchema>;

/**
 * テーマモード
 */
export const ThemeModeSchema = z.enum(["light", "dark", "system"]);
export type ThemeMode = z.infer<typeof ThemeModeSchema>;

/**
 * テーマ設定
 */
export const ThemeSettingsSchema = z.object({
  themeId: ThemeIdSchema,
  mode: ThemeModeSchema,
});
export type ThemeSettings = z.infer<typeof ThemeSettingsSchema>;

/**
 * テーマ情報
 */
export const ThemeInfoSchema = z.object({
  id: ThemeIdSchema,
  name: z.string(),
  primaryColor: z.string(),
  accentColor: z.string(),
});
export type ThemeInfo = z.infer<typeof ThemeInfoSchema>;

/**
 * 利用可能なテーマ一覧
 */
export const AVAILABLE_THEMES: ThemeInfo[] = [
  { id: "zinc", name: "Zinc", primaryColor: "#71717a", accentColor: "#a1a1aa" },
  { id: "blue", name: "Blue", primaryColor: "#3b82f6", accentColor: "#60a5fa" },
  { id: "violet", name: "Violet", primaryColor: "#8b5cf6", accentColor: "#a78bfa" },
  { id: "dracula", name: "Dracula", primaryColor: "#bd93f9", accentColor: "#ff79c6" },
  { id: "nord", name: "Nord", primaryColor: "#88c0d0", accentColor: "#81a1c1" },
  { id: "tokyo-night", name: "Tokyo Night", primaryColor: "#7aa2f7", accentColor: "#bb9af7" },
  { id: "catppuccin-mocha", name: "Catppuccin Mocha", primaryColor: "#cba6f7", accentColor: "#f5c2e7" },
  { id: "github-dark", name: "GitHub Dark", primaryColor: "#58a6ff", accentColor: "#8b949e" },
  { id: "rose", name: "Rose", primaryColor: "#f43f5e", accentColor: "#fb7185" },
  { id: "green", name: "Green", primaryColor: "#22c55e", accentColor: "#4ade80" },
  { id: "orange", name: "Orange", primaryColor: "#f97316", accentColor: "#fb923c" },
  { id: "monokai", name: "Monokai", primaryColor: "#f92672", accentColor: "#a6e22e" },
  { id: "gruvbox", name: "Gruvbox", primaryColor: "#fe8019", accentColor: "#fabd2f" },
  { id: "one-dark", name: "One Dark", primaryColor: "#61afef", accentColor: "#c678dd" },
  { id: "github-light", name: "GitHub Light", primaryColor: "#0969da", accentColor: "#57606a" },
];
