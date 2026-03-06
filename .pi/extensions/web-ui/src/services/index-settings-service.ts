/**
 * .pi/extensions/web-ui/src/services/index-settings-service.ts
 * インデックス設定を SQLite json_state に保存する。
 * 旧 index-settings.json から一度だけ移行し、その後は SQLite を唯一の保存先にする。
 * 関連ファイル: .pi/extensions/web-ui/src/routes/indexes.ts, .pi/lib/storage/sqlite-state-store.ts, .pi/lib/storage/state-keys.ts
 */

import { join } from "node:path";
import { readJsonState, writeJsonState } from "../../../../lib/storage/sqlite-state-store.js";
import { getIndexSettingsStateKey } from "../../../../lib/storage/state-keys.js";

/**
 * インデックス設定
 */
export interface IndexSettings {
  locagent: boolean;
  repograph: boolean;
  semantic: boolean;
}

function getLegacySettingsPath(cwd: string): string {
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

function normalizeSettings(settings: Partial<IndexSettings> | null | undefined): IndexSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
  };
}

/**
 * インデックス設定を読み込み
 */
export async function loadIndexSettings(cwd: string): Promise<IndexSettings> {
  const settings = readJsonState<IndexSettings>({
    stateKey: getIndexSettingsStateKey(cwd),
    fallbackPath: getLegacySettingsPath(cwd),
    createDefault: () => ({ ...DEFAULT_SETTINGS }),
  });
  return normalizeSettings(settings);
}

/**
 * インデックス設定を保存
 */
export async function saveIndexSettings(
  cwd: string,
  settings: IndexSettings
): Promise<void> {
  writeJsonState({
    stateKey: getIndexSettingsStateKey(cwd),
    value: normalizeSettings(settings),
  });
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
