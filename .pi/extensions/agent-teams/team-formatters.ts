/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/team-formatters.ts
 * role: チーム関連のフォーマット関数群
 * why: extension.tsからフォーマット関数を分離し、単一責任原則を満たす
 * related: [extension.ts, storage.ts]
 * public_api: [formatTeamList, formatRecentRuns, debugCostEstimation]
 * invariants:
 *   - 純粋関数（副作用なし）
 *   - TeamStorage型に依存
 * side_effects: なし
 * failure_modes: なし
 *
 * @abdd.explain
 * overview: エージェントチームのフォーマット関数を提供
 * what_it_does: チーム一覧、実行履歴の表示用文字列を生成
 * why_it_exists: extension.tsの責務を軽減し、フォーマットロジックを集約
 * scope(in):
 *   - TeamStorage型
 * scope(out):
 *   - フォーマット済み文字列
 */

import type { TeamStorage } from "./storage.js";

/**
 * デバッグ用コスト推定ログを出力
 * @summary コスト推定デバッグログ出力
 * @param scope - スコープ名
 * @param fields - ログ出力するフィールド
 */
export function debugCostEstimation(
  scope: string,
  fields: Record<string, unknown>
): void {
  if (process.env.PI_DEBUG_COST_ESTIMATION !== "1") return;
  const parts = Object.entries(fields).map(([key, value]) => `${key}=${String(value)}`);
  console.error(`[cost-estimation] scope=${scope} ${parts.join(" ")}`);
}

/**
 * チーム一覧をフォーマット
 * @summary チーム一覧表示用文字列生成
 * @param storage - チームストレージ
 * @returns フォーマット済みチーム一覧文字列
 */
export function formatTeamList(storage: TeamStorage): string {
  if (storage.teams.length === 0) {
    return "No teams found.";
  }

  const lines: string[] = ["Agent teams:"];
  for (const team of storage.teams) {
    const marker = team.id === storage.currentTeamId ? "*" : " ";
    lines.push(`${marker} ${team.id} (${team.enabled}) - ${team.name}`);
    lines.push(`  ${team.description}`);
    for (const member of team.members) {
      lines.push(
        `   - ${member.id} (${member.enabled ? "enabled" : "disabled"}) ${member.role}: ${member.description}`
      );
    }
  }
  return lines.join("\n");
}

/**
 * 直近のチーム実行履歴をフォーマット
 * @summary 実行履歴表示用文字列生成
 * @param storage - チームストレージ
 * @param limit - 表示件数（デフォルト10件）
 * @returns フォーマット済み実行履歴文字列
 */
export function formatRecentRuns(storage: TeamStorage, limit = 10): string {
  const runs = storage.runs.slice(-limit).reverse();
  if (runs.length === 0) {
    return "No team runs yet.";
  }

  const lines: string[] = ["Recent team runs:"];
  for (const run of runs) {
    const judge = run.finalJudge
      ? ` | judge=${run.finalJudge.verdict}:${Math.round(run.finalJudge.confidence * 100)}%`
      : "";
    lines.push(
      `- ${run.runId} | ${run.teamId} | ${run.strategy} | ${run.status} | ${run.summary}${judge} | ${run.startedAt}`
    );
  }
  return lines.join("\n");
}
