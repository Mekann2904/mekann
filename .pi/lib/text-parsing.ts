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
  * 信頼度を0から1の範囲に丸める
  * @param value 入力値
  * @returns 丸められた信頼度（範囲外または無効な値は0.5）
  */
export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

// ============================================================================
// ID Generation Utilities (Phase 2: Structured Communication)
// ============================================================================

/**
 * Generate a unique claim ID for structured communication tracking.
 * Format: claim-<timestamp>-<random>
 *
 * @returns Unique claim identifier
 */
export function generateClaimId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `claim-${timestamp}-${random}`;
}

 /**
  * 構造化された通信追跡用の証拠IDを生成する
  * @returns 一意の証跡ID
  */
export function generateEvidenceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `evidence-${timestamp}-${random}`;
}

 /**
  * 文字列から単位区間の値をパースする。
  * @param raw 入力文字列（小数またはパーセント形式）
  * @returns パースされた数値、または無効な場合はundefined
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
 * Extract a named field from structured output text.
 * Matches patterns like "FIELD_NAME: value" (case-insensitive).
 */
export function extractField(output: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = output.match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

 /**
  * 指定されたフィールドの複数行を抽出する。
  * @param output - 検索対象のテキスト
  * @param name - フィールド名
  * @returns フィールドの内容
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
  * 出力テキストに含まれるキーワードの数をカウントする
  * @param output 検索対象のテキスト
  * @param keywords 検索するキーワードの配列
  * @returns 見つかったキーワードの数
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
  * ディスカッションの立場を表す型
  */
export type DiscussionStance = "agree" | "disagree" | "neutral" | "partial";

 /**
  * ディスカッションのスタンス分析結果
  * @param stance スタンス（同意、反対、中立、部分的同意）
  * @param confidence 信頼度（0～1）
  * @param evidence 判断根拠となったテキストのリスト
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
  * 対象メンバーに関する議論のスタンスを分析する
  * @param text - 分析対象の議論テキスト
  * @param targetMemberId - 文脈を検索するメンバーID
  * @returns 確信度と証拠を含むスタンス分析結果
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
  * @param text - 検索対象のテキスト
  * @returns 抽出された合意テキスト。見つからない場合はundefined
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
