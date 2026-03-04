/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/services/index-settings-service.ts
 * @role インデックス設定管理サービス
 * @why LocAgent, RepoGraph, Semanticの有効/無効状態を永続化
 * @related routes/indexes.ts
 * @public_api IndexSettingsService
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

/**
 * インデックス設定
 */
export interface IndexSettings {
  locagent: boolean;
  repograph: boolean;
  semantic: boolean;
}

/**
 * 設定ファイルのパス
 */
function getSettingsPath(cwd: string): string {
  return join(cwd, ".pi/search/index-settings.json");
}

/**
 * デフォルト設定（全て有効）
 */
const DEFAULT_SETTINGS: IndexSettings = {
  locagent: true,
  repograph: true,
  semantic: true,
};

/**
 * 設定ディレクトリを確保
 */
async function ensureSettingsDir(cwd: string): Promise<void> {
  const dir = join(cwd, ".pi/search");
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    // ディレクトリが既に存在する場合は無視
  }
}

/**
 * インデックス設定を読み込み
 */
export async function loadIndexSettings(cwd: string): Promise<IndexSettings> {
  const path = getSettingsPath(cwd);
  
  try {
    const content = await readFile(path, "utf-8");
    const settings = JSON.parse(content) as Partial<IndexSettings>;
    
    // デフォルト値で埋める
    return {
      ...DEFAULT_SETTINGS,
      ...settings,
    };
  } catch {
    // ファイルが存在しない場合はデフォルト設定を返す
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * インデックス設定を保存
 */
export async function saveIndexSettings(
  cwd: string,
  settings: IndexSettings
): Promise<void> {
  await ensureSettingsDir(cwd);
  const path = getSettingsPath(cwd);
  await writeFile(path, JSON.stringify(settings, null, 2), "utf-8");
}

/**
 * 単一インデックスの有効/無効を更新
 */
export async function updateIndexEnabled(
  cwd: string,
  index: keyof IndexSettings,
  enabled: boolean
): Promise<IndexSettings> {
  const settings = await loadIndexSettings(cwd);
  settings[index] = enabled;
  await saveIndexSettings(cwd, settings);
  return settings;
}
