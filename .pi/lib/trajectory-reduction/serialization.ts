/**
 * @abdd.meta
 * path: .pi/lib/trajectory-reduction/serialization.ts
 * role: 軌跡ステップのシリアライズ・デシリアライズ機能
 * why: LLMへの入力用に軌跡を文字列化し、トークン数を概算するため
 * related: .pi/lib/trajectory-reduction/types.ts, .pi/lib/trajectory-reduction/reflection-module.ts
 * public_api: serializeStep, serializeSteps, countTokens, estimateTokens
 * invariants: シリアライズ結果は一意
 * side_effects: なし
 * failure_modes: 不正な入力に対するエラー
 * @abdd.explain
 * overview: 軌跡データの文字列化とトークンカウント機能
 * what_it_does:
 *   - TrajectoryStepをLLM入力用の文字列に変換
 *   - 複数ステップの一括シリアライズ
 *   - トークン数の概算（文字数ベース）
 * why_it_exists:
 *   - LLMへの入力フォーマットを統一するため
 *   - 圧縮効果を測定するためのトークンカウントが必要
 * scope:
 *   in: TrajectoryStep, 設定
 *   out: シリアライズされた文字列、トークン数
 */

import type { TrajectoryStep, StepRole } from "./types.js";

/**
 * ステップのロール表示名
 */
const ROLE_LABELS: Record<StepRole, string> = {
  user: "User",
  assistant: "Assistant",
  tool: "Tool",
  system: "System",
};

/**
 * トークン概算の係数（英語: 4文字/トークン、日本語: 2文字/トークン の混合）
 * 保守的に3文字/トークンで計算
 */
const TOKEN_RATIO = 3;

/**
 * 単一ステップをシリアライズ
 * @summary ステップを文字列に変換
 * @param step 軌跡ステップ
 * @param includeMetadata メタデータを含めるか
 * @returns シリアライズされた文字列
 */
export function serializeStep(step: TrajectoryStep, includeMetadata = false): string {
  const roleLabel = ROLE_LABELS[step.role] || step.role;
  let result = `[Step ${step.step}] ${roleLabel}:\n${step.content}`;

  if (includeMetadata && step.metadata && Object.keys(step.metadata).length > 0) {
    const metadataStr = Object.entries(step.metadata)
      .map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`)
      .join("\n");
    result += `\n\nMetadata:\n${metadataStr}`;
  }

  if (step.compressed) {
    result += `\n[Compressed: ${step.originalTokenCount} → ${step.tokenCount} tokens]`;
  }

  return result;
}

/**
 * 複数ステップを一括シリアライズ
 * @summary ステップ配列を文字列に変換
 * @param steps 軌跡ステップ配列
 * @param includeMetadata メタデータを含めるか
 * @returns シリアライズされた文字列
 */
export function serializeSteps(steps: TrajectoryStep[], includeMetadata = false): string {
  return steps.map((step) => serializeStep(step, includeMetadata)).join("\n\n---\n\n");
}

/**
 * トークン数を概算（文字数ベース）
 * @summary 文字列のトークン数を概算
 * @param content 対象文字列
 * @returns 概算トークン数
 */
export function countTokens(content: string): number {
  if (!content || content.length === 0) {
    return 0;
  }

  // 日本語文字の割合を推定
  const japaneseChars = (content.match(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf]/g) || []).length;
  const totalChars = content.length;
  const japaneseRatio = totalChars > 0 ? japaneseChars / totalChars : 0;

  // 日本語: 2文字/トークン、英語: 4文字/トークン の加重平均
  const effectiveRatio = japaneseRatio * 2 + (1 - japaneseRatio) * 4;

  return Math.ceil(content.length / effectiveRatio);
}

/**
 * ステップのトークン数を再計算
 * @summary ステップのトークン数を更新
 * @param step 軌跡ステップ
 * @returns トークン数
 */
export function recountStepTokens(step: TrajectoryStep): number {
  return countTokens(step.content);
}

/**
 * 軌跡全体のトークン数を計算
 * @summary 全ステップのトークン数合計
 * @param steps 軌跡ステップ配列
 * @returns 総トークン数
 */
export function countTotalTokens(steps: TrajectoryStep[]): number {
  return steps.reduce((sum, step) => sum + step.tokenCount, 0);
}

/**
 * シリアライズ済み文字列からトークン数を計算
 * @summary シリアライズ結果のトークン数
 * @param serialized シリアライズ済み文字列
 * @returns トークン数
 */
export function countSerializedTokens(serialized: string): number {
  return countTokens(serialized);
}

/**
 * コンテンツが閾値以下かチェック
 * @summary 圧縮スキップ判定
 * @param content コンテンツ
 * @param threshold 閾値
 * @returns 閾値以下の場合true
 */
export function isBelowThreshold(content: string, threshold: number): boolean {
  return countTokens(content) <= threshold;
}

/**
 * ステップを簡易フォーマットでシリアライズ（リフレクション用）
 * @summary リフレクション用の簡易フォーマット
 * @param step 軌跡ステップ
 * @returns 簡易フォーマット文字列
 */
export function serializeStepForReflection(step: TrajectoryStep): string {
  const roleLabel = ROLE_LABELS[step.role] || step.role;
  return `### Step ${step.step} (${roleLabel})\n\`\`\`\n${truncateContent(step.content, 2000)}\n\`\`\``;
}

/**
 * コンテンツを切り詰め
 * @summary 長いコンテンツを切り詰め
 * @param content コンテンツ
 * @param maxLength 最大長
 * @returns 切り詰められたコンテンツ
 */
export function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.slice(0, maxLength) + "\n... (truncated)";
}

/**
 * メッセージオブジェクトからTrajectoryStepを作成
 * @summary メッセージをステップに変換
 * @param message メッセージオブジェクト
 * @param stepNumber ステップ番号
 * @returns 軌跡ステップ
 */
export function messageToStep(
  message: { role: string; content: string; name?: string },
  stepNumber: number
): TrajectoryStep {
  const role = normalizeRole(message.role);
  const content = typeof message.content === "string"
    ? message.content
    : JSON.stringify(message.content);

  return {
    step: stepNumber,
    role,
    content,
    tokenCount: countTokens(content),
    timestamp: Date.now(),
    metadata: message.name ? { name: message.name } : undefined,
  };
}

/**
 * ロール文字列を正規化
 * @summary ロール名を標準化
 * @param role ロール文字列
 * @returns 正規化されたロール
 */
function normalizeRole(role: string): StepRole {
  const normalized = role.toLowerCase();
  if (normalized === "user" || normalized === "human") return "user";
  if (normalized === "assistant" || normalized === "ai") return "assistant";
  if (normalized === "tool" || normalized === "function") return "tool";
  if (normalized === "system") return "system";
  return "assistant"; // デフォルト
}

/**
 * 圧縮されたコンテンツをパース
 * @summary 圧縮コンテンツから元の構造を推測
 * @param compressedContent 圧縮されたコンテンツ
 * @returns パース結果
 */
export function parseCompressedContent(
  compressedContent: string
): { description: string; originalHint?: string } {
  // "... (description)" パターンを検出
  const match = compressedContent.match(/^\.\.\.\s*\((.+)\)$/);
  if (match) {
    return {
      description: match[1],
    };
  }

  // その他のパターン
  return {
    description: compressedContent.slice(0, 100),
    originalHint: compressedContent.length > 100 ? compressedContent : undefined,
  };
}
