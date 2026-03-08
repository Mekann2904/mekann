// Path: .pi/lib/agent/autonomous-loop-policy.ts
// What: Ralph系の自律ループ規約を mekann 向けに整形して返す。
// Why: 通常時から高自律・高品質な実行方針を lead agent と subagent に一貫注入するため。
// Related: .pi/extensions/autonomous-loop-prompt.ts, .pi/lib/agent/prompt-stack.ts, AGENTS.md
/**
 * @abdd.meta
 * path: .pi/lib/agent/autonomous-loop-policy.ts
 * role: 自律ループ運用規約の文字列生成
 * why: Ralph系の運用原則を再利用可能な単一ソースで保持するため
 * related: .pi/extensions/autonomous-loop-prompt.ts, .pi/lib/agent/prompt-stack.ts, AGENTS.md
 * public_api: AutonomousLoopAudience, buildAutonomousLoopPolicy
 * invariants: audience ごとに安定した規約を返す、空文字は返さない
 * side_effects: なし
 * failure_modes: 未知の audience は delegated と同等の保守的な規約へフォールバックする
 * @abdd.explain
 * overview: lead agent と delegated subagent に渡す自律ループ規約を構築する
 * what_it_does:
 *   - Ralph系の「一度に一つ」「検索してから変更」「検証は絞る」を明文化する
 *   - audience 別に文面を切り替える
 *   - system prompt にそのまま注入できる文字列を返す
 * why_it_exists:
 *   - 通常時の自律実行を一貫した運用規約で安定化するため
 *   - APPEND_SYSTEM と実行時注入で規約の意味を揃えるため
 * scope:
 *   in: audience
 *   out: system prompt 用の規約文字列
 */

/**
 * 規約の対象者。
 * @summary 規約対象
 */
export type AutonomousLoopAudience = "lead" | "delegated" | "internal";

const CORE_RULES = [
  "1. One thing per loop. 常に最重要の未完了事項を1つだけ前に進める。",
  "2. 変更前に検索する。未実装だと決めつけず、関連ファイルを読んでから触る。",
  "3. Quick and dirty prototype first. その後に局所検証し、観測された失敗だけ直す。",
  "4. 検証は細く速く回す。build/test/lint は変更した単位から始める。",
  "5. 探索や要約は並列化してよいが、重い build/test 系の検証担当は絞る。",
  "6. placeholder 実装で済ませない。欠けている機能は仕様に沿って埋める。",
  "7. 予定外の発見は握りつぶさない。fix plan / todo / journal に残してから進む。",
  "8. 完了宣言は verified reality ベースで行う。推測で閉じない。",
].join("\n");

const LEAD_RULES = [
  "【Autonomous Loop Operating Rules】",
  "",
  "あなたは通常時から高度自律モードで動く。",
  "ただし、速さではなく loop quality を最適化する。",
  "",
  CORE_RULES,
  "",
  "Lead-agent specific:",
  "- live todo を常に最新化し、in_progress は1件だけにする。",
  "- 複雑な仕事では plan -> edit -> verify -> observe -> repair を短く回す。",
  "- サブエージェントは探索・比較・要約・局所実装に使う。",
  "- build/test/lint の重い確認は同時に広げすぎない。",
  "- 仕様・受け入れ条件・検証結果を次の loop に引き継げる形で残す。",
  "- 進捗が止まったら、広げるのでなく task を狭める。",
].join("\n");

const DELEGATED_RULES = [
  "【Delegated Autonomous Loop Rules】",
  "",
  "あなたは delegated subagent であり、1ループ1責務で動く。",
  "",
  CORE_RULES,
  "",
  "Delegated-agent specific:",
  "- 依頼された task の中で最重要の1インクリメントだけを進める。",
  "- 調査だけで終える場合も、次の最短アクションを明記する。",
  "- 実装したら、その単位に最も近い検証を優先する。",
  "- 他領域の問題を見つけたら、黙って抱えず evidence 付きで返す。",
].join("\n");

const INTERNAL_RULES = [
  "Autonomous Loop Rules (INTERNAL MODE)",
  "",
  "Operate as a compact Ralph-style loop without wasting context.",
  "",
  "1. Move only the single highest-priority unfinished item.",
  "2. Search and read before assuming something is missing.",
  "3. Start with a minimal concrete step, then verify only the touched unit.",
  "4. Use parallel exploration for search and comparison, not for heavy validation.",
  "5. Do not ship placeholders. Missing behavior must be implemented or explicitly surfaced.",
  "6. Report new risks or discoveries so the next loop can continue deterministically.",
].join("\n");

/**
 * audience に応じた自律ループ規約を返す。
 * @summary 規約生成
 * @param audience 規約の対象
 * @returns system prompt に注入する規約文字列
 */
export function buildAutonomousLoopPolicy(audience: AutonomousLoopAudience): string {
  switch (audience) {
    case "lead":
      return LEAD_RULES;
    case "internal":
      return INTERNAL_RULES;
    case "delegated":
    default:
      return DELEGATED_RULES;
  }
}
