/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/communication-config.ts
 * role: 機能フラグ定義および環境変数からの設定取得
 * why: コミュニケーション機能の各サブ機能（リンク、コンテキスト、参照、終了）の有効/無効を環境変数で切り替えるため
 * related: .pi/extensions/agent-teams/index.ts, .pi/extensions/agent-teams/communication-handler.ts
 * public_api: CommunicationConfig, getCommunicationConfig, isCommunicationV2Enabled
 * invariants: getCommunicationConfigは4つのプロパティを持つオブジェクトを返す, parseEnvBoolは文字列"1"または"true"のみをtrueと判定する
 * side_effects: process.envの参照
 * failure_modes: 環境変数に"1"または"true"以外の文字列が設定されている場合はfalseと判定される, 環境変数が未定義の場合はDEFAULTSの値が使用される
 * @abdd.explain
 * overview: コミュニケーション機能に関する機能フラグ（TypeScriptインターフェース）と、それらを環境変数から解決する関数群を定義するモジュール
 * what_it_does:
 *   - 環境変数の値（"1"/"true"）をパースしてboolean値を取得する
 *   - 各機能フラグの現在の設定状態をCommunicationConfigオブジェクトとして返す
 *   - いずれかのV2/V3系フラグが有効かどうかを判定する
 * why_it_exists:
 *   - リリース段階や環境ごとの挙動の差異を、コード変更なく環境変数のみで制御するため
 *   - 個別の機能スイッチと、包括的な有効判定（isCommunicationV2Enabled）を提供するため
 * scope:
 *   in: process.env（環境変数）
 *   out: CommunicationConfigオブジェクト, boolean判定結果
 */

/**
 * コミュニケーション機能の設定
 * @summary 機能フラグ設定
 */
export interface CommunicationConfig {
  linksV2: boolean;
  contextV2: boolean;
  referencesV3: boolean;
  terminationV2: boolean;
}

const DEFAULTS: CommunicationConfig = {
  linksV2: true,
  contextV2: true,
  referencesV3: true,
  terminationV2: true,
};

/**
 * コミュニケーション設定を取得する
 * @summary 設定を環境変数から取得
 * @returns 現在のコミュニケーション設定
 */
export function getCommunicationConfig(): CommunicationConfig {
  return {
    linksV2: parseEnvBool("PI_COMMUNICATION_LINKS_V2", DEFAULTS.linksV2),
    contextV2: parseEnvBool("PI_COMMUNICATION_CONTEXT_V2", DEFAULTS.contextV2),
    referencesV3: parseEnvBool("PI_COMMUNICATION_REFERENCES_V3", DEFAULTS.referencesV3),
    terminationV2: parseEnvBool("PI_COMMUNICATION_TERMINATION_V2", DEFAULTS.terminationV2),
  };
}

function parseEnvBool(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

/**
 * コミュニケーションV2有効判定
 * @summary V2有効判定
 * @returns 有効であればtrue
 */
export function isCommunicationV2Enabled(): boolean {
  const config = getCommunicationConfig();
  return config.linksV2 || config.contextV2 || config.referencesV3 || config.terminationV2;
}
