/**
 * @abdd.meta
 * path: .pi/extensions/web-ui/web/src/theme/geek-themes.ts
 * role: ギーク系の追加テーマを定義する。
 * why: プロダクト現場で人気の配色を継続的に増やすため。
 * related: .pi/extensions/web-ui/web/src/theme/base-themes.ts, .pi/extensions/web-ui/web/src/theme/registry.ts, .pi/extensions/web-ui/web/src/components/theme-page.tsx
 * public_api: GEEK_THEMES
 * invariants: 各テーマはlightかdarkのいずれかを持つ。
 * side_effects: なし。
 * failure_modes: 色コントラスト不十分時に可読性が低下する。
 *
 * @abdd.explain
 * overview: 新規追加テーマの定義ファイル。
 * what_it_does: SolarizedやKanagawaなどの実務で使われる配色を提供する。
 * why_it_exists: テーマ拡張を既存テーマ定義から分離し、管理単位を明確化するため。
 * scope(in/out): in=追加テーマ定義, out=テーマ選択UI
 */

import type { ThemeCatalog } from "@/theme/types";

/** @summary ギーク系テーマ一覧 */
export const GEEK_THEMES: ThemeCatalog = {
  "solarized-dark": {
    meta: { id: "solarized-dark", name: "Solarized Dark", author: "Ethan Schoonover", tags: ["dark", "solarized", "terminal", "geek"], category: "dark", popularity: 88 },
    dark: { "--background": "193 100% 11%", "--foreground": "44 87% 94%", "--card": "193 100% 11%", "--card-foreground": "44 87% 94%", "--popover": "193 100% 11%", "--popover-foreground": "44 87% 94%", "--primary": "205 82% 65%", "--primary-foreground": "193 100% 11%", "--secondary": "192 100% 15%", "--secondary-foreground": "44 87% 94%", "--muted": "192 100% 15%", "--muted-foreground": "44 30% 70%", "--accent": "192 100% 15%", "--accent-foreground": "44 87% 94%", "--destructive": "1 71% 52%", "--destructive-foreground": "44 87% 94%", "--border": "192 100% 15%", "--input": "192 100% 15%", "--ring": "205 82% 65%" },
  },
  "solarized-light": {
    meta: { id: "solarized-light", name: "Solarized Light", author: "Ethan Schoonover", tags: ["light", "solarized", "terminal", "geek"], category: "light", popularity: 82 },
    light: { "--background": "44 87% 94%", "--foreground": "193 100% 11%", "--card": "44 87% 94%", "--card-foreground": "193 100% 11%", "--popover": "44 87% 94%", "--popover-foreground": "193 100% 11%", "--primary": "205 82% 55%", "--primary-foreground": "44 87% 94%", "--secondary": "44 50% 88%", "--secondary-foreground": "193 100% 11%", "--muted": "44 50% 88%", "--muted-foreground": "193 35% 35%", "--accent": "44 50% 88%", "--accent-foreground": "193 100% 11%", "--destructive": "1 71% 52%", "--destructive-foreground": "44 87% 94%", "--border": "44 35% 82%", "--input": "44 35% 82%", "--ring": "205 82% 55%" },
  },
  "material-ocean": {
    meta: { id: "material-ocean", name: "Material Ocean", author: "Material Theme", tags: ["dark", "material", "editor", "geek"], category: "dark", popularity: 89 },
    dark: { "--background": "228 21% 20%", "--foreground": "218 24% 92%", "--card": "228 21% 20%", "--card-foreground": "218 24% 92%", "--popover": "228 21% 20%", "--popover-foreground": "218 24% 92%", "--primary": "178 100% 44%", "--primary-foreground": "228 21% 20%", "--secondary": "228 19% 27%", "--secondary-foreground": "218 24% 92%", "--muted": "228 19% 27%", "--muted-foreground": "218 12% 65%", "--accent": "228 19% 27%", "--accent-foreground": "218 24% 92%", "--destructive": "2 66% 59%", "--destructive-foreground": "218 24% 92%", "--border": "228 19% 27%", "--input": "228 19% 27%", "--ring": "178 100% 44%" },
  },
  "kanagawa-wave": {
    meta: { id: "kanagawa-wave", name: "Kanagawa Wave", author: "rebelot", tags: ["dark", "japanese", "vim", "geek"], category: "dark", popularity: 86 },
    dark: { "--background": "235 24% 12%", "--foreground": "45 30% 88%", "--card": "235 24% 12%", "--card-foreground": "45 30% 88%", "--popover": "235 24% 12%", "--popover-foreground": "45 30% 88%", "--primary": "205 43% 58%", "--primary-foreground": "235 24% 12%", "--secondary": "235 17% 20%", "--secondary-foreground": "45 30% 88%", "--muted": "235 17% 20%", "--muted-foreground": "45 16% 62%", "--accent": "235 17% 20%", "--accent-foreground": "45 30% 88%", "--destructive": "1 54% 61%", "--destructive-foreground": "45 30% 88%", "--border": "235 17% 20%", "--input": "235 17% 20%", "--ring": "205 43% 58%" },
  },
  "ayu-mirage": {
    meta: { id: "ayu-mirage", name: "Ayu Mirage", author: "Ayu", tags: ["dark", "ayu", "editor", "geek"], category: "dark", popularity: 84 },
    dark: { "--background": "219 27% 17%", "--foreground": "42 48% 91%", "--card": "219 27% 17%", "--card-foreground": "42 48% 91%", "--popover": "219 27% 17%", "--popover-foreground": "42 48% 91%", "--primary": "35 100% 68%", "--primary-foreground": "219 27% 17%", "--secondary": "219 21% 24%", "--secondary-foreground": "42 48% 91%", "--muted": "219 21% 24%", "--muted-foreground": "42 18% 66%", "--accent": "219 21% 24%", "--accent-foreground": "42 48% 91%", "--destructive": "3 78% 60%", "--destructive-foreground": "42 48% 91%", "--border": "219 21% 24%", "--input": "219 21% 24%", "--ring": "35 100% 68%" },
  },
  "night-owl": {
    meta: { id: "night-owl", name: "Night Owl", author: "Sarah Drasner", tags: ["dark", "high-contrast", "editor", "geek"], category: "dark", popularity: 91 },
    dark: { "--background": "224 38% 12%", "--foreground": "216 100% 94%", "--card": "224 38% 12%", "--card-foreground": "216 100% 94%", "--popover": "224 38% 12%", "--popover-foreground": "216 100% 94%", "--primary": "188 100% 45%", "--primary-foreground": "224 38% 12%", "--secondary": "224 30% 18%", "--secondary-foreground": "216 100% 94%", "--muted": "224 30% 18%", "--muted-foreground": "216 45% 72%", "--accent": "224 30% 18%", "--accent-foreground": "216 100% 94%", "--destructive": "5 81% 65%", "--destructive-foreground": "216 100% 94%", "--border": "224 30% 18%", "--input": "224 30% 18%", "--ring": "188 100% 45%" },
  },

  "everforest-dark": {
    meta: { id: "everforest-dark", name: "Everforest Dark", author: "sainnhe", tags: ["dark", "forest", "vim", "geek"], category: "dark", popularity: 83 },
    dark: { "--background": "120 8% 16%", "--foreground": "102 17% 82%", "--card": "120 8% 16%", "--card-foreground": "102 17% 82%", "--popover": "120 8% 16%", "--popover-foreground": "102 17% 82%", "--primary": "39 53% 68%", "--primary-foreground": "120 8% 16%", "--secondary": "120 8% 22%", "--secondary-foreground": "102 17% 82%", "--muted": "120 8% 22%", "--muted-foreground": "102 10% 63%", "--accent": "120 8% 22%", "--accent-foreground": "102 17% 82%", "--destructive": "8 65% 60%", "--destructive-foreground": "102 17% 82%", "--border": "120 8% 22%", "--input": "120 8% 22%", "--ring": "39 53% 68%" },
  },
  "everforest-light": {
    meta: { id: "everforest-light", name: "Everforest Light", author: "sainnhe", tags: ["light", "forest", "vim", "geek"], category: "light", popularity: 74 },
    light: { "--background": "52 28% 92%", "--foreground": "120 8% 26%", "--card": "52 28% 92%", "--card-foreground": "120 8% 26%", "--popover": "52 28% 92%", "--popover-foreground": "120 8% 26%", "--primary": "39 53% 45%", "--primary-foreground": "52 28% 92%", "--secondary": "52 18% 84%", "--secondary-foreground": "120 8% 26%", "--muted": "52 18% 84%", "--muted-foreground": "120 8% 40%", "--accent": "52 18% 84%", "--accent-foreground": "120 8% 26%", "--destructive": "8 65% 50%", "--destructive-foreground": "52 28% 92%", "--border": "52 14% 76%", "--input": "52 14% 76%", "--ring": "39 53% 45%" },
  },
  palenight: {
    meta: { id: "palenight", name: "Palenight", author: "Material Theme", tags: ["dark", "purple", "material", "geek"], category: "dark", popularity: 87 },
    dark: { "--background": "231 15% 18%", "--foreground": "225 30% 91%", "--card": "231 15% 18%", "--card-foreground": "225 30% 91%", "--popover": "231 15% 18%", "--popover-foreground": "225 30% 91%", "--primary": "262 84% 74%", "--primary-foreground": "231 15% 18%", "--secondary": "231 15% 24%", "--secondary-foreground": "225 30% 91%", "--muted": "231 15% 24%", "--muted-foreground": "225 17% 70%", "--accent": "231 15% 24%", "--accent-foreground": "225 30% 91%", "--destructive": "2 72% 63%", "--destructive-foreground": "225 30% 91%", "--border": "231 15% 24%", "--input": "231 15% 24%", "--ring": "262 84% 74%" },
  },
  poimandres: {
    meta: { id: "poimandres", name: "Poimandres", author: "drcmda", tags: ["dark", "cyan", "editor", "geek"], category: "dark", popularity: 79 },
    dark: { "--background": "221 34% 14%", "--foreground": "204 55% 86%", "--card": "221 34% 14%", "--card-foreground": "204 55% 86%", "--popover": "221 34% 14%", "--popover-foreground": "204 55% 86%", "--primary": "193 95% 68%", "--primary-foreground": "221 34% 14%", "--secondary": "221 26% 21%", "--secondary-foreground": "204 55% 86%", "--muted": "221 26% 21%", "--muted-foreground": "204 25% 66%", "--accent": "221 26% 21%", "--accent-foreground": "204 55% 86%", "--destructive": "0 84% 67%", "--destructive-foreground": "204 55% 86%", "--border": "221 26% 21%", "--input": "221 26% 21%", "--ring": "193 95% 68%" },
  },
  "rose-pine": {
    meta: { id: "rose-pine", name: "Rosé Pine", author: "rose-pine", tags: ["dark", "rose", "calm", "geek"], category: "dark", popularity: 92 },
    dark: { "--background": "249 22% 18%", "--foreground": "245 50% 91%", "--card": "249 22% 18%", "--card-foreground": "245 50% 91%", "--popover": "249 22% 18%", "--popover-foreground": "245 50% 91%", "--primary": "343 76% 79%", "--primary-foreground": "249 22% 18%", "--secondary": "249 18% 24%", "--secondary-foreground": "245 50% 91%", "--muted": "249 18% 24%", "--muted-foreground": "245 20% 72%", "--accent": "249 18% 24%", "--accent-foreground": "245 50% 91%", "--destructive": "2 69% 68%", "--destructive-foreground": "245 50% 91%", "--border": "249 18% 24%", "--input": "249 18% 24%", "--ring": "343 76% 79%" },
  },
  "rose-pine-dawn": {
    meta: { id: "rose-pine-dawn", name: "Rosé Pine Dawn", author: "rose-pine", tags: ["light", "rose", "calm", "geek"], category: "light", popularity: 80 },
    light: { "--background": "32 56% 95%", "--foreground": "249 20% 29%", "--card": "32 56% 95%", "--card-foreground": "249 20% 29%", "--popover": "32 56% 95%", "--popover-foreground": "249 20% 29%", "--primary": "267 33% 56%", "--primary-foreground": "32 56% 95%", "--secondary": "32 30% 88%", "--secondary-foreground": "249 20% 29%", "--muted": "32 30% 88%", "--muted-foreground": "249 13% 47%", "--accent": "32 30% 88%", "--accent-foreground": "249 20% 29%", "--destructive": "2 69% 52%", "--destructive-foreground": "32 56% 95%", "--border": "32 22% 80%", "--input": "32 22% 80%", "--ring": "267 33% 56%" },
  },
  "synthwave-84": {
    meta: { id: "synthwave-84", name: "Synthwave '84", author: "Robb Owen", tags: ["dark", "neon", "retro", "geek"], category: "dark", popularity: 86 },
    dark: { "--background": "266 39% 14%", "--foreground": "197 100% 96%", "--card": "266 39% 14%", "--card-foreground": "197 100% 96%", "--popover": "266 39% 14%", "--popover-foreground": "197 100% 96%", "--primary": "316 100% 64%", "--primary-foreground": "266 39% 14%", "--secondary": "266 32% 20%", "--secondary-foreground": "197 100% 96%", "--muted": "266 32% 20%", "--muted-foreground": "197 36% 72%", "--accent": "266 32% 20%", "--accent-foreground": "197 100% 96%", "--destructive": "358 100% 69%", "--destructive-foreground": "197 100% 96%", "--border": "266 32% 20%", "--input": "266 32% 20%", "--ring": "316 100% 64%" },
  },
  "vscode-dark-plus": {
    meta: { id: "vscode-dark-plus", name: "VS Code Dark+", author: "Microsoft", tags: ["dark", "vscode", "default", "geek"], category: "dark", popularity: 94 },
    dark: { "--background": "220 14% 10%", "--foreground": "0 0% 86%", "--card": "220 14% 10%", "--card-foreground": "0 0% 86%", "--popover": "220 14% 10%", "--popover-foreground": "0 0% 86%", "--primary": "211 100% 67%", "--primary-foreground": "220 14% 10%", "--secondary": "220 12% 16%", "--secondary-foreground": "0 0% 86%", "--muted": "220 12% 16%", "--muted-foreground": "0 0% 65%", "--accent": "220 12% 16%", "--accent-foreground": "0 0% 86%", "--destructive": "5 82% 64%", "--destructive-foreground": "0 0% 86%", "--border": "220 12% 16%", "--input": "220 12% 16%", "--ring": "211 100% 67%" },
  },
  "tomorrow-night": {
    meta: { id: "tomorrow-night", name: "Tomorrow Night", author: "Chris Kempson", tags: ["dark", "minimal", "classic", "geek"], category: "dark", popularity: 77 },
    dark: { "--background": "220 13% 18%", "--foreground": "0 0% 86%", "--card": "220 13% 18%", "--card-foreground": "0 0% 86%", "--popover": "220 13% 18%", "--popover-foreground": "0 0% 86%", "--primary": "207 82% 66%", "--primary-foreground": "220 13% 18%", "--secondary": "220 12% 24%", "--secondary-foreground": "0 0% 86%", "--muted": "220 12% 24%", "--muted-foreground": "0 0% 64%", "--accent": "220 12% 24%", "--accent-foreground": "0 0% 86%", "--destructive": "3 65% 64%", "--destructive-foreground": "0 0% 86%", "--border": "220 12% 24%", "--input": "220 12% 24%", "--ring": "207 82% 66%" },
  },
  "gruvbox-light": {
    meta: { id: "gruvbox-light", name: "Gruvbox Light", author: "morhetz", tags: ["light", "retro", "warm", "geek"], category: "light", popularity: 78 },
    light: { "--background": "48 62% 88%", "--foreground": "24 18% 22%", "--card": "48 62% 88%", "--card-foreground": "24 18% 22%", "--popover": "48 62% 88%", "--popover-foreground": "24 18% 22%", "--primary": "24 72% 44%", "--primary-foreground": "48 62% 88%", "--secondary": "48 37% 80%", "--secondary-foreground": "24 18% 22%", "--muted": "48 37% 80%", "--muted-foreground": "24 12% 40%", "--accent": "48 37% 80%", "--accent-foreground": "24 18% 22%", "--destructive": "5 66% 48%", "--destructive-foreground": "48 62% 88%", "--border": "48 25% 72%", "--input": "48 25% 72%", "--ring": "24 72% 44%" },
  },

  "catppuccin-latte": {
    meta: { id: "catppuccin-latte", name: "Catppuccin Latte", author: "Catppuccin", tags: ["light", "pastel", "catppuccin", "geek"], category: "light", popularity: 92 },
    light: { "--background": "50 45% 95%", "--foreground": "234 16% 35%", "--card": "50 45% 95%", "--card-foreground": "234 16% 35%", "--popover": "50 45% 95%", "--popover-foreground": "234 16% 35%", "--primary": "267 84% 68%", "--primary-foreground": "50 45% 95%", "--secondary": "50 26% 88%", "--secondary-foreground": "234 16% 35%", "--muted": "50 22% 84%", "--muted-foreground": "234 16% 65%", "--accent": "50 26% 88%", "--accent-foreground": "234 16% 35%", "--destructive": "3 72% 58%", "--destructive-foreground": "234 16% 35%", "--border": "50 26% 88%", "--input": "50 26% 88%", "--ring": "267 84% 68%" },
  },
  "catppuccin-frappe": {
    meta: { id: "catppuccin-frappe", name: "Catppuccin Frappé", author: "Catppuccin", tags: ["dark", "pastel", "catppuccin", "geek"], category: "dark", popularity: 88 },
    dark: { "--background": "229 19% 23%", "--foreground": "227 70% 87%", "--card": "229 19% 23%", "--card-foreground": "227 70% 87%", "--popover": "229 19% 23%", "--popover-foreground": "227 70% 87%", "--primary": "267 59% 76%", "--primary-foreground": "229 19% 23%", "--secondary": "229 16% 30%", "--secondary-foreground": "227 70% 87%", "--muted": "229 13% 34%", "--muted-foreground": "227 70% 65%", "--accent": "229 16% 30%", "--accent-foreground": "227 70% 87%", "--destructive": "3 70% 64%", "--destructive-foreground": "227 70% 87%", "--border": "229 16% 30%", "--input": "229 16% 30%", "--ring": "267 59% 76%" },
  },
  "catppuccin-macchiato": {
    meta: { id: "catppuccin-macchiato", name: "Catppuccin Macchiato", author: "Catppuccin", tags: ["dark", "pastel", "catppuccin", "geek"], category: "dark", popularity: 90 },
    dark: { "--background": "232 23% 18%", "--foreground": "227 70% 88%", "--card": "232 23% 18%", "--card-foreground": "227 70% 88%", "--popover": "232 23% 18%", "--popover-foreground": "227 70% 88%", "--primary": "267 83% 80%", "--primary-foreground": "232 23% 18%", "--secondary": "232 18% 24%", "--secondary-foreground": "227 70% 88%", "--muted": "232 14% 30%", "--muted-foreground": "227 70% 65%", "--accent": "232 18% 24%", "--accent-foreground": "227 70% 88%", "--destructive": "3 70% 65%", "--destructive-foreground": "227 70% 88%", "--border": "232 18% 24%", "--input": "232 18% 24%", "--ring": "267 83% 80%" },
  },
  "tokyo-night-storm": {
    meta: { id: "tokyo-night-storm", name: "Tokyo Night Storm", author: "Enkia", tags: ["dark", "tokyo-night", "editor", "geek"], category: "dark", popularity: 87 },
    dark: { "--background": "235 24% 15%", "--foreground": "227 30% 92%", "--card": "235 24% 15%", "--card-foreground": "227 30% 92%", "--popover": "235 24% 15%", "--popover-foreground": "227 30% 92%", "--primary": "225 65% 66%", "--primary-foreground": "235 24% 15%", "--secondary": "235 18% 21%", "--secondary-foreground": "227 30% 92%", "--muted": "235 14% 28%", "--muted-foreground": "227 30% 65%", "--accent": "235 18% 21%", "--accent-foreground": "227 30% 92%", "--destructive": "0 75% 62%", "--destructive-foreground": "227 30% 92%", "--border": "235 18% 21%", "--input": "235 18% 21%", "--ring": "225 65% 66%" },
  },
  "tokyo-night-moon": {
    meta: { id: "tokyo-night-moon", name: "Tokyo Night Moon", author: "Enkia", tags: ["dark", "tokyo-night", "editor", "geek"], category: "dark", popularity: 85 },
    dark: { "--background": "229 26% 12%", "--foreground": "227 33% 92%", "--card": "229 26% 12%", "--card-foreground": "227 33% 92%", "--popover": "229 26% 12%", "--popover-foreground": "227 33% 92%", "--primary": "224 72% 67%", "--primary-foreground": "229 26% 12%", "--secondary": "229 20% 19%", "--secondary-foreground": "227 33% 92%", "--muted": "229 16% 25%", "--muted-foreground": "227 33% 65%", "--accent": "229 20% 19%", "--accent-foreground": "227 33% 92%", "--destructive": "0 75% 62%", "--destructive-foreground": "227 33% 92%", "--border": "229 20% 19%", "--input": "229 20% 19%", "--ring": "224 72% 67%" },
  },
  "tokyo-night-day": {
    meta: { id: "tokyo-night-day", name: "Tokyo Night Day", author: "Enkia", tags: ["light", "tokyo-night", "editor", "geek"], category: "light", popularity: 80 },
    light: { "--background": "210 33% 96%", "--foreground": "222 24% 24%", "--card": "210 33% 96%", "--card-foreground": "222 24% 24%", "--popover": "210 33% 96%", "--popover-foreground": "222 24% 24%", "--primary": "225 72% 54%", "--primary-foreground": "210 33% 96%", "--secondary": "210 24% 90%", "--secondary-foreground": "222 24% 24%", "--muted": "210 18% 84%", "--muted-foreground": "222 24% 65%", "--accent": "210 24% 90%", "--accent-foreground": "222 24% 24%", "--destructive": "0 75% 56%", "--destructive-foreground": "222 24% 24%", "--border": "210 24% 90%", "--input": "210 24% 90%", "--ring": "225 72% 54%" },
  },
  "nord-light": {
    meta: { id: "nord-light", name: "Nord Light", author: "Arctic Ice Studio", tags: ["light", "nord", "cold", "geek"], category: "light", popularity: 76 },
    light: { "--background": "220 30% 96%", "--foreground": "220 16% 28%", "--card": "220 30% 96%", "--card-foreground": "220 16% 28%", "--popover": "220 30% 96%", "--popover-foreground": "220 16% 28%", "--primary": "213 38% 52%", "--primary-foreground": "220 30% 96%", "--secondary": "220 20% 90%", "--secondary-foreground": "220 16% 28%", "--muted": "220 16% 84%", "--muted-foreground": "220 16% 65%", "--accent": "220 20% 90%", "--accent-foreground": "220 16% 28%", "--destructive": "0 62% 52%", "--destructive-foreground": "220 16% 28%", "--border": "220 20% 90%", "--input": "220 20% 90%", "--ring": "213 38% 52%" },
  },
  "github-dimmed": {
    meta: { id: "github-dimmed", name: "GitHub Dimmed", author: "GitHub", tags: ["dark", "github", "professional", "geek"], category: "dark", popularity: 86 },
    dark: { "--background": "218 24% 14%", "--foreground": "210 17% 90%", "--card": "218 24% 14%", "--card-foreground": "210 17% 90%", "--popover": "218 24% 14%", "--popover-foreground": "210 17% 90%", "--primary": "212 92% 62%", "--primary-foreground": "218 24% 14%", "--secondary": "218 18% 20%", "--secondary-foreground": "210 17% 90%", "--muted": "218 15% 26%", "--muted-foreground": "210 17% 65%", "--accent": "218 18% 20%", "--accent-foreground": "210 17% 90%", "--destructive": "0 75% 64%", "--destructive-foreground": "210 17% 90%", "--border": "218 18% 20%", "--input": "218 18% 20%", "--ring": "212 92% 62%" },
  },
  "one-light": {
    meta: { id: "one-light", name: "One Light", author: "Atom", tags: ["light", "atom", "classic", "geek"], category: "light", popularity: 84 },
    light: { "--background": "40 25% 97%", "--foreground": "230 12% 25%", "--card": "40 25% 97%", "--card-foreground": "230 12% 25%", "--popover": "40 25% 97%", "--popover-foreground": "230 12% 25%", "--primary": "221 68% 55%", "--primary-foreground": "40 25% 97%", "--secondary": "40 18% 90%", "--secondary-foreground": "230 12% 25%", "--muted": "40 14% 84%", "--muted-foreground": "230 12% 65%", "--accent": "40 18% 90%", "--accent-foreground": "230 12% 25%", "--destructive": "0 72% 56%", "--destructive-foreground": "230 12% 25%", "--border": "40 18% 90%", "--input": "40 18% 90%", "--ring": "221 68% 55%" },
  },
  "ayu-dark": {
    meta: { id: "ayu-dark", name: "Ayu Dark", author: "Ayu", tags: ["dark", "ayu", "editor", "geek"], category: "dark", popularity: 82 },
    dark: { "--background": "220 28% 14%", "--foreground": "43 52% 91%", "--card": "220 28% 14%", "--card-foreground": "43 52% 91%", "--popover": "220 28% 14%", "--popover-foreground": "43 52% 91%", "--primary": "35 100% 66%", "--primary-foreground": "220 28% 14%", "--secondary": "220 22% 20%", "--secondary-foreground": "43 52% 91%", "--muted": "220 18% 26%", "--muted-foreground": "43 52% 65%", "--accent": "220 22% 20%", "--accent-foreground": "43 52% 91%", "--destructive": "4 80% 64%", "--destructive-foreground": "43 52% 91%", "--border": "220 22% 20%", "--input": "220 22% 20%", "--ring": "35 100% 66%" },
  },
  "ayu-light": {
    meta: { id: "ayu-light", name: "Ayu Light", author: "Ayu", tags: ["light", "ayu", "editor", "geek"], category: "light", popularity: 75 },
    light: { "--background": "44 60% 95%", "--foreground": "222 14% 24%", "--card": "44 60% 95%", "--card-foreground": "222 14% 24%", "--popover": "44 60% 95%", "--popover-foreground": "222 14% 24%", "--primary": "36 93% 52%", "--primary-foreground": "44 60% 95%", "--secondary": "44 38% 88%", "--secondary-foreground": "222 14% 24%", "--muted": "44 28% 82%", "--muted-foreground": "222 14% 65%", "--accent": "44 38% 88%", "--accent-foreground": "222 14% 24%", "--destructive": "4 80% 56%", "--destructive-foreground": "222 14% 24%", "--border": "44 38% 88%", "--input": "44 38% 88%", "--ring": "36 93% 52%" },
  },
  "darcula": {
    meta: { id: "darcula", name: "Darcula", author: "JetBrains", tags: ["dark", "jetbrains", "classic", "geek"], category: "dark", popularity: 90 },
    dark: { "--background": "230 8% 18%", "--foreground": "210 10% 86%", "--card": "230 8% 18%", "--card-foreground": "210 10% 86%", "--popover": "230 8% 18%", "--popover-foreground": "210 10% 86%", "--primary": "207 65% 61%", "--primary-foreground": "230 8% 18%", "--secondary": "230 7% 24%", "--secondary-foreground": "210 10% 86%", "--muted": "230 7% 30%", "--muted-foreground": "210 10% 65%", "--accent": "230 7% 24%", "--accent-foreground": "210 10% 86%", "--destructive": "0 68% 62%", "--destructive-foreground": "210 10% 86%", "--border": "230 7% 24%", "--input": "230 7% 24%", "--ring": "207 65% 61%" },
  },
  "cobalt2": {
    meta: { id: "cobalt2", name: "Cobalt2", author: "Wes Bos", tags: ["dark", "blue", "vscode", "geek"], category: "dark", popularity: 81 },
    dark: { "--background": "220 70% 18%", "--foreground": "48 100% 86%", "--card": "220 70% 18%", "--card-foreground": "48 100% 86%", "--popover": "220 70% 18%", "--popover-foreground": "48 100% 86%", "--primary": "44 100% 56%", "--primary-foreground": "220 70% 18%", "--secondary": "220 55% 25%", "--secondary-foreground": "48 100% 86%", "--muted": "220 45% 31%", "--muted-foreground": "48 100% 65%", "--accent": "220 55% 25%", "--accent-foreground": "48 100% 86%", "--destructive": "0 90% 62%", "--destructive-foreground": "48 100% 86%", "--border": "220 55% 25%", "--input": "220 55% 25%", "--ring": "44 100% 56%" },
  },
  "cyberpunk": {
    meta: { id: "cyberpunk", name: "Cyberpunk", author: "Community", tags: ["dark", "neon", "cyberpunk", "geek"], category: "dark", popularity: 83 },
    dark: { "--background": "278 45% 11%", "--foreground": "186 100% 90%", "--card": "278 45% 11%", "--card-foreground": "186 100% 90%", "--popover": "278 45% 11%", "--popover-foreground": "186 100% 90%", "--primary": "317 100% 62%", "--primary-foreground": "278 45% 11%", "--secondary": "278 35% 18%", "--secondary-foreground": "186 100% 90%", "--muted": "278 28% 24%", "--muted-foreground": "186 100% 65%", "--accent": "278 35% 18%", "--accent-foreground": "186 100% 90%", "--destructive": "355 100% 67%", "--destructive-foreground": "186 100% 90%", "--border": "278 35% 18%", "--input": "278 35% 18%", "--ring": "317 100% 62%" },
  },
  "horizon": {
    meta: { id: "horizon", name: "Horizon", author: "Javier Arregui", tags: ["dark", "warm", "editor", "geek"], category: "dark", popularity: 78 },
    dark: { "--background": "250 30% 16%", "--foreground": "40 60% 90%", "--card": "250 30% 16%", "--card-foreground": "40 60% 90%", "--popover": "250 30% 16%", "--popover-foreground": "40 60% 90%", "--primary": "14 76% 66%", "--primary-foreground": "250 30% 16%", "--secondary": "250 22% 22%", "--secondary-foreground": "40 60% 90%", "--muted": "250 18% 28%", "--muted-foreground": "40 60% 65%", "--accent": "250 22% 22%", "--accent-foreground": "40 60% 90%", "--destructive": "355 78% 68%", "--destructive-foreground": "40 60% 90%", "--border": "250 22% 22%", "--input": "250 22% 22%", "--ring": "14 76% 66%" },
  },
  "horizon-light": {
    meta: { id: "horizon-light", name: "Horizon Light", author: "Javier Arregui", tags: ["light", "warm", "editor", "geek"], category: "light", popularity: 72 },
    light: { "--background": "44 55% 95%", "--foreground": "250 16% 28%", "--card": "44 55% 95%", "--card-foreground": "250 16% 28%", "--popover": "44 55% 95%", "--popover-foreground": "250 16% 28%", "--primary": "14 74% 54%", "--primary-foreground": "44 55% 95%", "--secondary": "44 30% 88%", "--secondary-foreground": "250 16% 28%", "--muted": "44 24% 82%", "--muted-foreground": "250 16% 65%", "--accent": "44 30% 88%", "--accent-foreground": "250 16% 28%", "--destructive": "355 70% 56%", "--destructive-foreground": "250 16% 28%", "--border": "44 30% 88%", "--input": "44 30% 88%", "--ring": "14 74% 54%" },
  },
  "papercolor-light": {
    meta: { id: "papercolor-light", name: "PaperColor Light", author: "Community", tags: ["light", "terminal", "minimal", "geek"], category: "light", popularity: 70 },
    light: { "--background": "50 35% 96%", "--foreground": "220 14% 26%", "--card": "50 35% 96%", "--card-foreground": "220 14% 26%", "--popover": "50 35% 96%", "--popover-foreground": "220 14% 26%", "--primary": "210 72% 52%", "--primary-foreground": "50 35% 96%", "--secondary": "50 20% 89%", "--secondary-foreground": "220 14% 26%", "--muted": "50 16% 83%", "--muted-foreground": "220 14% 65%", "--accent": "50 20% 89%", "--accent-foreground": "220 14% 26%", "--destructive": "2 70% 54%", "--destructive-foreground": "220 14% 26%", "--border": "50 20% 89%", "--input": "50 20% 89%", "--ring": "210 72% 52%" },
  },
  "edge-dark": {
    meta: { id: "edge-dark", name: "Edge Dark", author: "sainnhe", tags: ["dark", "forest", "vim", "geek"], category: "dark", popularity: 79 },
    dark: { "--background": "120 9% 15%", "--foreground": "120 18% 84%", "--card": "120 9% 15%", "--card-foreground": "120 18% 84%", "--popover": "120 9% 15%", "--popover-foreground": "120 18% 84%", "--primary": "156 36% 55%", "--primary-foreground": "120 9% 15%", "--secondary": "120 8% 21%", "--secondary-foreground": "120 18% 84%", "--muted": "120 8% 27%", "--muted-foreground": "120 18% 65%", "--accent": "120 8% 21%", "--accent-foreground": "120 18% 84%", "--destructive": "5 72% 62%", "--destructive-foreground": "120 18% 84%", "--border": "120 8% 21%", "--input": "120 8% 21%", "--ring": "156 36% 55%" },
  },
  "edge-light": {
    meta: { id: "edge-light", name: "Edge Light", author: "sainnhe", tags: ["light", "forest", "vim", "geek"], category: "light", popularity: 71 },
    light: { "--background": "52 38% 94%", "--foreground": "120 10% 28%", "--card": "52 38% 94%", "--card-foreground": "120 10% 28%", "--popover": "52 38% 94%", "--popover-foreground": "120 10% 28%", "--primary": "156 36% 42%", "--primary-foreground": "52 38% 94%", "--secondary": "52 24% 87%", "--secondary-foreground": "120 10% 28%", "--muted": "52 18% 81%", "--muted-foreground": "120 10% 65%", "--accent": "52 24% 87%", "--accent-foreground": "120 10% 28%", "--destructive": "5 70% 54%", "--destructive-foreground": "120 10% 28%", "--border": "52 24% 87%", "--input": "52 24% 87%", "--ring": "156 36% 42%" },
  },
  "oxocarbon": {
    meta: { id: "oxocarbon", name: "Oxocarbon", author: "IBM", tags: ["dark", "ibm", "carbon", "geek"], category: "dark", popularity: 88 },
    dark: { "--background": "210 24% 12%", "--foreground": "210 24% 90%", "--card": "210 24% 12%", "--card-foreground": "210 24% 90%", "--popover": "210 24% 12%", "--popover-foreground": "210 24% 90%", "--primary": "195 100% 58%", "--primary-foreground": "210 24% 12%", "--secondary": "210 20% 18%", "--secondary-foreground": "210 24% 90%", "--muted": "210 16% 24%", "--muted-foreground": "210 24% 65%", "--accent": "210 20% 18%", "--accent-foreground": "210 24% 90%", "--destructive": "2 81% 64%", "--destructive-foreground": "210 24% 90%", "--border": "210 20% 18%", "--input": "210 20% 18%", "--ring": "195 100% 58%" },
  },


};
