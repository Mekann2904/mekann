/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/team-formatters.ts
 * role: チーム情報の整形とデバッグログ出力を行うユーティリティ
 * why: チーム一覧や実行履歴を人間が読みやすい形式で可視化し、コスト推定のデバッグ情報を出力するため
 * related: .pi/extensions/agent-teams/storage.js, .pi/extensions/agent-teams/index.ts
 * public_api: debugCostEstimation, formatTeamList, formatRecentRuns
 * invariants: formatTeamListはストレージのteams配列の順序を維持する、formatRecentRunsは新しい実行履歴を上に表示する
 * side_effects: debugCostEstimation実行時に環境変数が有効な場合、標準エラー出力にログを出力する
 * failure_modes: ストレージ内のデータ構造が想定と異なる場合、不正なフォーマットで出力される可能性がある
 * @abdd.explain
 * overview: TeamStorageのデータを表示用文字列に変換する関数群と、デバッグ用ログ出力関数を提供するモジュール
 * what_it_does:
 *   - 環境変数に基づきコスト推計ログを標準エラー出力へ出力する
 *   - チーム一覧、メンバー、状態を整形した文字列を生成する
 *   - 直近のチーム実行履歴を指定件数分、整形して文字列を生成する
 * why_it_exists:
 *   - エージェントチームの状態をCLIやログで確認しやすくするため
 *   - 実行履歴の結果や判定を追跡可能にするため
 *   - デバッグフラグによる詳細なログ出力を制御するため
 * scope:
 *   in: TeamStorageオブジェクト、スコープ名、ログフィールド、表示件数リミット
 *   out: 整形された文字列、標準エラー出力へのログ出力
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
