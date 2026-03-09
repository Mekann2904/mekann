/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/member-execution.ts
 * role: エージェントチームメンバーの実行とスキル読み込みを行うモジュール
 * why: チームメンバーのスキル管理と実行を統一するため
 * related: .pi/extensions/agent-teams/communication.ts
 * public_api: loadSkillContent
 * invariants: スキルファイルはSKILL.mdという名前で保存される、無効なスキル名は拒否される
 * side_effects: ファイルシステムからの読み込み、コンソールへのログ出力
 * failure_modes: ファイルが存在しない場合はnullを返し警告ログを出力、無効なスキル名はnullを返す
 * @abdd.explain
 * overview: エージェントチームメンバーのスキル読み込み機能を提供するモジュール
 * what_it_does:
 *   - スキルファイルの内容を読み込む
 *   - 無効なスキル名の検証
 *   - エラーハンドリングとログ出力
 * why_it_exists:
 *   - チームメンバーのスキルを動的に読み込むため
 *   - エラーを適切にハンドリングし、システムを安定させるため
 * scope:
 *   in: スキル名（文字列）
 *   out: スキルファイルの内容（文字列）またはnull
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * スキル名の検証パターン
 * 英数字、ハイフン、アンダースコアのみ許可
 */
const SKILL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * スキルコンテンツを読み込む
 * @summary スキルファイル読み込み
 * @param skillName - スキル名（SKILL.mdファイル名を除くパス）
 * @returns スキルファイルの内容、存在しない場合はnull
 * @example
 * const content = loadSkillContent("git-workflow");
 * if (content) {
 *   console.log(content);
 * }
 */
export function loadSkillContent(skillName: string): string | null {
  // Bug #15修正: 入力検証を追加
  if (!skillName || typeof skillName !== "string") {
    console.warn(`[member-execution] Invalid skill name: ${skillName}`);
    return null;
  }

  // 無効な文字を含むスキル名を拒否
  if (!SKILL_NAME_PATTERN.test(skillName)) {
    console.warn(`[member-execution] Invalid skill name format: ${skillName}`);
    return null;
  }

  // パストラバーサル対策: .. を含むパスを拒否
  if (skillName.includes("..") || skillName.includes("//")) {
    console.warn(`[member-execution] Path traversal detected in skill name: ${skillName}`);
    return null;
  }

  try {
    // スキルファイルのパスを構築
    const skillPath = join(".pi", "skills", skillName, "SKILL.md");

    // ファイルの存在確認
    if (!existsSync(skillPath)) {
      // Bug #15修正: エラーログを追加（元はcatch {}で握りつぶしていた）
      console.warn(`[member-execution] Skill file not found: ${skillPath}`);
      return null;
    }

    // ファイルを読み込み
    const content = readFileSync(skillPath, "utf-8");
    return content;
  } catch (error) {
    // Bug #15修正: エラーログを追加（元はcatch {}で握りつぶしていた）
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[member-execution] Failed to load skill "${skillName}": ${errorMessage}`);
    return null;
  }
}
