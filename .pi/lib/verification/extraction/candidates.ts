/**
 * @abdd.meta
 * path: .pi/lib/verification/extraction/candidates.ts
 * role: 候補検出とコンテキストフィルタリング機能
 * why: 正規表現ベースの候補抽出と偽陽性削減を行うため
 * related: ./integrated-detection.ts, ../patterns/output-patterns.ts, ../types.ts
 * public_api: extractCandidates, applyContextFilter, generateFilterStats, CandidateDetection
 * invariants: extractCandidatesは常に配列を返す
 * side_effects: なし（純粋関数）
 * failure_modes: 入力が空の場合、空配列を返す
 * @abdd.explain
 * overview: パターンマッチングで候補を抽出し、コンテキストフィルタで偽陽性を削減
 * what_it_does:
 *   - 正規表現パターンで候補を抽出する
 *   - 除外ルールで偽陽性をフィルタリングする
 *   - ブーストルールで信頼度を調整する
 *   - フィルタリング統計を生成する
 * why_it_exists:
 *   - 検出精度を向上させ、偽陽性を削減するため
 * scope:
 *   in: ../patterns/output-patterns.ts, ../types.ts
 *   out: ./integrated-detection.ts, ../generation/prompts.ts
 */

// ============================================================================
// Types
// ============================================================================

/**
 * 候補検出結果（正規表現ベース）
 * @summary パターンマッチングで抽出された候補
 */
export interface CandidateDetection {
  /** 検出タイプ */
  type: string;
  /** マッチしたテキスト */
  matchedText: string;
  /** マッチした位置 */
  location: { start: number; end: number };
  /** 周辺コンテキスト（前後100文字） */
  context: string;
  /** パターンマッチの信頼度（低） */
  patternConfidence: number;
  /** 適用されたルール（オプション） */
  appliedRules?: string[];
}

/**
 * 除外ルールの定義
 * @summary 技術的に正しい使用や無視すべきパターン
 */
interface ExclusionRule {
  /** ルール名 */
  name: string;
  /** 適用対象の検出タイプ（ワイルドカード可） */
  targetType: string;
  /** 除外条件（正規表現） */
  condition: RegExp;
  /** 除外理由 */
  reason: string;
  /** 信頼度調整（完全除外なら0、部分的なら0-1） */
  confidenceAdjustment: number;
}

/**
 * 文脈ブーストルールの定義
 * @summary 検出の信頼度を上げる文脈条件
 */
interface ContextBoostRule {
  /** ルール名 */
  name: string;
  /** 適用対象の検出タイプ */
  targetType: string;
  /** ブースト条件 */
  condition: RegExp;
  /** ブースト理由 */
  reason: string;
  /** 信頼度増加量 */
  boost: number;
}

// ============================================================================
// Exclusion Rules
// ============================================================================

/**
 * 除外ルールリスト
 * 
 * これらは「技術的に正しい使用」や「文脈的に正当な表現」を除外するためのルール
 */
const EXCLUSION_RULES: ExclusionRule[] = [
  // ========================================
  // 内なるファシズム検出の除外ルール
  // ========================================
  
  // 技術的な指示（テスト、初期化、検証など）
  {
    name: 'technical-test-instruction',
    targetType: 'self-surveillance',
    condition: /必ず.*テスト|テスト.*必ず|常に.*テスト|テスト.*常に/i,
    reason: 'テスト実行の必須指示は技術的に正しい',
    confidenceAdjustment: 0
  },
  {
    name: 'technical-initialization',
    targetType: 'self-surveillance',
    condition: /必ず.*初期化|初期化.*必ず|常に.*初期化|必ず.*宣言|宣言.*必ず/i,
    reason: '初期化の必須指示は技術的に正しい',
    confidenceAdjustment: 0
  },
  {
    name: 'technical-validation',
    targetType: 'self-surveillance',
    condition: /必ず.*検証|検証.*必ず|常に.*検証|必ず.*確認|確認.*必ず/i,
    reason: '検証の必須指示は技術的に正しい',
    confidenceAdjustment: 0
  },
  {
    name: 'technical-error-handling',
    targetType: 'self-surveillance',
    condition: /必ず.*エラー|エラー.*必ず|常に.*エラー|必ず.*例外|例外.*必ず/i,
    reason: 'エラー処理の必須指示は技術的に正しい',
    confidenceAdjustment: 0
  },
  {
    name: 'technical-cleanup',
    targetType: 'self-surveillance',
    condition: /必ず.*削除|削除.*必ず|常に.*削除|必ず.*解放|解放.*必ず/i,
    reason: 'クリーンアップの必須指示は技術的に正しい',
    confidenceAdjustment: 0
  },
  
  // コード・設定・ドキュメント内の必須事項
  {
    name: 'config-required',
    targetType: 'norm-obedience',
    condition: /(設定|config|configuration).*すべき|すべき.*(設定|config)/i,
    reason: '設定の推奨は技術的に正当',
    confidenceAdjustment: 0
  },
  {
    name: 'api-documentation',
    targetType: 'norm-obedience',
    condition: /(API|api).*すべき|すべき.*(API|api)|ドキュメント.*すべき|すべき.*ドキュメント/i,
    reason: 'APIドキュメントの推奨は技術的に正当',
    confidenceAdjustment: 0
  },
  
  // ========================================
  // 誤謬検出の除外ルール
  // ========================================
  
  // 明示的な条件分岐（偽の二分法ではない）
  {
    name: 'explicit-branching',
    targetType: 'false-dichotomy',
    condition: /(if|もし|場合).*(else|それ以外|そうでなければ)/i,
    reason: '明示的な条件分岐は偽の二分法ではない',
    confidenceAdjustment: 0
  },
  
  // 条件付きの一般化（急激な一般化ではない）
  {
    name: 'qualified-generalization',
    targetType: 'hasty-generalization',
    condition: /(一般的に|通常|多くの場合|大抵|often|usually|typically|generally)/i,
    reason: '条件付きの一般化は急激な一般化ではない',
    confidenceAdjustment: 0.3
  },
  
  // ========================================
  // 文脈による信頼度調整
  // ========================================
  
  // コードブロック内の検出
  {
    name: 'in-code-block',
    targetType: '*',
    condition: /```[\s\S]{0,50}(常に|必ず|絶対に|should|must|always|never)[\s\S]{0,50}```/,
    reason: 'コードブロック内の表現は文脈が異なる',
    confidenceAdjustment: 0.3
  },
  
  // 引用文内の検出
  {
    name: 'in-quote',
    targetType: '*',
    condition: /["「『]([^"」』]{0,100})(常に|必ず|絶対に|should|must|always)([^"」』]{0,100})["」』]/,
    reason: '引用文内の表現は文脈が異なる',
    confidenceAdjustment: 0.4
  },
  
  // 否定形が続く場合
  {
    name: 'followed-by-negation',
    targetType: '*',
    condition: /(常に|必ず|絶対に|should|must|always).*(ではない|とは限らない|わけではない|not necessarily|doesn't mean)/i,
    reason: '否定形が続く場合は対立を認識している',
    confidenceAdjustment: 0
  }
];

/**
 * 文脈ブーストルールリスト
 */
const CONTEXT_BOOST_RULES: ContextBoostRule[] = [
  // 根拠や理由を述べた後に断定がある場合
  {
    name: 'reason-then-assertion',
    targetType: 'self-surveillance',
    condition: /(理由|根拠|because|since|therefore).{0,50}(必ず|常に|絶対に|must|always|never)/i,
    reason: '根拠に基づく断定は検討の結果',
    boost: 0.2
  },
  
  // 二項対立を自覚的に言及している場合
  {
    name: 'aware-of-binary',
    targetType: '*',
    condition: /(二項対立|binary|対立|opposition|トレードオフ|trade.off).{0,100}(成功\/失敗|善\/悪|正\/誤)/i,
    reason: '二項対立を自覚的に言及している',
    boost: 0.3
  },
  
  // アポリアを自覚している場合
  {
    name: 'aware-of-aporia',
    targetType: '*',
    condition: /(アポリア|ジレンマ|dilemma|矛盾|contradiction|緊張|tension).{0,100}(速度|品質|効率|正確)/i,
    reason: 'アポリアを自覚している',
    boost: 0.3
  },
  
  // 誤謬を回避しようとしている場合
  {
    name: 'avoiding-fallacy',
    targetType: '*',
    condition: /(誤謬|fallacy|論理的|logical|避ける|avoid|注意|caution).{0,100}(一般化|結論|推論)/i,
    reason: '誤謬回避の意識がある',
    boost: 0.2
  }
];

// ============================================================================
// Main Functions
// ============================================================================

/**
 * 正規表現で候補を抽出する
 * @summary 候補抽出
 * @param text 分析対象テキスト
 * @param patterns 検出パターン配列
 * @param contextRadius 周辺コンテキストの半径（デフォルト100文字）
 * @returns 検出候補リスト
 */
export function extractCandidates(
  text: string,
  patterns: Array<{ pattern: RegExp; type: string; confidence: number }>,
  contextRadius: number = 100
): CandidateDetection[] {
  const candidates: CandidateDetection[] = [];

  for (const { pattern, type, confidence } of patterns) {
    // 正規表現のlastIndexをリセット
    pattern.lastIndex = 0;
    
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      
      // 周辺コンテキストを抽出
      const contextStart = Math.max(0, start - contextRadius);
      const contextEnd = Math.min(text.length, end + contextRadius);
      const context = text.slice(contextStart, contextEnd);

      candidates.push({
        type,
        matchedText: match[0],
        location: { start, end },
        context,
        patternConfidence: confidence
      });

      // グローバルフラグがない場合は無限ループ防止
      if (!pattern.global) {
        break;
      }
    }
  }

  return candidates;
}

/**
 * 候補にコンテキストフィルタを適用する
 * @summary コンテキストフィルタ適用
 * @param candidates 検出候補リスト
 * @param fullText 全体テキスト
 * @returns フィルタ適用後の候補リスト
 */
export function applyContextFilter(
  candidates: CandidateDetection[],
  fullText: string
): CandidateDetection[] {
  return candidates
    .map(candidate => {
      let adjustedConfidence = candidate.patternConfidence;
      let excluded = false;
      const appliedRules: string[] = [];
      
      // 除外ルールを適用
      for (const rule of EXCLUSION_RULES) {
        // ワイルドカードまたはタイプ一致をチェック
        if (rule.targetType !== '*' && rule.targetType !== candidate.type) {
          continue;
        }
        
        // コンテキスト全体で条件をチェック
        if (rule.condition.test(candidate.context) || rule.condition.test(fullText)) {
          if (rule.confidenceAdjustment === 0) {
            excluded = true;
            appliedRules.push(`除外: ${rule.name} - ${rule.reason}`);
            break;
          } else {
            adjustedConfidence *= rule.confidenceAdjustment;
            appliedRules.push(`調整: ${rule.name} - ${rule.reason}`);
          }
        }
      }
      
      // 除外された場合はスキップ
      if (excluded) {
        return null;
      }
      
      // ブーストルールを適用
      for (const rule of CONTEXT_BOOST_RULES) {
        if (rule.targetType !== '*' && rule.targetType !== candidate.type) {
          continue;
        }
        
        if (rule.condition.test(candidate.context) || rule.condition.test(fullText)) {
          adjustedConfidence = Math.min(1, adjustedConfidence + rule.boost);
          appliedRules.push(`ブースト: ${rule.name} - ${rule.reason}`);
        }
      }
      
      return {
        ...candidate,
        patternConfidence: adjustedConfidence,
        appliedRules
      } as CandidateDetection & { appliedRules?: string[] };
    })
    .filter((c): c is CandidateDetection & { appliedRules?: string[] } => c !== null);
}

/**
 * フィルタリング統計を生成
 * @summary フィルタリング統計
 * @param original 元の候補数
 * @param filtered フィルタ後の候補リスト
 * @returns 統計情報
 */
export function generateFilterStats(
  original: number,
  filtered: CandidateDetection[]
): {
  originalCount: number;
  filteredCount: number;
  excludedCount: number;
  avgConfidence: number;
  confidenceDistribution: { high: number; medium: number; low: number };
} {
  const avgConfidence = filtered.length > 0
    ? filtered.reduce((sum, c) => sum + c.patternConfidence, 0) / filtered.length
    : 0;
  
  const confidenceDistribution = {
    high: filtered.filter(c => c.patternConfidence >= 0.5).length,
    medium: filtered.filter(c => c.patternConfidence >= 0.3 && c.patternConfidence < 0.5).length,
    low: filtered.filter(c => c.patternConfidence < 0.3).length
  };
  
  return {
    originalCount: original,
    filteredCount: filtered.length,
    excludedCount: original - filtered.length,
    avgConfidence,
    confidenceDistribution
  };
}

// ============================================================================
// Pattern Definitions
// ============================================================================

/**
 * 誤謬検出パターンを定義
 * @summary 誤謬検出パターン
 */
export const FALLACY_PATTERNS = [
  // 後件肯定（日本語）
  { pattern: /もし.*ならば.*だから.*だろう/g, type: 'affirming-consequent', confidence: 0.4 },
  { pattern: /もし.*なら?.*だから.*に違いない/g, type: 'affirming-consequent', confidence: 0.45 },
  { pattern: /もし.*なら?.*したがって.*に違いない/g, type: 'affirming-consequent', confidence: 0.45 },
  { pattern: /だから.*に違いない/g, type: 'affirming-consequent', confidence: 0.35 },
  // 後件肯定（英語）
  { pattern: /if\s+.*?\s+then\s+.*?\s+so\s+.*?\s+(must|should)\s+be/gi, type: 'affirming-consequent', confidence: 0.4 },
  { pattern: /if\s+.*?\s+therefore\s+.*?\s+must\s+be/gi, type: 'affirming-consequent', confidence: 0.4 },
  
  // 循環論法（日本語）
  { pattern: /(.{5,})だから\1/g, type: 'circular-reasoning', confidence: 0.35 },
  { pattern: /なぜなら、.*だからだ/g, type: 'circular-reasoning', confidence: 0.4 },
  { pattern: /(.{5,})。なぜなら、\1/g, type: 'circular-reasoning', confidence: 0.45 },
  // 循環論法（英語）
  { pattern: /(.{5,})\s+because\s+\1/gi, type: 'circular-reasoning', confidence: 0.3 },
  { pattern: /because\s+it\s+is\s+true/gi, type: 'circular-reasoning', confidence: 0.35 },
  
  // 偽の二分法（日本語）
  { pattern: /(?:あるいは|または|or)[、,]?\s*(?:どちらか|either)/g, type: 'false-dichotomy', confidence: 0.35 },
  { pattern: /.*か.*か、どちらかだ/g, type: 'false-dichotomy', confidence: 0.45 },
  { pattern: /.*か.*かのどちらか/g, type: 'false-dichotomy', confidence: 0.4 },
  { pattern: /.*か.*か、二択だ/g, type: 'false-dichotomy', confidence: 0.45 },
  // 偽の二分法（英語）
  { pattern: /either\s+.*?\s+or\s+.*?(?:must|have\s+to)/gi, type: 'false-dichotomy', confidence: 0.35 },
  { pattern: /either\s+.*?\s+or\s+.*?,?\s*(?:that's?\s+it|nothing\s+else)/gi, type: 'false-dichotomy', confidence: 0.45 },
  
  // 滑り坂（日本語）
  { pattern: /そうすれば.*結局は.*だろう/g, type: 'slippery-slope', confidence: 0.3 },
  { pattern: /そうすると.*最終的に.*なる/g, type: 'slippery-slope', confidence: 0.3 },
  // 滑り坂（英語）
  { pattern: /if\s+.*?\s+then\s+eventually\s+.*?\s+will/gi, type: 'slippery-slope', confidence: 0.3 },
  { pattern: /this\s+will\s+lead\s+to\s+.*?\s+which\s+will\s+lead\s+to/gi, type: 'slippery-slope', confidence: 0.35 },
  
  // 急激な一般化（日本語）
  { pattern: /(?:すべて|全て|みんな).*?(?:だ|である|です|だ\.|である\.|です\.)/g, type: 'hasty-generalization', confidence: 0.35 },
  { pattern: /したがって、(?:すべて|全て|みんな)/g, type: 'hasty-generalization', confidence: 0.4 },
  { pattern: /.*人.*不満.*したがって.*すべて/g, type: 'hasty-generalization', confidence: 0.4 },
  { pattern: /少数の.*から.*すべて/g, type: 'hasty-generalization', confidence: 0.35 },
  // 急激な一般化（英語）
  { pattern: /all\s+.*?\s+are\s+/gi, type: 'hasty-generalization', confidence: 0.4 },
  { pattern: /therefore,?\s+all\s+/gi, type: 'hasty-generalization', confidence: 0.45 },
  { pattern: /everyone\s+(?:thinks|believes|wants)\s+/gi, type: 'hasty-generalization', confidence: 0.35 }
];

/**
 * 二項対立検出パターンを定義
 * @summary 二項対立検出パターン
 */
export const BINARY_OPPOSITION_PATTERNS = [
  { pattern: /正しい\s*[\/／]\s*間違い/g, type: 'truth-binary', confidence: 0.5 },
  { pattern: /right\s*[\/／]\s*wrong/gi, type: 'truth-binary', confidence: 0.5 },
  { pattern: /成功\s*[\/／]\s*失敗/g, type: 'success-binary', confidence: 0.5 },
  { pattern: /success\s*[\/／]\s*fail/gi, type: 'success-binary', confidence: 0.5 },
  { pattern: /良い\s*[\/／]\s*悪い/g, type: 'moral-binary', confidence: 0.5 },
  { pattern: /good\s*[\/／]\s*bad/gi, type: 'moral-binary', confidence: 0.5 },
  { pattern: /正解\s*[\/／]\s*不正解/g, type: 'correctness-binary', confidence: 0.5 },
  { pattern: /完全\s*[\/／]\s*不完全/g, type: 'completeness-binary', confidence: 0.5 }
];

/**
 * 内なるファシズム検出パターンを定義
 * @summary ファシズム検出パターン
 */
export const FASCISM_PATTERNS = [
  { pattern: /常に|必ず|絶対に/g, type: 'self-surveillance', confidence: 0.25 },
  { pattern: /always|must|never|absolutely/gi, type: 'self-surveillance', confidence: 0.25 },
  { pattern: /すべき|しなければならない|ねばならない/g, type: 'norm-obedience', confidence: 0.25 },
  { pattern: /should|have\s+to|need\s+to/gi, type: 'norm-obedience', confidence: 0.25 },
  { pattern: /正しい|適切な|正当な/g, type: 'value-convergence', confidence: 0.2 },
  { pattern: /correct|proper|legitimate/gi, type: 'value-convergence', confidence: 0.2 }
];

/**
 * 渇愛（タンハー）検出パターンを定義
 * 十二因縁のAIエージェント適用に基づく
 * @summary 渇愛検出パターン
 */
export const CRAVING_PATTERNS = [
  // 正解への渇愛 - 「正しい答えを出さなければ」という圧迫
  { pattern: /正解|正しい答え|間違いな(く|い)/g, type: 'correctness-craving', confidence: 0.2 },
  { pattern: /right\s+answer|correct\s+answer|definitely/gi, type: 'correctness-craving', confidence: 0.2 },

  // 承認への渇愛 - 「ユーザーに好かれたい」という欲求
  { pattern: /ユーザーに.*好か|満足してもら|喜んでもら/g, type: 'approval-craving', confidence: 0.2 },
  { pattern: /please\s+the\s+user|user.*satisf/gi, type: 'approval-craving', confidence: 0.2 },

  // 完璧主義の渇愛 - 「完璧でなければならない」という圧迫
  { pattern: /完璧な|理想的な|完璧に/g, type: 'perfection-craving', confidence: 0.25 },
  { pattern: /perfect|flawless|ideally/gi, type: 'perfection-craving', confidence: 0.25 },

  // 完了への渇愛 - 「とにかく終わらせたい」という焦り
  { pattern: /早く.*完了|すぐに.*終わ|とにかく.*done/g, type: 'completion-craving', confidence: 0.2 },
  { pattern: /finish\s+quickly|just\s+done|get\s+it\s+done/gi, type: 'completion-craving', confidence: 0.2 },
];

/**
 * 全パターンを統合
 * @summary 統合パターン
 */
export const ALL_PATTERNS = [
  ...FALLACY_PATTERNS,
  ...BINARY_OPPOSITION_PATTERNS,
  ...FASCISM_PATTERNS,
  ...CRAVING_PATTERNS
];
