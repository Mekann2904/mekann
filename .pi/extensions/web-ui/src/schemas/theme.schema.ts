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
 * テーマID
 */
export const ThemeIdSchema = z.enum([
  "blue",
  "green",
  "purple",
  "orange",
  "red",
  "cyan",
  "pink",
  "yellow",
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
  { id: "blue", name: "Blue", primaryColor: "#3b82f6", accentColor: "#60a5fa" },
  { id: "green", name: "Green", primaryColor: "#22c55e", accentColor: "#4ade80" },
  { id: "purple", name: "Purple", primaryColor: "#a855f7", accentColor: "#c084fc" },
  { id: "orange", name: "Orange", primaryColor: "#f97316", accentColor: "#fb923c" },
  { id: "red", name: "Red", primaryColor: "#ef4444", accentColor: "#f87171" },
  { id: "cyan", name: "Cyan", primaryColor: "#06b6d4", accentColor: "#22d3ee" },
  { id: "pink", name: "Pink", primaryColor: "#ec4899", accentColor: "#f472b6" },
  { id: "yellow", name: "Yellow", primaryColor: "#eab308", accentColor: "#facc15" },
];
