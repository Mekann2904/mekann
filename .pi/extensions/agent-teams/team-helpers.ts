/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/team-helpers.ts
 * role: エージェントチームの選択ロジックを提供するユーティリティモジュール
 * why: 実行対象のチームを特定するための判定処理を共通化し、明示的なチーム選択を強制するため
 * related: ./storage.ts, ./extension.ts
 * public_api: pickTeam, pickDefaultParallelTeams
 * invariants: 出力されるチームは必ずenabledが"enabled"である；デフォルトチームの自動選択は行わない
 * side_effects: process.env.PI_AGENT_TEAM_PARALLEL_DEFAULTの読み取り
 * failure_modes: teamId指定なしかつcurrentTeamIdなしの場合はundefined/空配列を返す
 * @abdd.explain
 * overview: ストレージ内のチーム定義に対し、ID指定またはcurrentTeamIdに基づいた選択を行う
 * what_it_does:
 *   - 明示的なID指定がある場合はそのチームを返す
 *   - currentTeamIdが設定されている場合はそのチームを返す
 *   - デフォルトのフォールバックは行わない（意図しないチーム実行を防止）
 * why_it_exists:
 *   - チーム選択の条件分岐を呼び出し元から分離するため
 *   - デフォルトチームによる惰性的選択を防ぎ、意識的な選択を促すため
 * scope:
 *   in: TeamStorageオブジェクト、任意のチームID文字列
 *   out: TeamDefinitionオブジェクト、またはundefined/空配列
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
  // 明示的なID指定がある場合はそのチームを返す
  if (requestedId) {
    return storage.teams.find((team) => team.id === requestedId);
  }

  // currentTeamIdが設定されている場合はそのチームを返す
  if (storage.currentTeamId) {
    const current = storage.teams.find((team) => team.id === storage.currentTeamId);
    if (current && current.enabled === "enabled") return current;
  }

  // デフォルトなし: teamId指定なしかつcurrentTeamIdなしの場合はundefinedを返す
  // 呼び出し元でエラーハンドリングすること
  return undefined;
}

/**
 * デフォルトの並列実行チームを選択
 * @summary 並列チーム選択
 * @param storage - チームストレージ
 * @returns 選択されたチーム定義の配列（デフォルトなしの場合は空配列）
 */
export function pickDefaultParallelTeams(storage: TeamStorage): TeamDefinition[] {
  const enabledTeams = storage.teams.filter((team) => team.enabled === "enabled");
  if (enabledTeams.length === 0) return [];

  const mode = String(process.env.PI_AGENT_TEAM_PARALLEL_DEFAULT || "current")
    .trim()
    .toLowerCase();

  // "all"モード: すべての有効なチームを返す（明示的な環境変数設定が必要）
  if (mode === "all") {
    return enabledTeams;
  }

  // "current"モード（デフォルト）: currentTeamIdが設定されている場合のみ返す
  const currentEnabled = storage.currentTeamId
    ? enabledTeams.find((team) => team.id === storage.currentTeamId)
    : undefined;
  if (currentEnabled) {
    return [currentEnabled];
  }

  // デフォルトなし: currentTeamIdが設定されていない場合は空配列を返す
  // 呼び出し元でエラーハンドリングすること
  return [];
}
