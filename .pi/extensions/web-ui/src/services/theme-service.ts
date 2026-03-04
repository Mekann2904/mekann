/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/services/theme-service.ts
 * @role テーマ設定管理サービス
 * @why グローバルテーマの永続化
 * @related routes/theme.ts, schemas/theme.schema.ts
 * @public_api ThemeService
 * @invariants テーマ設定はファイルに保存
 * @side_effects ファイル読み書き
 * @failure_modes ファイルシステムエラー
 *
 * @abdd.explain
 * @overview テーマ設定の読み込み・保存
 * @what_it_does テーマIDとモードの管理
 * @why_it_exists ユーザー設定の永続化
 */

import fs from "fs";
import path from "path";
import type { ThemeSettings } from "../schemas/theme.schema.js";

/**
 * テーマ設定ファイルのパス
 */
const THEME_FILE = path.join(process.cwd(), ".pi", "web-ui-theme.json");

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

    try {
      if (fs.existsSync(THEME_FILE)) {
        const content = fs.readFileSync(THEME_FILE, "utf-8");
        const data = JSON.parse(content);
        this.cachedTheme = {
          themeId: data.themeId || DEFAULT_THEME.themeId,
          mode: data.mode || DEFAULT_THEME.mode,
        };
        return this.cachedTheme;
      }
    } catch (error) {
      console.warn("[theme] Failed to load theme:", error);
    }

    return DEFAULT_THEME;
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

    try {
      // ディレクトリが存在することを確認
      const dir = path.dirname(THEME_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(THEME_FILE, JSON.stringify(updated, null, 2));
      this.cachedTheme = updated;
    } catch (error) {
      console.error("[theme] Failed to save theme:", error);
    }

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
