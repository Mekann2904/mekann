/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/communication-references.ts
 * role: エージェント間のやり取りにおける参照関係とスタンス（賛成・反対）の解析
 * why: 出力テキストに含まれる他のエージェントへの言及やクレーム参照を抽出し、対話の構造と品質を定量化するため
 * related: ./communication-id.ts
 * public_api: ClaimReferenceV3, PartnerReferenceResultV3, detectPartnerReferencesV3
 * invariants: PartnerReferenceResultV3のcoverage.ratioはcount/totalに等しい
 * side_effects: RegExpオブジェクトのlastIndexをリセットする（内部状態の変更）
 * failure_modes: 正規表現のパターンがテキスト構造と一致しない場合、参照が抽出されない
 * @abdd.explain
 * overview: 出力テキストから特定のトークン形式（REF, CLAIM, @mention）を用いたエージェント参照を検出し、定量的な指標とクレーム参照リストを生成するモジュール
 * what_it_does:
 *   - REF(), CLAIM(), []の構文とメンション（@）の正規表現マッチングを実行する
 *   - 通信ID（commId）からメンバーID（memberId）への解決と参照カウントを行う
 *   - 参照カバレッジ（coverage）、特異性（specificity）、品質スコア（overallQuality）を計算する
 *   - クレーム参照ごとにスタンス（agree/disagree等）を推論してリスト化する
 * why_it_exists:
 *   - マルチエージェントシステムにおいて、誰が誰の発言を参照・評価しているかを可視化する必要があるため
 *   - 構造化された参照と非構造化の言及を区別し、対話の厳密性を評価するため
 * scope:
 *   in: 解析対象のテキスト（output）、通信IDリスト、ID間のマッピング情報
 *   out: 参照されたメンバーID、不足しているメンバー、クレーム参照詳細、各種スコアを含む解析結果オブジェクト
 */

import type { CommIdEntry } from "./communication-id";
import { resolveUniqueCommIds } from "./communication-id";

/**
 * クレーム参照（V3）
 * @summary クレーム参照
 */
export interface ClaimReferenceV3 {
  claimId: string;
  memberId: string;
  commId: string;
  stance: "agree" | "disagree" | "neutral" | "unknown";
  confidence: number;
  source: "explicit" | "inferred" | "default";
}

/**
 * パートナー参照結果（V3）
 * @summary 参照解析結果
 */
export interface PartnerReferenceResultV3 {
  referencedPartners: string[];
  missingPartners: string[];
  claimReferences: ClaimReferenceV3[];

  coverage: {
    ratio: number;
    count: number;
    total: number;
  };

  specificity: {
    ratio: number;
    structuredCount: number;
    quoteCount: number;
  };

  overallQuality: number;

  stanceSummary: {
    agree: number;
    disagree: number;
    neutral: number;
    unknown: number;
  };
}

const TOKEN_PATTERNS = {
  ref: /REF\(([A-Za-z0-9_-]+)\)/gi,
  claim: /CLAIM\(([A-Za-z0-9_-]+):(\d+)\)/gi,
  bracket: /\[([A-Za-z0-9_-]+):(\d+)\]/gi,
  mention: /@([A-Za-z0-9_-]+)/gi,
  cites: /CITED\s*:\s*([^\n]+)/i,
  stance: /STANCE\s*:\s*(agree|disagree|neutral|unknown)/i,
};

const AGREE_PATTERNS = [
  /\b(同意|賛成|支持|正しい|妥当|適切|agree|support|correct|valid)\b/i,
];

const DISAGREE_PATTERNS = [
  /\b(反対|異議|誤り|不適切|問題|懸念|disagree|incorrect|wrong|concern)\b/i,
];

function createIdPattern(id: string): RegExp {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_-])(${escaped})($|[^A-Za-z0-9_-])`, "i");
}

function normalizeForDetection(text: string): string {
  return text
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .toLowerCase();
}

function resetPattern(pattern: RegExp): void {
  pattern.lastIndex = 0;
}

/**
 * パートナー参照を検出する（V3）
 * @summary パートナー参照検出
 * @param output 出力テキスト
 * @param partnerCommIds パートナー通信ID
 * @param commIdToMemberId 通信ID→メンバーIDマップ
 * @param _memberIdToCommId メンバーID→通信IDマップ
 * @returns 参照解析結果
 */
export function detectPartnerReferencesV3(
  output: string,
  partnerCommIds: string[],
  commIdToMemberId: Map<string, string>,
  _memberIdToCommId: Map<string, string>
): PartnerReferenceResultV3 {
  const referencedMemberIds = new Set<string>();
  const claimReferences: ClaimReferenceV3[] = [];
  let structuredCount = 0;
  let quoteCount = 0;

  const stanceSummary = { agree: 0, disagree: 0, neutral: 0, unknown: 0 };

  resetPattern(TOKEN_PATTERNS.ref);
  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERNS.ref.exec(output)) !== null) {
    const commId = match[1];
    if (partnerCommIds.includes(commId)) {
      const memberId = commIdToMemberId.get(commId) ?? commId;
      referencedMemberIds.add(memberId);
      structuredCount++;
    }
  }

  resetPattern(TOKEN_PATTERNS.claim);
  while ((match = TOKEN_PATTERNS.claim.exec(output)) !== null) {
    const commId = match[1];
    const index = parseInt(match[2], 10);
    if (partnerCommIds.includes(commId)) {
      const memberId = commIdToMemberId.get(commId) ?? commId;
      referencedMemberIds.add(memberId);
      structuredCount++;

      const stance = detectStance(output, commId);
      stanceSummary[stance.stance]++;

      claimReferences.push({
        claimId: `${commId}:${index}`,
        memberId,
        commId,
        stance: stance.stance,
        confidence: stance.confidence,
        source: stance.source,
      });
    }
  }

  resetPattern(TOKEN_PATTERNS.bracket);
  while ((match = TOKEN_PATTERNS.bracket.exec(output)) !== null) {
    const commId = match[1];
    if (partnerCommIds.includes(commId)) {
      const memberId = commIdToMemberId.get(commId) ?? commId;
      referencedMemberIds.add(memberId);
      structuredCount++;
    }
  }

  resetPattern(TOKEN_PATTERNS.mention);
  while ((match = TOKEN_PATTERNS.mention.exec(output)) !== null) {
    const commId = match[1];
    if (partnerCommIds.includes(commId)) {
      const memberId = commIdToMemberId.get(commId) ?? commId;
      referencedMemberIds.add(memberId);
      structuredCount++;
    }
  }

  const citesMatch = TOKEN_PATTERNS.cites.exec(output);
  if (citesMatch) {
    const citesContent = citesMatch[1];
    quoteCount = (citesContent.match(/REF\(|CLAIM\(|@\[|@[A-Za-z0-9_-]+/gi) ?? []).length;
  }

  const normalizedOutput = normalizeForDetection(output);
  for (const commId of partnerCommIds) {
    const memberId = commIdToMemberId.get(commId) ?? commId;
    if (referencedMemberIds.has(memberId)) continue;

    const pattern = createIdPattern(commId);
    if (pattern.test(normalizedOutput)) {
      referencedMemberIds.add(memberId);
    }
  }

  const coverage = {
    ratio: partnerCommIds.length > 0
      ? referencedMemberIds.size / partnerCommIds.length
      : 0,
    count: referencedMemberIds.size,
    total: partnerCommIds.length,
  };

  const specificity = {
    ratio: referencedMemberIds.size > 0
      ? Math.min(1, structuredCount / referencedMemberIds.size)
      : 0,
    structuredCount,
    quoteCount,
  };

  const overallQuality = coverage.ratio * 0.4 + specificity.ratio * 0.6;

  const allPartnerMemberIds = partnerCommIds.map(c => commIdToMemberId.get(c) ?? c);
  const missingPartners = allPartnerMemberIds.filter(id => !referencedMemberIds.has(id));

  return {
    referencedPartners: Array.from(referencedMemberIds),
    missingPartners,
    claimReferences,
    coverage,
    specificity,
    overallQuality,
    stanceSummary,
  };
}

function detectStance(
  output: string,
  targetId: string
): { stance: "agree" | "disagree" | "neutral" | "unknown"; confidence: number; source: "explicit" | "inferred" | "default" } {
  const explicitMatch = output.match(TOKEN_PATTERNS.stance);
  if (explicitMatch) {
    return {
      stance: explicitMatch[1].toLowerCase() as "agree" | "disagree" | "neutral" | "unknown",
      confidence: 1.0,
      source: "explicit",
    };
  }

  const contextPattern = new RegExp(
    `(.{0,50}${targetId}.{0,50}|.{0,50}REF\\(${targetId}\\).{0,50}|.{0,50}CLAIM\\(${targetId}:\\d+\\).{0,50})`,
    "gi"
  );
  const contextMatches = output.matchAll(contextPattern);

  for (const contextMatch of contextMatches) {
    const context = contextMatch[1];

    for (const pattern of AGREE_PATTERNS) {
      if (pattern.test(context)) {
        return { stance: "agree", confidence: 0.6, source: "inferred" };
      }
    }

    for (const pattern of DISAGREE_PATTERNS) {
      if (pattern.test(context)) {
        return { stance: "disagree", confidence: 0.6, source: "inferred" };
      }
    }
  }

  return { stance: "unknown", confidence: 0, source: "default" };
}

/**
 * 出力からフィールド抽出
 * @summary フィールド抽出
 * @param output 対象文字列
 * @param name フィールド名
 * @returns 抽出された値
 */
export function extractField(output: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = output.match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

/**
 * 通信IDエントリ作成
 * @summary IDエントリ作成
 * @param members メンバー配列
 * @param salt ソルト値
 * @returns 通信IDエントリ配列
 */
export function buildCommIdEntriesFromMembers(
  members: { id: string }[],
  salt = ""
): CommIdEntry[] {
  return resolveUniqueCommIds(members, salt);
}
