/**
 * @abdd.meta
 * path: .pi/extensions/web-ui/web/src/theme/registry.ts
 * role: テーマカタログを集約し互換APIを提供する。
 * why: テーマ増加時の管理点を1箇所に固定するため。
 * related: .pi/extensions/web-ui/web/src/theme/base-themes.ts, .pi/extensions/web-ui/web/src/theme/geek-themes.ts, .pi/extensions/web-ui/web/src/theme/runtime.ts
 * public_api: THEMES, DEFAULT_THEME_ID, getThemeOrDefault
 * invariants: DEFAULT_THEME_IDはTHEMESに存在する。
 * side_effects: なし。
 * failure_modes: 未知themeIdはDEFAULT_THEME_IDにフォールバックされる。
 *
 * @abdd.explain
 * overview: テーマ定義のレジストリ層。
 * what_it_does: 既存テーマと追加テーマをマージし、取得関数を提供する。
 * why_it_exists: UIからデータ責務を分離し、今後の拡張を容易にするため。
 * scope(in/out): in=テーマ定義群, out=DOM適用やUI表示
 */

import { BASE_THEMES } from "./base-themes";
import { GEEK_THEMES } from "./geek-themes";
import type { Theme, ThemeCatalog } from "./types";

/** @summary 既定テーマID */
export const DEFAULT_THEME_ID = "blue";

/** @summary 統合テーマ一覧 */
export const THEMES: ThemeCatalog = {
  ...BASE_THEMES,
  ...GEEK_THEMES,
};

/**
 * @summary テーマを取得する
 * @param id テーマID
 * @returns テーマ定義
 */
export function getThemeOrDefault(id: string): Theme {
  return THEMES[id] ?? THEMES[DEFAULT_THEME_ID];
}
