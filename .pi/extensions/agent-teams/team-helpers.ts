/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/team-helpers.ts
 * role: エージェントチームの選択ロジックを提供するユーティリティモジュール
 * why: 実行対象のチームを特定するための判定処理を共通化し、単一のチーム実行と並列実行の両方をサポートするため
 * related: ./storage.ts
 * public_api: pickTeam, pickDefaultParallelTeams
 * invariants: 出力されるチームは必ずenabledが"enabled"である状態を持つ
 * side_effects: process.env.PI_AGENT_TEAM_PARALLEL_DEFAULTの読み取り（環境変数への書き込みは行わない）
 * failure_modes: 有効なチームが存在しない場合、空配列またはundefinedを返す；環境変数の設定次第で戻り値の内容が変化する
 * @abdd.explain
 * overview: ストレージ内のチーム定義に対し、ID指定や環境変数に基づいたフィルタリングと選択を行う
 * what_it_does:
 *   - 指定されたID、または現在のチームID、または最初の有効なチームの優先順位で単一チームを選択する
 *   - 環境変数PI_AGENT_TEAM_PARALLEL_DEFAULTの設定に応じて、全有効チームまたはカレントチームを並列実行用として配列で選択する
 * why_it_exists:
 *   - チーム選択の複雑な条件分岐（ID指定、フォールバック、並列設定）を呼び出し元から分離するため
 *   - 並列実行モードの挙動を環境変数で制御可能にするため
 * scope:
 *   in: TeamStorageオブジェクト（チーム定義配列と現在のチームID）、任意のチームID文字列
 *   out: 単一のTeamDefinitionオブジェクト、またはTeamDefinitionの配列
 */

import type { TeamStorage, TeamDefinition } from "./storage.js";

/**
 * ストレージからチームを選択
 * @summary チーム選択
 * @param storage - チームストレージ
 * @param requestedId - リクエストされたチームID（省略可）
 * @returns 選択されたチーム定義、またはundefined
 */
export function pickTeam(
  storage: TeamStorage,
  requestedId?: string
): TeamDefinition | undefined {
  if (requestedId) {
    return storage.teams.find((team) => team.id === requestedId);
  }

  if (storage.currentTeamId) {
    const current = storage.teams.find((team) => team.id === storage.currentTeamId);
    if (current && current.enabled === "enabled") return current;
  }

  return storage.teams.find((team) => team.enabled === "enabled");
}

/**
 * デフォルトの並列実行チームを選択
 * @summary 並列チーム選択
 * @param storage - チームストレージ
 * @returns 選択されたチーム定義の配列
 */
export function pickDefaultParallelTeams(storage: TeamStorage): TeamDefinition[] {
  const enabledTeams = storage.teams.filter((team) => team.enabled === "enabled");
  if (enabledTeams.length === 0) return [];

  const mode = String(process.env.PI_AGENT_TEAM_PARALLEL_DEFAULT || "current")
    .trim()
    .toLowerCase();
  if (mode === "all") {
    return enabledTeams;
  }

  const currentEnabled = storage.currentTeamId
    ? enabledTeams.find((team) => team.id === storage.currentTeamId)
    : undefined;
  if (currentEnabled) {
    return [currentEnabled];
  }

  return enabledTeams.slice(0, 1);
}
