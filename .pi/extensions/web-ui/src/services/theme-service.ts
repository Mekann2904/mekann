/**
 * path: .pi/extensions/web-ui/src/services/theme-service.ts
 * role: テーマ設定を SQLite json_state に保存する
 * why: web-ui のテーマ設定を JSON ではなく SQLite に統一するため
 * related: .pi/extensions/web-ui/src/routes/theme.ts, .pi/lib/storage/sqlite-state-store.ts, .pi/extensions/web-ui/lib/instance-registry.ts
 */

import type { ThemeSettings } from "../schemas/theme.schema.js";
import { readJsonState, writeJsonState } from "../../../../lib/storage/sqlite-state-store.js";

const THEME_STATE_KEY = "webui_theme";

/**
 * デフォルトテーマ設定
 */
const DEFAULT_THEME: ThemeSettings = {
  themeId: "blue",
  mode: "dark",
};

/**
 * テーマサービス
 */
export class ThemeService {
  private cachedTheme: ThemeSettings | null = null;

  /**
   * テーマ設定を取得
   */
  get(): ThemeSettings {
    if (this.cachedTheme) {
      return this.cachedTheme;
    }

    const data = readJsonState<Partial<ThemeSettings>>({
      stateKey: THEME_STATE_KEY,
      createDefault: () => ({ ...DEFAULT_THEME }),
    });
    this.cachedTheme = {
      themeId: data.themeId || DEFAULT_THEME.themeId,
      mode: data.mode || DEFAULT_THEME.mode,
    };
    return this.cachedTheme;
  }

  /**
   * テーマ設定を保存
   */
  set(settings: Partial<ThemeSettings>): ThemeSettings {
    const current = this.get();
    const updated: ThemeSettings = {
      themeId: settings.themeId || current.themeId,
      mode: settings.mode || current.mode,
    };

    writeJsonState({
      stateKey: THEME_STATE_KEY,
      value: updated,
    });
    this.cachedTheme = updated;
    return updated;
  }

  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.cachedTheme = null;
  }
}

/**
 * シングルトン
 */
let instance: ThemeService | null = null;

export function getThemeService(): ThemeService {
  if (!instance) {
    instance = new ThemeService();
  }
  return instance;
}
