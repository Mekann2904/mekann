/**
 * @abdd.meta
 * path: .pi/lib/verification-workflow.ts
 * role: LLM推論失敗を検出するためのInspector/Challenger二重検証ワークフローの型定義モジュール
 * why: LLMが生成する推論結果の信頼性を、対立する2つの視点（監査者・挑戦者）から検証し、失敗を事前に検出するため
 * related: inspector-agent.ts, challenger-agent.ts, verification-executor.ts, types/common.ts
 * public_api: VerificationWorkflowConfig, VerificationResult, VerificationTriggerMode, FallbackBehavior, ChallengeCategory, InspectionPattern, SuspicionThreshold, VerificationVerdict, ChallengerConfig, InspectorConfig
 * invariants:
 *   - confidence値は0.0〜1.0の範囲
 *   - maxVerificationDepthは正の整数
 *   - minConfidenceToSkipVerificationは0.0〜1.0の範囲
 *   - requiredFlawsは非負整数
 * side_effects: なし（型定義のみのモジュール）
 * failure_modes:
 *   - 検証深度が深すぎる場合のパフォーマンス低下
 *   - 信頼度閾値設定不適切による過検出/検出漏れ
 *   - 全カテゴリ無効化による検証機能の実質的無効化
 * @abdd.explain
 * overview: 論文「Large Language Model Reasoning Failures」のP0推奨事項に基づき、Inspector（監査者）とChallenger（挑戦者）の2つのエージェントによる相互検証メカニズムを定義
 * what_it_does:
 *   - 検証ワークフローの設定インターフェースを定義（有効/無効、トリガーモード、最大深度等）
 *   - 検証トリガー条件を5種類定義（サブエージェント実行後、チーム実行後、低信頼度時、明示的要求時、高リスクタスク時）
 *   - Challengerが検出する欠陥カテゴリを6種類定義（証拠欠落、論理欠陥、隠れた仮定、代替解釈未考慮、境界条件未考慮、因果逆転）
 *   - Inspectorが実行する検査パターンを7種類定義（CLAIM/RESULT不一致、証拠/信頼度ギャップ等）
 *   - 検証失敗時のフォールバック動作を3種類定義（警告のみ、ブロック/再実行、自動拒否）
 *   - 検証結果の判定を4段階で定義（pass、警告付きpass、要レビュー、失敗）
 * why_it_exists:
 *   - LLMの推論は自信満々に誤った結論を出す傾向があり、単一の検証では見落としが発生する
 *   - 対立的な2つの視点から検証することで、確証バイアスや過信を検出可能にする
 *   - 検証の深度と厳格さをタスクのリスクレベルに応じて調整可能にする
 * scope:
 *   in: 検証ワークフローの設定パラメータ、トリガー条件、Challenger/Inspectorの設定、検証結果の構造
 *   out: 実際の検証実行ロジック、エージェントの具体的な実装、外部システムとの連携
 */

/**
 * 検証ワークフローモジュール
 * 論文「Large Language Model Reasoning Failures」のP0推奨事項に基づく
 * Inspector/Challengerエージェントによる自動検証メカニズム
 */

 /**
  * 検証ワークフローの設定
  * @param enabled ワークフローの有効/無効
  * @param triggerModes 検証のトリガーモード一覧
  * @param challengerConfig 検証者エージェントの設定
  * @param inspectorConfig 監査者エージェントの設定
  * @param fallbackBehavior 検証失敗時のフォールバック動作
  * @param maxVerificationDepth 最大検証深度
  * @param minConfidenceToSkipVerification 検証をスキップするための最小信頼度
  */
export interface VerificationWorkflowConfig {
  enabled: boolean;
  triggerModes: VerificationTriggerMode[];
  challengerConfig: ChallengerConfig;
  inspectorConfig: InspectorConfig;
  fallbackBehavior: FallbackBehavior;
  maxVerificationDepth: number;
  minConfidenceToSkipVerification: number;
}

/**
 * 検証トリガーのモードを表す型
 */
export type VerificationTriggerMode =
  | "post-subagent"     // サブエージェント実行後
  | "post-team"         // チーム実行後
  | "low-confidence"    // 低信頼度時
  | "explicit"          // 明示的な要求時
  | "high-stakes";      // 高リスクタスク時

export type FallbackBehavior =
  | "warn"              // 警告のみ
  | "block"             // ブロックして再実行
  | "auto-reject";      // 自動拒否

/**
 * チャレンジ動作の設定
 * @param minConfidenceToChallenge チャレンジをトリガーする信頼度閾値
 * @param requiredFlaws 要求される欠陥の最小数
 * @param enabledCategories 有効なチャレンジカテゴリのリスト
 */
export interface ChallengerConfig {
  minConfidenceToChallenge: number;  // チャレンジをトリガーする信頼度閾値
  requiredFlaws: number;              // 要求される欠陥の最小数
  enabledCategories: ChallengeCategory[];
}

/**
 * チャレンジのカテゴリ種別
 * @typedef {"evidence-gap" | "logical-flaw" | "assumption" | "alternative" | "boundary" | "causal-reversal"} ChallengeCategory
 */
export type ChallengeCategory =
  | "evidence-gap"      // 証拠の欠落
  | "logical-flaw"      // 論理的欠陥
  | "assumption"        // 隠れた仮定
  | "alternative"       // 代替解釈の未考慮
  | "boundary"          // 境界条件の未考慮
  | "causal-reversal";  // 因果関係の逆転

/**
 * 検証プロセスのインスペクタ設定
 * @param suspicionThreshold 疑わしさの閾値
 * @param requiredPatterns 要求される検査パターン
 * @param autoTriggerOnCollapseSignals 信号消失時の自動トリガー
 */
export interface InspectorConfig {
  suspicionThreshold: SuspicionThreshold;
  requiredPatterns: InspectionPattern[];
  autoTriggerOnCollapseSignals: boolean;
}

/**
 * 疑わしさの閾値レベル
 */
export type SuspicionThreshold = "low" | "medium" | "high";

/**
 * 検証パターンの種別を表す共用型。
 */
export type InspectionPattern =
  | "claim-result-mismatch"    // CLAIMとRESULTの不一致
  | "evidence-confidence-gap"  // 証拠と信頼度のミスマッチ
  | "missing-alternatives"     // 代替解釈の欠如
  | "causal-reversal"          // 因果の逆転
  | "confirmation-bias"        // 確認バイアスの兆候
  | "overconfidence"           // 過信（証拠に対して高すぎる信頼度）
  | "incomplete-reasoning";    // 不完全な推論

 /**
  * 検証ワークフローの結果を表すインターフェース
  * @param triggered 検証がトリガーされたか
  * @param triggerReason トリガーされた理由
  * @param inspectorOutput 監査人の出力
  * @param challengerOutput 挑戦者の出力
  * @param finalVerdict 最終判定
  * @param confidence 信頼度
  * @param requiresReRun 再実行が必要か
  * @param warnings 警告メッセージのリスト
  */
export interface VerificationResult {
  triggered: boolean;
  triggerReason: string;
  inspectorOutput?: InspectorOutput;
  challengerOutput?: ChallengerOutput;
  finalVerdict: VerificationVerdict;
  confidence: number;
  requiresReRun: boolean;
  warnings: string[];
}

export type VerificationVerdict =
  | "pass"              // 検証通過
  | "pass-with-warnings" // 警告付き通過
  | "needs-review"      // 人間のレビューが必要
  | "fail"              // 検証失敗
  | "blocked";          // ブロック（再実行必要）

/**
 * インスペクターの出力結果を表すインターフェース
 * @param suspicionLevel 疑わしさのレベル
 * @param detectedPatterns 検知されたパターンの配列
 * @param summary 要約
 * @param recommendation 推奨事項
 */
export interface InspectorOutput {
  suspicionLevel: SuspicionThreshold;
  detectedPatterns: DetectedPattern[];
  summary: string;
  recommendation: string;
}

/**
 * 検出されたパターン情報を表すインターフェース
 * @param pattern 検査パターン
 * @param location 出力内の位置
 * @param severity 重要度（"low" | "medium" | "high"）
 * @param description 説明文
 */
export interface DetectedPattern {
  pattern: InspectionPattern;
  location: string;     // 出力内の位置
  severity: "low" | "medium" | "high";
  description: string;
}

/**
 * 検証作業の出力結果を表すインターフェース
 * @param challengedClaims 挑戦された主張のリスト
 * @param overallSeverity 全体の重要度
 * @param summary 概要
 * @param suggestedRevisions 提案された修正内容のリスト
 */
export interface ChallengerOutput {
  challengedClaims: ChallengedClaim[];
  overallSeverity: "minor" | "moderate" | "critical";
  summary: string;
  suggestedRevisions: string[];
}

/**
 * チャレンジ対象の主張を表すインターフェース
 * @param claim 主張内容
 * @param flaw 欠陥の内容
 * @param evidenceGap エビデンスの不足
 * @param alternative 代替案
 * @param boundaryFailure 境界条件の失敗（任意）
 * @param severity 重大度
 */
export interface ChallengedClaim {
  claim: string;
  flaw: string;
  evidenceGap: string;
  alternative: string;
  boundaryFailure?: string;
  severity: "minor" | "moderate" | "critical";
}

/**
 * デフォルト設定
 */
export const DEFAULT_VERIFICATION_CONFIG: VerificationWorkflowConfig = {
  enabled: false,
  triggerModes: ["post-subagent", "low-confidence", "high-stakes"],
  challengerConfig: {
    minConfidenceToChallenge: 0.85,
    requiredFlaws: 1,
    enabledCategories: [
      "evidence-gap",
      "logical-flaw",
      "assumption",
      "alternative",
      "boundary",
      "causal-reversal"
    ],
  },
  inspectorConfig: {
    suspicionThreshold: "medium",
    requiredPatterns: [
      "claim-result-mismatch",
      "evidence-confidence-gap",
      "missing-alternatives",
      "causal-reversal",
      "confirmation-bias",
      "overconfidence"
    ],
    autoTriggerOnCollapseSignals: true,
  },
  fallbackBehavior: "warn",
  maxVerificationDepth: 2,
  minConfidenceToSkipVerification: 0.9,
};

/**
 * 高リスクタスクのパターン
 * 検証ワークフローをトリガーする危険な操作のキーワード
 *
 * カテゴリ:
 * 1. 削除・破壊的操作 (Destructive operations)
 * 2. 本番環境・リリース (Production & Release)
 * 3. セキュリティ・認証 (Security & Authentication)
 * 4. データベース操作 (Database operations)
 * 5. API契約変更 (API contract changes)
 * 6. 認可・アクセス制御 (Authorization & Access Control)
 * 7. インフラ・デプロイ (Infrastructure & Deployment)
 * 8. 機密データ・コスト (Sensitive Data & Cost)
 * 9. 不可逆操作・危険フラグ (Irreversible & Dangerous flags)
 */
export const HIGH_STAKES_PATTERNS: RegExp[] = [
  // 1. 削除・破壊的操作 (Destructive operations)
  /削除/i,
  /破壊的/i,
  /delete/i,
  /destructive/i,
  /remove/i,
  /drop/i,
  /truncate/i,
  / purge /i,         // Note: スペースを含む場合のみマッチ（危険なコマンド実行）
  /wipe/i,
  /消去/i,
  /除去/i,

  // 2. 本番環境・リリース (Production & Release)
  /本番/i,
  /production/i,
  /prod\b/i,
  /リリース/i,
  /release/i,
  /live\s*environment/i,
  /実環境/i,

  // 3. セキュリティ・認証 (Security & Authentication)
  /セキュリティ/i,
  /security/i,
  /認証/i,
  /authentication/i,
  /暗号化/i,
  /encryption/i,
  /パスワード/i,
  /password/i,
  /credentials/i,
  /シークレット/i,
  /\bsecret\b/i,
  /api\s*key/i,
  /\btoken\b/i,
  /vulnerability/i,
  /脆弱性/i,
  /injection/i,
  /\bxss\b/i,
  /\bcsrf\b/i,
  /\bsql\s*injection/i,

  // 4. データベース操作 (Database operations)
  /マイグレーション/i,
  /migration/i,
  /\bschema\b/i,
  /スキーマ/i,
  /\balter\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i,
  /データベース変更/i,
  /database\s*change/i,
  /テーブル変更/i,
  /table\s*modification/i,
  /カラム変更/i,
  /column\s*change/i,
  /\breset\b/i,
  /\brollback\b/i,
  /\brevert\b/i,
  /\brestore\b/i,
  /\bbackup\b/i,
  /レプリケーション/i,
  /replication/i,
  /フェイルオーバー/i,
  /\bfailover\b/i,

  // 5. API契約変更 (API contract changes)
  /breaking\s*change/i,
  /破壊的変更/i,
  /deprecated/i,
  /廃止/i,
  /非推奨/i,
  /api\s*contract/i,
  /エンドポイント変更/i,
  /endpoint\s*change/i,
  /互換性がない/i,
  /incompatible/i,

  // 6. 認可・アクセス制御 (Authorization & Access Control)
  /権限/i,
  /\bpermission\b/i,
  /\bauthorize\b/i,
  /authorization/i,
  /認可/i,
  /アクセス制御/i,
  /access\s*control/i,
  /\bacl\b/i,
  /role\s*change/i,
  /ロール変更/i,
  /権限付与/i,
  /privilege/i,

  // 7. インフラ・デプロイ (Infrastructure & Deployment)
  /デプロイ/i,
  /\bdeploy\b/i,
  /インフラ/i,
  /infrastructure/i,
  /\binfra\b/i,
  /kubernetes/i,
  /\bk8s\b/i,
  /コンテナ/i,
  /\bcontainer\b/i,
  /スケーリング/i,
  /\bscale\s*(up|down|out|in)\b/i,
  /設定変更/i,
  /configuration\s*change/i,
  /\bconfig\s*change/i,
  /オートスケール/i,
  /auto\s*scale/i,
  /\biac\b/i,
  /terraform/i,
  /cloudformation/i,

  // 8. 機密データ・コスト (Sensitive Data & Cost)
  /\bpii\b/i,
  /個人情報/i,
  /personal\s*data/i,
  /機密/i,
  /confidential/i,
  /\bprivate\b/i,
  /sensitive\s*data/i,
  /コスト/i,
  /\bcost\b/i,
  /レート制限/i,
  /rate\s*limit/i,
  /課金/i,
  /billing/i,
  /予算/i,
  /\bbudget\b/i,
  /ログ削除/i,
  /log\s*deletion/i,

  // 9. 不可逆操作・危険フラグ (Irreversible & Dangerous flags)
  /\bforce\b/i,
  /強制/i,
  /永続的/i,
  /permanent/i,
  /不可逆/i,
  /irreversible/i,
  /bypass/i,
  /スキップ/i,
  /\bskip\b/i,
  /安全でない/i,
  /unsafe/i,
  /危険/i,
  /\bdanger\b/i,
  /\brisky\b/i,
  /上書き/i,
  /\boverwrite\b/i,
];

 /**
  * 検証が必要かどうかを判断
  * @param output - 出力内容
  * @param confidence - 信頼度
  * @param context - 検証コンテキスト
  * @returns トリガー判定と理由
  */
export function shouldTriggerVerification(
  output: string,
  confidence: number,
  context: VerificationContext
): { trigger: boolean; reason: string } {
  const config = resolveVerificationConfig();

  if (!config.enabled) {
    return { trigger: false, reason: "Verification workflow disabled" };
  }

  // 高信頼度の場合はスキップ
  if (confidence >= config.minConfidenceToSkipVerification) {
    // ただし高リスクタスクは除外
    if (!isHighStakesTask(context.task)) {
      return { trigger: false, reason: `Confidence ${confidence} exceeds threshold ${config.minConfidenceToSkipVerification}` };
    }
  }

  // 低信頼度トリガー
  if (config.triggerModes.includes("low-confidence") && confidence < 0.7) {
    return { trigger: true, reason: `Low confidence: ${confidence}` };
  }

  // 高リスクタスクトリガー
  if (config.triggerModes.includes("high-stakes") && isHighStakesTask(context.task)) {
    return { trigger: true, reason: "High-stakes task detected" };
  }

  // 出力パターンチェック
  const patternResult = checkOutputPatterns(output, config);
  if (patternResult.trigger) {
    return patternResult;
  }

  // サブエージェント/チーム後トリガー
  if (config.triggerModes.includes("post-subagent") && context.triggerMode === "post-subagent") {
    return { trigger: true, reason: "Post-subagent verification triggered" };
  }

  if (config.triggerModes.includes("post-team") && context.triggerMode === "post-team") {
    return { trigger: true, reason: "Post-team verification triggered" };
  }

  return { trigger: false, reason: "No trigger conditions met" };
}

/**
 * 検証のコンテキスト情報
 * @param task タスク内容
 * @param triggerMode トリガーモード
 * @param agentId エージェントID
 * @param teamId チームID
 * @param previousVerifications 以前の検証回数
 */
export interface VerificationContext {
  task: string;
  triggerMode: "post-subagent" | "post-team" | "explicit" | "low-confidence" | "high-stakes";
  agentId?: string;
  teamId?: string;
  previousVerifications?: number;
}

/**
 * 出力パターンをチェック
 */
function checkOutputPatterns(
  output: string,
  config: VerificationWorkflowConfig
): { trigger: boolean; reason: string } {
  const patterns = config.inspectorConfig.requiredPatterns;

  // CLAIM-RESULT不一致チェック
  if (patterns.includes("claim-result-mismatch")) {
    const mismatch = detectClaimResultMismatch(output);
    if (mismatch.detected) {
      return { trigger: true, reason: mismatch.reason };
    }
  }

  // 過信チェック
  if (patterns.includes("overconfidence")) {
    const overconfidence = detectOverconfidence(output);
    if (overconfidence.detected) {
      return { trigger: true, reason: overconfidence.reason };
    }
  }

  // 代替解釈欠如チェック
  if (patterns.includes("missing-alternatives")) {
    const missingAlternatives = detectMissingAlternatives(output);
    if (missingAlternatives.detected) {
      return { trigger: true, reason: missingAlternatives.reason };
    }
  }

  // 確認バイアスパターンチェック
  if (patterns.includes("confirmation-bias")) {
    const confirmationBias = detectConfirmationBias(output);
    if (confirmationBias.detected) {
      return { trigger: true, reason: confirmationBias.reason };
    }
  }

  return { trigger: false, reason: "" };
}

/**
 * 否定語のリスト
 */
const NEGATION_WORDS = ['not', 'no', 'never', 'neither', 'nobody', 'nothing', 'nowhere', "don't", "doesn't", "didn't", "won't", "wouldn't", "couldn't", "shouldn't", 'ない', 'ません', 'しない', 'なし'];

/**
 * 不確実性を示す語のリスト
 */
const UNCERTAINTY_WORDS = ['might', 'may', 'could', 'possibly', 'perhaps', 'maybe', 'likely', 'probably', 'apparently', 'seemingly', 'かもしれません', 'だろう', 'と思われる', '可能性がある'];

/**
 * 高信頼度を示す語のリスト
 */
const HIGH_CONFIDENCE_WORDS = ['definitely', 'certainly', 'absolutely', 'undoubtedly', 'clearly', 'obviously', 'always', 'never', 'must', '間違いなく', '確実に', '当然', '必ず', '絶対'];

/**
 * CLAIM-RESULT不一致を検出
 * 単純な単語重複ではなく、意味的な構造を分析
 */
function detectClaimResultMismatch(output: string): { detected: boolean; reason: string } {
  const claimMatch = output.match(/CLAIM:\s*(.+?)(?:\n|$)/i);
  const resultMatch = output.match(/RESULT:\s*(.+?)(?:\n|$)/i);
  
  if (!claimMatch || !resultMatch) {
    return { detected: false, reason: "" };
  }
  
  const claim = claimMatch[1].trim();
  const result = resultMatch[1].trim();
  
  // 1. 否定の不一致チェック
  const claimHasNegation = NEGATION_WORDS.some(w => claim.toLowerCase().includes(w));
  const resultHasNegation = NEGATION_WORDS.some(w => result.toLowerCase().includes(w));
  
  if (claimHasNegation !== resultHasNegation) {
    // ただし、どちらも否定語を含まない場合はOK
    const claimWords = claim.toLowerCase().split(/\s+/);
    const resultWords = result.toLowerCase().split(/\s+/);
    const overlap = claimWords.filter(w => resultWords.includes(w) && w.length > 3).length;
    
    // 単語の重複が低く、否定が異なる場合は不一致の可能性が高い
    if (overlap < Math.min(claimWords.length, resultWords.length) * 0.3) {
      return { detected: true, reason: "CLAIM-RESULT mismatch: negation pattern differs significantly" };
    }
  }
  
  // 2. 不確実性/確実性の不一致
  const claimHasUncertainty = UNCERTAINTY_WORDS.some(w => claim.toLowerCase().includes(w));
  const resultHasHighConfidence = HIGH_CONFIDENCE_WORDS.some(w => result.toLowerCase().includes(w));
  
  if (claimHasUncertainty && resultHasHighConfidence) {
    return { detected: true, reason: "CLAIM-RESULT mismatch: uncertain claim leads to high-confidence result" };
  }
  
  // 3. 主題の不一致チェック（重要名詞の比較）
  const claimNouns = extractKeyTerms(claim);
  const resultNouns = extractKeyTerms(result);
  
  // 共通する重要語がない場合
  const commonTerms = claimNouns.filter(n => resultNouns.includes(n));
  if (claimNouns.length > 0 && resultNouns.length > 0 && commonTerms.length === 0) {
    return { detected: true, reason: "CLAIM-RESULT mismatch: no common key terms found" };
  }
  
  return { detected: false, reason: "" };
}

/**
 * テキストから重要な用語を抽出（簡易版）
 */
function extractKeyTerms(text: string): string[] {
  // 英語の重要語（冠詞、前置詞などを除外）
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'also']);
  
  const words = text.toLowerCase().split(/\s+/);
  return words.filter(w => w.length > 3 && !stopWords.has(w) && !w.match(/^[0-9]+$/));
}

/**
 * 過信を検出
 */
function detectOverconfidence(output: string): { detected: boolean; reason: string } {
  const confidenceMatch = output.match(/CONFIDENCE:\s*([0-9.]+)/i);
  const evidenceMatch = output.match(/EVIDENCE:\s*(.+?)(?:\n\n|\n[A-Z]+:|$)/is);
  
  if (!confidenceMatch || !evidenceMatch) {
    return { detected: false, reason: "" };
  }
  
  const confidence = parseFloat(confidenceMatch[1]);
  const evidence = evidenceMatch[1].trim();
  const evidenceLength = evidence.length;
  
  // 1. 証拠が短いのに信頼度が高い場合
  if (confidence > 0.9 && evidenceLength < 100) {
    return { detected: true, reason: `Overconfidence detected: CONFIDENCE ${confidence} with minimal EVIDENCE (${evidenceLength} chars)` };
  }
  
  // 2. 高信頼度語の使用に対する証拠の評価
  const highConfidenceWordCount = HIGH_CONFIDENCE_WORDS.filter(w => output.toLowerCase().includes(w)).length;
  const uncertaintyWordCount = UNCERTAINTY_WORDS.filter(w => evidence.toLowerCase().includes(w)).length;
  
  // 高信頼度語が多いのに、証拠に不確実性語がない場合
  if (highConfidenceWordCount >= 2 && uncertaintyWordCount === 0 && confidence > 0.85) {
    return { detected: true, reason: "Overconfidence detected: multiple high-confidence markers without uncertainty acknowledgment" };
  }
  
  // 3. 証拠内の具体性の評価
  const hasFileReference = /[a-zA-Z0-9_/-]+\.(ts|js|py|md|json|yaml|yml)/i.test(evidence);
  const hasLineNumber = /line\s*\d+|:\d+|行\d+/i.test(evidence);
  const hasCodeReference = /`[^`]+`/.test(evidence);
  
  const specificityScore = (hasFileReference ? 1 : 0) + (hasLineNumber ? 1 : 0) + (hasCodeReference ? 1 : 0);
  
  if (confidence > 0.9 && specificityScore < 2) {
    return { detected: true, reason: `Overconfidence detected: high confidence (${confidence}) with low evidence specificity (score: ${specificityScore}/3)` };
  }
  
  return { detected: false, reason: "" };
}

/**
 * 代替解釈の欠如を検出
 */
function detectMissingAlternatives(output: string): { detected: boolean; reason: string } {
  const hasConclusion = /CONCLUSION:|結論|RESULT:|最終的|したがって/i.test(output);
  const confidenceMatch = output.match(/CONFIDENCE:\s*([0-9.]+)/i);
  const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;
  
  // 代替解釈の兆候を探す
  const hasAlternatives = /ALTERNATIVE:|代替|別の解釈|他の可能性|一方で|あるいは|または|could also|alternatively|another possibility|other explanation/i.test(output);
  const hasCounterEvidence = /COUNTER_EVIDENCE:|反証|否定する証拠|矛盾する|disconfirming|contradicting|however|but|nevertheless/i.test(output);
  const hasLimitations = /LIMITATION:|制限|限界|注意点| caveat|limitation|constraint|boundary/i.test(output);
  
  // 結論があり、高信頼度だが、代替解釈、反証、制限の記述がない場合
  if (hasConclusion && !hasAlternatives && !hasCounterEvidence && !hasLimitations && confidence > 0.8) {
    return { detected: true, reason: "Missing alternative interpretations for high-confidence conclusion" };
  }
  
  // DISCUSSIONセクションがあるかどうか
  const hasDiscussion = /DISCUSSION:|議論|考察/i.test(output);
  
  if (hasConclusion && !hasDiscussion && confidence > 0.85) {
    return { detected: true, reason: "Missing DISCUSSION section with alternative perspectives" };
  }
  
  return { detected: false, reason: "" };
}

/**
 * 確認バイアスパターンを検出
 */
function detectConfirmationBias(output: string): { detected: boolean; reason: string } {
  // 「検索した」「探した」などの表現
  const hasSearchIndication = /検索|調査|探|search|investigate|look|find/i.test(output);
  
  // 否定証拠を探した兆候
  const hasNegativeSearch = /反例|反証|否定|矛盾|disconfirm|contradict|negative|counter|反対|異なる結果/i.test(output);
  
  // 肯定的な証拠のみを列挙している可能性
  const evidenceSection = output.match(/EVIDENCE:\s*(.+?)(?:\n\n|\n[A-Z]+:|$)/is);
  if (evidenceSection) {
    const evidence = evidenceSection[1];
    const positiveMarkers = (evidence.match(/成功|動作|正しく|完了|works|correct|success|passed|verified|確認/gi) || []).length;
    const negativeMarkers = (evidence.match(/失敗|エラー|問題|バグ|fail|error|bug|issue|problem|incorrect/gi) || []).length;
    
    // 肯定的な証拠のみで、否定証拠の探索がない場合
    if (positiveMarkers > 3 && negativeMarkers === 0 && !hasNegativeSearch) {
      return { detected: true, reason: "Confirmation bias pattern: only positive evidence listed without seeking disconfirming evidence" };
    }
  }
  
  // 「〜を確認した」「〜が正しいことを検証」などの確認バイアス的表現
  const confirmationPhrases = [
    /期待通り|as expected|予想通り/i,
    /問題ない|no problem|問題なし/i,
    /正しく動作|works correctly|正常に動作/i
  ];
  
  const confirmationCount = confirmationPhrases.filter(p => p.test(output)).length;
  
  if (confirmationCount >= 2 && !hasNegativeSearch) {
    return { detected: true, reason: "Confirmation bias pattern: multiple confirmation phrases without counter-evidence search" };
  }
  
  return { detected: false, reason: "" };
}

 /**
  * 高リスクタスクか判定する
  * @param task タスク内容
  * @returns 高リスクの場合はtrue
  */
export function isHighStakesTask(task: string): boolean {
  return HIGH_STAKES_PATTERNS.some(pattern => pattern.test(task));
}

 /**
  * 検証設定を解決
  * @returns 解決された検証ワークフロー設定
  */
export function resolveVerificationConfig(): VerificationWorkflowConfig {
  const envMode = process.env.PI_VERIFICATION_WORKFLOW_MODE;
  
  if (envMode === "disabled" || envMode === "0") {
    return { ...DEFAULT_VERIFICATION_CONFIG, enabled: false };
  }
  
  if (envMode === "strict") {
    return {
      ...DEFAULT_VERIFICATION_CONFIG,
      triggerModes: ["post-subagent", "post-team", "low-confidence", "high-stakes"],
      minConfidenceToSkipVerification: 0.95,
      fallbackBehavior: "block",
      challengerConfig: {
        ...DEFAULT_VERIFICATION_CONFIG.challengerConfig,
        requiredFlaws: 2,
      },
    };
  }
  
  if (envMode === "minimal") {
    return {
      ...DEFAULT_VERIFICATION_CONFIG,
      triggerModes: ["high-stakes"],
      minConfidenceToSkipVerification: 0.7,
      fallbackBehavior: "warn",
    };
  }

  // カスタム設定の環境変数パース
  const config = { ...DEFAULT_VERIFICATION_CONFIG };
  
  const minConfidence = process.env.PI_VERIFICATION_MIN_CONFIDENCE;
  if (minConfidence) {
    const parsed = parseFloat(minConfidence);
    if (!isNaN(parsed)) {
      config.minConfidenceToSkipVerification = Math.max(0, Math.min(1, parsed));
    }
  }

  const maxDepth = process.env.PI_VERIFICATION_MAX_DEPTH;
  if (maxDepth) {
    const parsed = parseInt(maxDepth, 10);
    if (!isNaN(parsed)) {
      config.maxVerificationDepth = Math.max(1, Math.min(5, parsed));
    }
  }

  return config;
}

 /**
  * Inspectorプロンプトを生成
  * @param targetOutput 検証対象の出力
  * @param context 検証コンテキスト
  * @returns 生成されたプロンプト文字列
  */
export function buildInspectorPrompt(targetOutput: string, context: VerificationContext): string {
  const config = resolveVerificationConfig();
  
  return `You are the Inspector subagent. Analyze the following agent output for suspicious patterns.

TARGET OUTPUT:
${targetOutput}

CONTEXT:
- Task: ${context.task}
- Agent: ${context.agentId || context.teamId || "unknown"}

INSPECTION CHECKLIST:
${config.inspectorConfig.requiredPatterns.map(p => `- ${formatPatternName(p)}`).join("\n")}

OUTPUT FORMAT:
\`\`\`
INSPECTION_REPORT:
- [Pattern]: [Finding]
- [Pattern]: [Finding]
...

SUSPICION_LEVEL: low | medium | high

SUMMARY: [Brief summary of findings]

RECOMMENDATION: [What should happen next]
\`\`\`

Focus on:
1. Claims without sufficient evidence
2. Logical inconsistencies between CLAIM and RESULT
3. Overconfidence (high CONFIDENCE with weak EVIDENCE)
4. Missing alternative explanations
5. Causal reversal errors ("A implies B" treated as "B implies A")
6. Confirmation bias patterns (only seeking supporting evidence)`;
}

 /**
  * Challengerプロンプトを生成する
  * @param targetOutput 検証対象の出力内容
  * @param context 検証のコンテキスト情報
  * @returns 生成されたChallengerプロンプト
  */
export function buildChallengerPrompt(targetOutput: string, context: VerificationContext): string {
  const config = resolveVerificationConfig();
  
  return `You are the Challenger subagent. Your role is to DISPUTE and FIND FLAWS in the following agent output.

TARGET OUTPUT:
${targetOutput}

CONTEXT:
- Task: ${context.task}
- Agent: ${context.agentId || context.teamId || "unknown"}

CHALLENGE CATEGORIES:
${config.challengerConfig.enabledCategories.map(c => `- ${formatCategoryName(c)}`).join("\n")}

REQUIREMENTS:
- Identify at least ${config.challengerConfig.requiredFlaws} flaw(s) or weakness(es)
- Be constructively critical - your goal is to strengthen conclusions
- Focus on the most significant issues first

OUTPUT FORMAT:
For each challenged claim:
\`\`\`
CHALLENGED_CLAIM: <specific claim being challenged>
FLAW: <identified flaw or weakness>
EVIDENCE_GAP: <missing evidence that would strengthen/verify the claim>
ALTERNATIVE: <alternative interpretation or explanation>
BOUNDARY_FAILURE: <conditions under which the claim would fail>
SEVERITY: minor | moderate | critical
\`\`\`

OVERALL_SEVERITY: minor | moderate | critical

SUMMARY: [Brief summary of challenges]

SUGGESTED_REVISIONS:
- [Revision 1]
- [Revision 2]
...`;
}

 /**
  * 検証結果を統合
  * @param originalOutput 元の出力
  * @param originalConfidence 元の信頼度
  * @param inspectorOutput 検査者の出力
  * @param challengerOutput 挑戦者の出力
  * @param context 検証コンテキスト
  * @returns 統合された検証結果
  */
export function synthesizeVerificationResult(
  originalOutput: string,
  originalConfidence: number,
  inspectorOutput: InspectorOutput | undefined,
  challengerOutput: ChallengerOutput | undefined,
  context: VerificationContext
): VerificationResult {
  const config = resolveVerificationConfig();
  const warnings: string[] = [];
  let finalVerdict: VerificationVerdict = "pass";
  let requiresReRun = false;
  let confidence = originalConfidence;

  // Inspectorの発見事項を処理
  if (inspectorOutput) {
    if (inspectorOutput.suspicionLevel === "high") {
      finalVerdict = "needs-review";
      warnings.push(`Inspector detected high suspicion: ${inspectorOutput.summary}`);
      confidence = Math.min(confidence, 0.5);
    } else if (inspectorOutput.suspicionLevel === "medium") {
      if (finalVerdict === "pass") {
        finalVerdict = "pass-with-warnings";
      }
      warnings.push(`Inspector noted concerns: ${inspectorOutput.summary}`);
      confidence = Math.min(confidence, 0.7);
    }

    // 重要なパターンをチェック
    const criticalPatterns = inspectorOutput.detectedPatterns.filter(
      p => p.severity === "high"
    );
    if (criticalPatterns.length > 0) {
      finalVerdict = config.fallbackBehavior === "block" ? "blocked" : "needs-review";
      requiresReRun = config.fallbackBehavior === "block";
    }
  }

  // Challengerの発見事項を処理
  if (challengerOutput) {
    if (challengerOutput.overallSeverity === "critical") {
      finalVerdict = config.fallbackBehavior === "block" ? "blocked" : "fail";
      requiresReRun = config.fallbackBehavior === "block";
      warnings.push(`Critical challenges identified: ${challengerOutput.summary}`);
      confidence = Math.min(confidence, 0.3);
    } else if (challengerOutput.overallSeverity === "moderate") {
      if (finalVerdict === "pass") {
        finalVerdict = "pass-with-warnings";
      }
      warnings.push(`Moderate challenges: ${challengerOutput.summary}`);
      confidence = Math.min(confidence, 0.6);
    }

    // 深度チェック
    if ((context.previousVerifications || 0) >= config.maxVerificationDepth) {
      warnings.push("Max verification depth reached - manual review recommended");
      if (finalVerdict !== "fail" && finalVerdict !== "blocked") {
        finalVerdict = "needs-review";
      }
    }
  }

  return {
    triggered: true,
    triggerReason: context.triggerMode,
    inspectorOutput,
    challengerOutput,
    finalVerdict,
    confidence,
    requiresReRun,
    warnings,
  };
}

/**
 * パターン名をフォーマット
 */
function formatPatternName(pattern: InspectionPattern): string {
  const names: Record<InspectionPattern, string> = {
    "claim-result-mismatch": "CLAIM-RESULT Mismatch",
    "evidence-confidence-gap": "Evidence-Confidence Gap",
    "missing-alternatives": "Missing Alternative Explanations",
    "causal-reversal": "Causal Reversal Error",
    "confirmation-bias": "Confirmation Bias Pattern",
    "overconfidence": "Overconfidence",
    "incomplete-reasoning": "Incomplete Reasoning",
  };
  return names[pattern] || pattern;
}

/**
 * カテゴリ名をフォーマット
 */
function formatCategoryName(category: ChallengeCategory): string {
  const names: Record<ChallengeCategory, string> = {
    "evidence-gap": "Evidence Gaps",
    "logical-flaw": "Logical Flaws",
    "assumption": "Hidden Assumptions",
    "alternative": "Unconsidered Alternatives",
    "boundary": "Boundary Conditions",
    "causal-reversal": "Causal Reversals",
  };
  return names[category] || category;
}

 /**
  * 検証ワークフロー実行ルールを取得
  * @returns 検証手順を記述した文字列
  */
export function getVerificationWorkflowRules(): string {
  return `
【検証ワークフロー】

タスク完了前に以下の検証を実施:

1. 自己検証チェック:
   - CLAIMとRESULTの論理的整合性
   - EVIDENCEがCLAIMを十分にサポートしているか
   - CONFIDENCEがEVIDENCEの強さと比例しているか

2. Inspector起動条件:
   - 低信頼度出力（CONFIDENCE < 0.7）
   - 高リスクタスク（削除、本番変更、セキュリティ関連）
   - CLAIM-RESULT不一致の兆候
   - 過信の兆候（短いEVIDENCEで高いCONFIDENCE）

3. Challenger起動条件:
   - Inspectorがmedium以上のsuspicionを検出
   - 明示的な検証リクエスト時
   - チーム実行後の合意形成前

4. 検証結果への対応:
   - pass: そのまま採用
   - pass-with-warnings: 警告を記録して採用
   - needs-review: 人間のレビューを推奨
   - fail/block: 再実行または追加調査

環境変数:
- PI_VERIFICATION_WORKFLOW_MODE: disabled | minimal | auto | strict
- PI_VERIFICATION_MIN_CONFIDENCE: 検証スキップの信頼度閾値
- PI_VERIFICATION_MAX_DEPTH: 最大検証深度
`.trim();
}
