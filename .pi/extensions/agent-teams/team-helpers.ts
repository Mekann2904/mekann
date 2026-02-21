/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/team-helpers.ts
 * role: チーム選択ヘルパー関数群
 * why: extension.tsからヘルパー関数を分離し、単一責任原則を満たす
 * related: [extension.ts, storage.ts]
 * public_api: [pickTeam, pickDefaultParallelTeams]
 * invariants:
 *   - 純粋関数（副作用なし）
 *   - TeamStorage型に依存
 * side_effects: なし
 * failure_modes: なし
 *
 * @abdd.explain
 * overview: エージェントチーム選択のヘルパー関数を提供
 * what_it_does: チーム選択ロジック、デフォルト並列チーム選択
 * why_it_exists: extension.tsの責務を軽減し、チーム選択ロジックを集約
 * scope(in):
 *   - TeamStorage型
 * scope(out):
 *   - TeamDefinition | undefined
 *   - TeamDefinition[]
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
