/**
 * @abdd.meta
 * path: .pi/extensions/web-ui/web/src/theme/base-themes.ts
 * role: Web UIの既存テーマ群を保持する。
 * why: 既存利用者のthemeId互換を維持するため。
 * related: .pi/extensions/web-ui/web/src/theme/geek-themes.ts, .pi/extensions/web-ui/web/src/theme/registry.ts, .pi/extensions/web-ui/web/src/components/theme-page.tsx
 * public_api: BASE_THEMES
 * invariants: 既存themeIdを変更しない。
 * side_effects: なし。
 * failure_modes: 重複IDはregistry側で上書きされる。
 *
 * @abdd.explain
 * overview: 既存テーマ定義のデータモジュール。
 * what_it_does: 運用中のテーマIDをそのまま定義して提供する。
 * why_it_exists: UIロジックからテーマデータを分離し肥大化を防ぐため。
 * scope(in/out): in=テーマ定義, out=テーマ適用ロジック
 */

import type { ThemeCatalog } from "./types";

export const BASE_THEMES: ThemeCatalog = {
  zinc: {
    meta: { id: "zinc", name: "Zinc", author: "shadcn/ui", tags: ["neutral", "classic", "minimal"], category: "both", popularity: 50 },
    light: { "--background": "0 0% 100%", "--foreground": "240 10% 3.9%", "--card": "0 0% 100%", "--card-foreground": "240 10% 3.9%", "--popover": "0 0% 100%", "--popover-foreground": "240 10% 3.9%", "--primary": "240 5.9% 10%", "--primary-foreground": "0 0% 98%", "--secondary": "240 4.8% 95.9%", "--secondary-foreground": "240 5.9% 10%", "--muted": "240 4.8% 95.9%", "--muted-foreground": "240 3.8% 46.1%", "--accent": "240 4.8% 95.9%", "--accent-foreground": "240 5.9% 10%", "--destructive": "0 84.2% 60.2%", "--destructive-foreground": "0 0% 98%", "--border": "240 5.9% 90%", "--input": "240 5.9% 90%", "--ring": "240 5.9% 10%" },
    dark: { "--background": "240 10% 3.9%", "--foreground": "0 0% 98%", "--card": "240 10% 3.9%", "--card-foreground": "0 0% 98%", "--popover": "240 10% 3.9%", "--popover-foreground": "0 0% 98%", "--primary": "0 0% 98%", "--primary-foreground": "240 5.9% 10%", "--secondary": "240 3.7% 15.9%", "--secondary-foreground": "0 0% 98%", "--muted": "240 3.7% 15.9%", "--muted-foreground": "240 5% 64.9%", "--accent": "240 3.7% 15.9%", "--accent-foreground": "0 0% 98%", "--destructive": "0 62.8% 30.6%", "--destructive-foreground": "0 0% 98%", "--border": "240 3.7% 15.9%", "--input": "240 3.7% 15.9%", "--ring": "240 4.9% 83.9%" },
  },
  blue: {
    meta: { id: "blue", name: "Blue", author: "shadcn/ui", tags: ["blue", "classic", "default"], category: "both", popularity: 90 },
    light: { "--background": "0 0% 100%", "--foreground": "222.2 84% 4.9%", "--card": "0 0% 100%", "--card-foreground": "222.2 84% 4.9%", "--popover": "0 0% 100%", "--popover-foreground": "222.2 84% 4.9%", "--primary": "221.2 83.2% 53.3%", "--primary-foreground": "210 40% 98%", "--secondary": "210 40% 96.1%", "--secondary-foreground": "222.2 47.4% 11.2%", "--muted": "210 40% 96.1%", "--muted-foreground": "215.4 16.3% 46.9%", "--accent": "210 40% 96.1%", "--accent-foreground": "222.2 47.4% 11.2%", "--destructive": "0 84.2% 60.2%", "--destructive-foreground": "210 40% 98%", "--border": "214.3 31.8% 91.4%", "--input": "214.3 31.8% 91.4%", "--ring": "221.2 83.2% 53.3%" },
    dark: { "--background": "222.2 84% 4.9%", "--foreground": "210 40% 98%", "--card": "222.2 84% 4.9%", "--card-foreground": "210 40% 98%", "--popover": "222.2 84% 4.9%", "--popover-foreground": "210 40% 98%", "--primary": "217.2 91.2% 59.8%", "--primary-foreground": "222.2 47.4% 11.2%", "--secondary": "217.2 32.6% 17.5%", "--secondary-foreground": "210 40% 98%", "--muted": "217.2 32.6% 17.5%", "--muted-foreground": "215 20.2% 65.1%", "--accent": "217.2 32.6% 17.5%", "--accent-foreground": "210 40% 98%", "--destructive": "0 62.8% 30.6%", "--destructive-foreground": "210 40% 98%", "--border": "217.2 32.6% 17.5%", "--input": "217.2 32.6% 17.5%", "--ring": "224.3 76.3% 48%" },
  },
  violet: {
    meta: { id: "violet", name: "Violet", author: "shadcn/ui", tags: ["purple", "elegant", "popular"], category: "both", popularity: 80 },
    light: { "--background": "0 0% 100%", "--foreground": "224 71.4% 4.1%", "--card": "0 0% 100%", "--card-foreground": "224 71.4% 4.1%", "--popover": "0 0% 100%", "--popover-foreground": "224 71.4% 4.1%", "--primary": "263.4 70% 50.4%", "--primary-foreground": "210 20% 98%", "--secondary": "220 14.3% 95.9%", "--secondary-foreground": "220.9 39.3% 11%", "--muted": "220 14.3% 95.9%", "--muted-foreground": "220 8.9% 46.1%", "--accent": "220 14.3% 95.9%", "--accent-foreground": "220.9 39.3% 11%", "--destructive": "0 84.2% 60.2%", "--destructive-foreground": "210 20% 98%", "--border": "220 13% 91%", "--input": "220 13% 91%", "--ring": "263.4 70% 50.4%" },
    dark: { "--background": "224 71.4% 4.1%", "--foreground": "210 20% 98%", "--card": "224 71.4% 4.1%", "--card-foreground": "210 20% 98%", "--popover": "224 71.4% 4.1%", "--popover-foreground": "210 20% 98%", "--primary": "263.4 70% 50.4%", "--primary-foreground": "210 20% 98%", "--secondary": "215 27.9% 16.9%", "--secondary-foreground": "210 20% 98%", "--muted": "215 27.9% 16.9%", "--muted-foreground": "217.9 10.6% 64.9%", "--accent": "215 27.9% 16.9%", "--accent-foreground": "210 20% 98%", "--destructive": "0 62.8% 30.6%", "--destructive-foreground": "210 20% 98%", "--border": "215 27.9% 16.9%", "--input": "215 27.9% 16.9%", "--ring": "263.4 70% 50.4%" },
  },
  dracula: {
    meta: { id: "dracula", name: "Dracula", author: "Zeno Rocha", tags: ["dark", "purple", "popular", "vampire"], category: "dark", popularity: 100 },
    dark: { "--background": "231 15% 14%", "--foreground": "60 30% 96%", "--card": "231 15% 14%", "--card-foreground": "60 30% 96%", "--popover": "231 15% 14%", "--popover-foreground": "60 30% 96%", "--primary": "265 89% 78%", "--primary-foreground": "231 15% 14%", "--secondary": "232 14% 21%", "--secondary-foreground": "60 30% 96%", "--muted": "232 14% 21%", "--muted-foreground": "60 20% 70%", "--accent": "232 14% 21%", "--accent-foreground": "60 30% 96%", "--destructive": "0 91% 61%", "--destructive-foreground": "60 30% 96%", "--border": "232 14% 21%", "--input": "232 14% 21%", "--ring": "265 89% 78%" },
  },
  nord: {
    meta: { id: "nord", name: "Nord", author: "Arctic Ice Studio", tags: ["dark", "blue", "cold", "minimal"], category: "dark", popularity: 85 },
    dark: { "--background": "220 16% 14%", "--foreground": "218 22% 85%", "--card": "220 16% 14%", "--card-foreground": "218 22% 85%", "--popover": "220 16% 14%", "--popover-foreground": "218 22% 85%", "--primary": "213 38% 62%", "--primary-foreground": "220 16% 14%", "--secondary": "220 14% 20%", "--secondary-foreground": "218 22% 85%", "--muted": "220 14% 20%", "--muted-foreground": "218 16% 60%", "--accent": "220 14% 20%", "--accent-foreground": "218 22% 85%", "--destructive": "0 75% 60%", "--destructive-foreground": "218 22% 85%", "--border": "220 14% 20%", "--input": "220 14% 20%", "--ring": "213 38% 62%" },
  },
  "tokyo-night": {
    meta: { id: "tokyo-night", name: "Tokyo Night", author: "Enkia", tags: ["dark", "blue", "japan", "popular"], category: "dark", popularity: 95 },
    dark: { "--background": "225 20% 10%", "--foreground": "227 30% 95%", "--card": "225 20% 10%", "--card-foreground": "227 30% 95%", "--popover": "225 20% 10%", "--popover-foreground": "227 30% 95%", "--primary": "225 50% 58%", "--primary-foreground": "225 20% 10%", "--secondary": "225 15% 18%", "--secondary-foreground": "227 30% 95%", "--muted": "225 15% 18%", "--muted-foreground": "227 15% 65%", "--accent": "225 15% 18%", "--accent-foreground": "227 30% 95%", "--destructive": "0 75% 58%", "--destructive-foreground": "227 30% 95%", "--border": "225 15% 18%", "--input": "225 15% 18%", "--ring": "225 50% 58%" },
  },
  "catppuccin-mocha": {
    meta: { id: "catppuccin-mocha", name: "Catppuccin Mocha", author: "Catppuccin", tags: ["dark", "pastel", "dark", "popular"], category: "dark", popularity: 93 },
    dark: { "--background": "240 15% 10%", "--foreground": "240 10% 95%", "--card": "240 15% 10%", "--card-foreground": "240 10% 95%", "--popover": "240 15% 10%", "--popover-foreground": "240 10% 95%", "--primary": "340 50% 60%", "--primary-foreground": "240 15% 10%", "--secondary": "240 8% 17%", "--secondary-foreground": "240 10% 95%", "--muted": "240 8% 17%", "--muted-foreground": "240 6% 63%", "--accent": "240 8% 17%", "--accent-foreground": "240 10% 95%", "--destructive": "10 65% 55%", "--destructive-foreground": "240 10% 95%", "--border": "240 8% 17%", "--input": "240 8% 17%", "--ring": "340 50% 60%" },
  },
  "github-dark": {
    meta: { id: "github-dark", name: "GitHub Dark", author: "GitHub", tags: ["dark", "professional", "clean"], category: "dark", popularity: 87 },
    dark: { "--background": "220 15% 9%", "--foreground": "210 15% 92%", "--card": "220 15% 9%", "--card-foreground": "210 15% 92%", "--popover": "220 15% 9%", "--popover-foreground": "210 15% 92%", "--primary": "210 40% 58%", "--primary-foreground": "220 15% 9%", "--secondary": "220 12% 16%", "--secondary-foreground": "210 15% 92%", "--muted": "220 12% 16%", "--muted-foreground": "210 10% 60%", "--accent": "220 12% 16%", "--accent-foreground": "210 15% 92%", "--destructive": "0 70% 55%", "--destructive-foreground": "210 15% 92%", "--border": "220 12% 16%", "--input": "220 12% 16%", "--ring": "210 40% 58%" },
  },
  rose: {
    meta: { id: "rose", name: "Rose", author: "shadcn/ui", tags: ["pink", "elegant", "warm"], category: "both", popularity: 70 },
    light: { "--background": "0 0% 100%", "--foreground": "240 10% 3.9%", "--card": "0 0% 100%", "--card-foreground": "240 10% 3.9%", "--popover": "0 0% 100%", "--popover-foreground": "240 10% 3.9%", "--primary": "346.8 77.2% 49.8%", "--primary-foreground": "355.7 100% 97.3%", "--secondary": "240 4.8% 95.9%", "--secondary-foreground": "240 5.9% 10%", "--muted": "240 4.8% 95.9%", "--muted-foreground": "240 3.8% 46.1%", "--accent": "240 4.8% 95.9%", "--accent-foreground": "240 5.9% 10%", "--destructive": "0 84.2% 60.2%", "--destructive-foreground": "0 0% 98%", "--border": "240 5.9% 90%", "--input": "240 5.9% 90%", "--ring": "346.8 77.2% 49.8%" },
    dark: { "--background": "20 14.3% 4.1%", "--foreground": "0 0% 95%", "--card": "24 9.8% 10%", "--card-foreground": "0 0% 95%", "--popover": "0 0% 9%", "--popover-foreground": "0 0% 95%", "--primary": "346.8 77.2% 49.8%", "--primary-foreground": "355.7 100% 97.3%", "--secondary": "240 3.7% 15.9%", "--secondary-foreground": "0 0% 98%", "--muted": "0 0% 15%", "--muted-foreground": "240 5% 64.9%", "--accent": "12 6.5% 15.1%", "--accent-foreground": "0 0% 98%", "--destructive": "0 62.8% 30.6%", "--destructive-foreground": "0 0% 98%", "--border": "240 3.7% 15.9%", "--input": "240 3.7% 15.9%", "--ring": "346.8 77.2% 49.8%" },
  },
  green: {
    meta: { id: "green", name: "Green", author: "shadcn/ui", tags: ["green", "nature", "fresh"], category: "both", popularity: 65 },
    light: { "--background": "0 0% 100%", "--foreground": "142.1 76.2% 36.3%", "--card": "0 0% 100%", "--card-foreground": "142.1 76.2% 36.3%", "--popover": "0 0% 100%", "--popover-foreground": "142.1 76.2% 36.3%", "--primary": "142.1 76.2% 36.3%", "--primary-foreground": "355.7 100% 97.3%", "--secondary": "220 14.3% 95.9%", "--secondary-foreground": "220.9 39.3% 11%", "--muted": "220 14.3% 95.9%", "--muted-foreground": "220 8.9% 46.1%", "--accent": "220 14.3% 95.9%", "--accent-foreground": "220.9 39.3% 11%", "--destructive": "0 84.2% 60.2%", "--destructive-foreground": "210 20% 98%", "--border": "220 13% 91%", "--input": "220 13% 91%", "--ring": "142.1 76.2% 36.3%" },
    dark: { "--background": "142.1 70.6% 10.4%", "--foreground": "355.7 100% 97.3%", "--card": "142.1 70.6% 10.4%", "--card-foreground": "355.7 100% 97.3%", "--popover": "142.1 70.6% 10.4%", "--popover-foreground": "355.7 100% 97.3%", "--primary": "142.1 70.6% 45.3%", "--primary-foreground": "144.9 80.4% 10%", "--secondary": "144.4 64.5% 14.6%", "--secondary-foreground": "355.7 100% 97.3%", "--muted": "144.4 64.5% 14.6%", "--muted-foreground": "142.1 27.4% 62%", "--accent": "144.4 64.5% 14.6%", "--accent-foreground": "355.7 100% 97.3%", "--destructive": "0 62.8% 30.6%", "--destructive-foreground": "355.7 100% 97.3%", "--border": "144.4 64.5% 14.6%", "--input": "144.4 64.5% 14.6%", "--ring": "142.1 76.2% 36.3%" },
  },
  orange: {
    meta: { id: "orange", name: "Orange", author: "shadcn/ui", tags: ["orange", "warm", "vibrant"], category: "both", popularity: 60 },
    light: { "--background": "0 0% 100%", "--foreground": "20 14.3% 4.1%", "--card": "0 0% 100%", "--card-foreground": "20 14.3% 4.1%", "--popover": "0 0% 100%", "--popover-foreground": "20 14.3% 4.1%", "--primary": "24.6 95% 53.1%", "--primary-foreground": "60 9.1% 97.8%", "--secondary": "60 4.8% 95.9%", "--secondary-foreground": "24 9.8% 10%", "--muted": "60 4.8% 95.9%", "--muted-foreground": "25 5.3% 44.7%", "--accent": "60 4.8% 95.9%", "--accent-foreground": "24 9.8% 10%", "--destructive": "0 84.2% 60.2%", "--destructive-foreground": "0 0% 98%", "--border": "20 5.9% 90%", "--input": "20 5.9% 90%", "--ring": "24.6 95% 53.1%" },
    dark: { "--background": "20 14.3% 4.1%", "--foreground": "60 9.1% 97.8%", "--card": "20 14.3% 4.1%", "--card-foreground": "60 9.1% 97.8%", "--popover": "20 14.3% 4.1%", "--popover-foreground": "60 9.1% 97.8%", "--primary": "20.5 90.2% 48.2%", "--primary-foreground": "60 9.1% 97.8%", "--secondary": "12 6.5% 15.1%", "--secondary-foreground": "60 9.1% 97.8%", "--muted": "12 6.5% 15.1%", "--muted-foreground": "24 5.4% 63.9%", "--accent": "12 6.5% 15.1%", "--accent-foreground": "60 9.1% 97.8%", "--destructive": "0 62.8% 30.6%", "--destructive-foreground": "60 9.1% 97.8%", "--border": "12 6.5% 15.1%", "--input": "12 6.5% 15.1%", "--ring": "20.5 90.2% 48.2%" },
  },
  monokai: {
    meta: { id: "monokai", name: "Monokai", author: "Wimer Hazenberg", tags: ["dark", "yellow", "classic", "retro"], category: "dark", popularity: 75 },
    dark: { "--background": "32 15% 9%", "--foreground": "32 15% 95%", "--card": "32 15% 9%", "--card-foreground": "32 15% 95%", "--popover": "32 15% 9%", "--popover-foreground": "32 15% 95%", "--primary": "40 90% 55%", "--primary-foreground": "32 15% 9%", "--secondary": "32 10% 15%", "--secondary-foreground": "32 15% 95%", "--muted": "32 10% 15%", "--muted-foreground": "32 10% 60%", "--accent": "32 10% 15%", "--accent-foreground": "32 15% 95%", "--destructive": "0 75% 55%", "--destructive-foreground": "32 15% 95%", "--border": "32 10% 15%", "--input": "32 10% 15%", "--ring": "40 90% 55%" },
  },
  gruvbox: {
    meta: { id: "gruvbox", name: "Gruvbox", author: "morhetz", tags: ["dark", "retro", "warm", "comfortable"], category: "dark", popularity: 80 },
    dark: { "--background": "42 20% 9%", "--foreground": "42 20% 93%", "--card": "42 20% 9%", "--card-foreground": "42 20% 93%", "--popover": "42 20% 9%", "--popover-foreground": "42 20% 93%", "--primary": "40 80% 62%", "--primary-foreground": "42 20% 9%", "--secondary": "42 15% 16%", "--secondary-foreground": "42 20% 93%", "--muted": "42 15% 16%", "--muted-foreground": "42 15% 65%", "--accent": "42 15% 16%", "--accent-foreground": "42 20% 93%", "--destructive": "0 75% 58%", "--destructive-foreground": "42 20% 93%", "--border": "42 15% 16%", "--input": "42 15% 16%", "--ring": "40 80% 62%" },
  },
  "one-dark": {
    meta: { id: "one-dark", name: "One Dark", author: "Atom", tags: ["dark", "blue", "classic", "popular"], category: "dark", popularity: 90 },
    dark: { "--background": "228 20% 11%", "--foreground": "227 30% 93%", "--card": "228 20% 11%", "--card-foreground": "227 30% 93%", "--popover": "228 20% 11%", "--popover-foreground": "227 30% 93%", "--primary": "227 50% 55%", "--primary-foreground": "228 20% 11%", "--secondary": "228 15% 17%", "--secondary-foreground": "227 30% 93%", "--muted": "228 15% 17%", "--muted-foreground": "227 15% 62%", "--accent": "228 15% 17%", "--accent-foreground": "227 30% 93%", "--destructive": "0 70% 55%", "--destructive-foreground": "227 30% 93%", "--border": "228 15% 17%", "--input": "228 15% 17%", "--ring": "227 50% 55%" },
  },
  "github-light": {
    meta: { id: "github-light", name: "GitHub Light", author: "GitHub", tags: ["light", "professional", "clean"], category: "light", popularity: 85 },
    light: { "--background": "210 15% 98%", "--foreground": "215 15% 15%", "--card": "210 15% 98%", "--card-foreground": "215 15% 15%", "--popover": "210 15% 98%", "--popover-foreground": "215 15% 15%", "--primary": "210 60% 55%", "--primary-foreground": "210 15% 98%", "--secondary": "210 10% 93%", "--secondary-foreground": "215 15% 15%", "--muted": "210 10% 93%", "--muted-foreground": "215 8% 50%", "--accent": "210 10% 93%", "--accent-foreground": "215 15% 15%", "--destructive": "0 75% 55%", "--destructive-foreground": "210 15% 98%", "--border": "210 10% 93%", "--input": "210 10% 93%", "--ring": "210 60% 55%" },
  },
} as const;
