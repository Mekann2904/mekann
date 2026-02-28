/**
 * @abdd.meta
 * path: .pi/extensions/web-ui/web/src/theme/runtime.ts
 * role: テーマをDOMへ適用する処理を提供する。
 * why: テーマ適用ロジックをUIコンポーネントから分離するため。
 * related: .pi/extensions/web-ui/web/src/theme/registry.ts, .pi/extensions/web-ui/web/src/theme/types.ts, .pi/extensions/web-ui/web/src/components/theme-page.tsx
 * public_api: applyThemeToDOM
 * invariants: テーマ適用時にrootのdarkクラスはmodeと一致する。
 * side_effects: document.documentElementのstyle/classListを書き換える。
 * failure_modes: documentが未定義の環境では何もしない。
 *
 * @abdd.explain
 * overview: テーマランタイム層。
 * what_it_does: テーマIDとモードからCSS変数を設定し、darkクラスを同期する。
 * why_it_exists: UIと副作用を分離し、再利用性を高めるため。
 * scope(in/out): in=themeId, mode, out=DOMスタイル更新
 */

import { getThemeOrDefault } from "./registry";
import type { Mode } from "./types";

/**
 * @summary DOMへテーマ反映
 * @param id テーマID
 * @param currentMode 適用モード
 * @returns なし
 */
export function applyThemeToDOM(id: string, currentMode: Mode): void {
  if (typeof document === "undefined") {
    return;
  }

  const theme = getThemeOrDefault(id);
  const resolvedMode = theme[currentMode] ? currentMode : theme.dark ? "dark" : "light";
  const colors = theme[resolvedMode];
  if (!colors) {
    return;
  }

  const root = document.documentElement;
  Object.entries(colors as unknown as Record<string, string>).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  root.classList.toggle("dark", resolvedMode === "dark");
}
