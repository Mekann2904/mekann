/**
 * @abdd.meta
 * path: .pi/lib/text-parsing.ts
 * role: 構造化テキスト出力のパース・正規化・ID生成を行う共有ユーティリティ
 * why: モジュール間の循環依存を回避するために機能を抽出して配置するため
 * related: .pi/lib/judge.ts, .pi/lib/output-schema.ts, .pi/lib/output-validation.ts
 * public_api: clampConfidence, generateClaimId, generateEvidenceId, parseUnitInterval, extractField, extractMultilineField
 * invariants:
 *   - clampConfidenceは必ず0以上1以下の数値を返す
 *   - 生成されるIDは一意かつ指定されたフォーマットに従う
 * side_effects: なし（純粋関数）
 * failure_modes:
 *   - 不正な数値形式や空文字列に対してundefinedまたはデフォルト値を返す
 *   - フィールド抽出時にパターンマッチが失敗すると空文字またはundefinedを返す
 * @abdd.explain
 * overview: 構造化された出力処理において、信頼度の正規化、一意ID生成、テキストフィールド抽出を行うヘルパー関数群
 * what_it_does:
 *   - 信頼度を0.0〜1.0の範囲に丸める
 *   - タイムスタンプと乱数を含む一意のClaim IDとEvidence IDを生成する
 *   - 文字列から小数またはパーセント表記を数値に変換する
 *   - 構造化テキストから指定されたフィールド名の値を抽出する（単一行および複数行対応）
 * why_it_exists:
 *   - 評価ロジックやバリデーション機能からパース処理を分離し、コードの重複と依存関係の複雑化を防ぐため
 *   - 構造化通信におけるID生成と値の正規化処理を標準化するため
 * scope:
 *   in: 生のテキスト文字列、数値、フォーマット指定
 *   out: 正規化された数値、一意ID文字列、抽出されたテキスト、またはundefined/空文字
 */

/**
 * Shared text parsing utilities for structured output processing.
 * Extracted to avoid circular dependencies between modules.
 *
 * Related: judge.ts, output-schema.ts, output-validation.ts
 */

// ============================================================================
// Number Utilities
// ============================================================================

/**
 * 信頼度を範囲内に収める
 * @summary 値を制限
 * @param value 制限対象の数値
 * @returns 0から1の間に収められた数値
 */
export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

// ============================================================================
// ID Generation Utilities (Phase 2: Structured Communication)
// ============================================================================

/**
 * エビデンスIDを生成する
 * @summary ID生成
 * @returns 生成された一意なID文字列
 */
export function generateClaimId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `claim-${timestamp}-${random}`;
}

/**
 * クレームIDを生成する
 * @summary ID生成
 * @returns 生成された一意なID文字列
 */
export function generateEvidenceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `evidence-${timestamp}-${random}`;
}

/**
 * @summary 単位区間をパース
 * @description 文字列を0.0から1.0までの数値に変換します。
 * @param {string | undefined} raw - 変換対象の文字列
 * @returns {number | undefined} パースされた数値。無効な場合はundefined
 */
export function parseUnitInterval(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value) return undefined;

  const percent = value.endsWith("%");
  const numeric = Number.parseFloat(percent ? value.slice(0, -1) : value);
  if (!Number.isFinite(numeric)) return undefined;

  if (percent || numeric > 1) {
    return clampConfidence(numeric / 100);
  }
  return clampConfidence(numeric);
}

// ============================================================================
// Text Extraction Utilities
// ============================================================================

/**
 * @summary 単一行フィールドを抽出
 * @description テキストから指定された名前の単一行フィールドの値を抽出します。
 * @param {string} output - 解析対象のテキスト
 * @param {string} name - 抽出するフィールド名
 * @returns {string | undefined} 抽出されたフィールド値。見つからない場合はundefined
 */
export function extractField(output: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = output.match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

/**
 * @summary 複数行フィールドを抽出
 * @description テキストから指定された名前の複数行フィールドの値を抽出します。
 * @param {string} output - 解析対象のテキスト
 * @param {string} name - 抽出するフィールド名
 * @returns {string} 抽出されたフィールド値
 */
export function extractMultilineField(output: string, name: string): string {
  const pattern = new RegExp(`^${name}\\s*:\\s*$`, "im");
  const lines = output.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => pattern.test(line));

  if (startIndex === -1) {
    return "";
  }

  const fieldLines: string[] = [];
  // Include same-line content if present
  const sameLineMatch = lines[startIndex].match(new RegExp(`^${name}\\s*:\\s*(.*)$`, "i"));
  if (sameLineMatch && sameLineMatch[1].trim()) {
    fieldLines.push(sameLineMatch[1].trim());
  }

  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop at the next major label
    if (/^(SUMMARY|CLAIM|EVIDENCE|CONFIDENCE|DISCUSSION|RESULT|NEXT_STEP)\s*:/i.test(line)) {
      break;
    }
    fieldLines.push(line);
  }

  return fieldLines.join("\n").trim();
}

// ============================================================================
// Text Analysis Utilities
// ============================================================================

/**
 * @summary キーワード出現数をカウント
 * @description 指定されたテキスト内に含まれるキーワードの総出現回数をカウントします。
 * @param {string} output - 検索対象のテキスト
 * @param {string[]} keywords - 検索するキーワードの配列
 * @returns {number} キーワードの総出現回数
 */
export function countKeywordSignals(output: string, keywords: string[]): number {
  const lowered = output.toLowerCase();
  let count = 0;
  for (const keyword of keywords) {
    if (lowered.includes(keyword.toLowerCase())) {
      count += 1;
    }
  }
  return count;
}

// ============================================================================
// Discussion Analysis Utilities (P0-2: Structured Communication Context)
// ============================================================================

/**
 * @summary 議論の立場を定義
 * @description 議論における賛成、反対、中立、部分的賛成の立場を表す型。
 */
export type DiscussionStance = "agree" | "disagree" | "neutral" | "partial";

/**
 * 議論の立場解析結果を表すインターフェース
 * @summary 解析結果インターフェース
 * @property {string} stance 立場
 * @property {number} confidence 信頼度
 * @property {string[]} evidence 証拠リスト
 */
export interface DiscussionStanceResult {
  stance: DiscussionStance;
  confidence: number;
  evidence: string[];
}

/**
 * Regex patterns for detecting stance in discussion text.
 * Supports both Japanese and English expressions.
 */
export const STANCE_PATTERNS: Record<DiscussionStance, RegExp[]> = {
  agree: [
    /同意|賛成|支持|正しい|的確|妥当|合意/,
    /\b(agree|support|correct|valid|consensus)\b/i,
  ],
  disagree: [
    /反対|不同意|懸念|問題|誤り|不適切|矛盾/,
    /\b(disagree|oppose|concern|issue|wrong|incorrect)\b/i,
  ],
  partial: [
    /部分的|一部|条件付き|ただし|一方|側面/,
    /\b(partial|conditionally|however)\b/i,
  ],
  neutral: [
    /参考|確認|注記|留意/,
    /\b(note|reference|observe)\b/i,
  ],
};

/**
 * 議論におけるメンバーの立場を解析する
 * @summary 議論立場解析
 * @param {string} text 解析対象テキスト
 * @param {string} targetMemberId 対象メンバーID
 * @returns {DiscussionStanceResult} 解析結果
 */
export function analyzeDiscussionStance(
  text: string,
  targetMemberId: string
): DiscussionStanceResult {
  // Default result for empty or missing text
  if (!text || text.trim().length === 0) {
    return {
      stance: "neutral",
      confidence: 0.0,
      evidence: [],
    };
  }

  // Extract context around targetMemberId (approx. 100 chars before and after)
  const contextWindow = 100;
  const memberIdLower = targetMemberId.toLowerCase();
  const textLower = text.toLowerCase();
  const memberIndex = textLower.indexOf(memberIdLower);

  // If member ID not found, analyze full text
  const analysisText = memberIndex === -1
    ? text
    : text.slice(
        Math.max(0, memberIndex - contextWindow),
        Math.min(text.length, memberIndex + memberIdLower.length + contextWindow)
      );

  // Count matches for each stance
  const matchCounts: Record<DiscussionStance, number> = {
    agree: 0,
    disagree: 0,
    partial: 0,
    neutral: 0,
  };

  const matchEvidence: Record<DiscussionStance, string[]> = {
    agree: [],
    disagree: [],
    partial: [],
    neutral: [],
  };

  // Check each stance pattern
  for (const [stance, patterns] of Object.entries(STANCE_PATTERNS) as [DiscussionStance, RegExp[]][]) {
    for (const pattern of patterns) {
      // Use exec loop instead of matchAll for broader compatibility
      const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
      let match: RegExpExecArray | null;
      while ((match = regex.exec(analysisText)) !== null) {
        if (match[0]) {
          matchCounts[stance]++;
          matchEvidence[stance].push(match[0]);
        }
      }
    }
  }

  // Determine the dominant stance
  let maxCount = 0;
  let dominantStance: DiscussionStance = "neutral";

  for (const [stance, count] of Object.entries(matchCounts) as [DiscussionStance, number][]) {
    if (count > maxCount) {
      maxCount = count;
      dominantStance = stance;
    }
  }

  // Calculate total patterns checked
  const totalPatterns = Object.values(STANCE_PATTERNS).reduce(
    (sum, patterns) => sum + patterns.length,
    0
  );

  // Confidence = match count / total patterns, clamped to [0, 1]
  const confidence = totalPatterns > 0
    ? clampConfidence(maxCount / totalPatterns)
    : 0.0;

  // Deduplicate evidence
  const uniqueEvidence = Array.from(new Set(matchEvidence[dominantStance]));

  return {
    stance: dominantStance,
    confidence,
    evidence: uniqueEvidence,
  };
}

/**
 * テキストから合意マーカーを抽出する
 * @summary 合意マーカー抽出
 * @param {string} text 解析対象テキスト
 * @returns {string | undefined} 抽出されたマーカー文字列
 */
export function extractConsensusMarker(text: string): string | undefined {
  // Japanese pattern: "合意:" or "合意："
  const jaMatch = text.match(/合意\s*[:：]\s*(.+)/);
  if (jaMatch?.[1]) {
    return jaMatch[1].trim();
  }

  // English pattern: "Consensus:" (case-insensitive)
  const enMatch = text.match(/consensus\s*:\s*(.+)/i);
  if (enMatch?.[1]) {
    return enMatch[1].trim();
  }

  return undefined;
}
