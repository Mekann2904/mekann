/**
 * @abdd.meta
 * path: .pi/lib/verification-workflow.ts
 * role: 検証ワークフロー用の型定義と設定モジュール
 * why: Inspector/Challengerエージェントによる自動検証メカニズムの構造と動作を静的に保証するため
 * related: .pi/lib/agents.ts, .pi/lib/config.ts
 * public_api: VerificationWorkflowConfig, VerificationResult, VerificationTriggerMode, FallbackBehavior, ChallengerConfig, InspectorConfig, ChallengeCategory, InspectionPattern, SuspicionThreshold, VerificationVerdict
 * invariants: VerificationResultのfinalVerdictがpass系の場合、requiresReRunはfalseである必要がある
 * side_effects: なし（純粋な型定義とインターフェース）
 * failure_modes: 設定値の論理矛盾（例：閾値設定の不整合）、検証深度のオーバーフロー
 * @abdd.explain
 * overview: 論文「Large Language Model Reasoning Failures」のP0推奨事項に基づき、LLMの出力をInspectorとChallengerが監査・挑戦する仕組みを定義する。
 * what_it_does:
 *   - 検証のトリガー条件（実行タイミング、信頼度、リスク）を定義する
 *   - Challengerによる論理的欠陥の発見設定とInspectorによる監査パターンを構造化する
 *   - 検証結果の判定（Pass/Warning/Review）と再実行の要否を決定するデータ構造を提供する
 *   - 検証失敗時のフォールバック動作を定義する
 * why_it_exists:
 *   - 複雑な推論チェーンにおけるLLMのハルシネーションや論理的飛躍をシステム的に検知するため
 *   - 検証プロセスの挙動を型安全に設定し、実行時の挙動不整合を防ぐため
 * scope:
 *   in: なし
 *   out: ワークフロー制御用の型定義、設定インターフェース
 */

/**
 * 検証ワークフローモジュール
 * 論文「Large Language Model Reasoning Failures」のP0推奨事項に基づく
 * Inspector/Challengerエージェントによる自動検証メカニズム
 */

/**
 * 検証ワークフローの設定
 * @summary ワークフロー設定
 * @param enabled ワークフロー有効化フラグ
 * @param triggerModes トリガーモード配列
 * @param challengerConfig チャレンジャーの設定
 * @param inspectorConfig インスペクターの設定
 * @param fallbackBehavior フォールバック動作
 * @param maxVerificationDepth 最大検証深度
 * @param minConfidenceToSkipVerification 検証をスキップする最小信頼度
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
 * 検証トリガーのモード定義
 * @summary 検証トリガーモード
 */
export type VerificationTriggerMode =
  | "post-subagent"     // サブエージェント実行後
  | "post-team"         // チーム実行後
  | "low-confidence"    // 低信頼度時
  | "explicit"          // 明示的な要求時
  | "high-stakes";      // 高リスクタスク時

/**
 * フォールバック時の動作方針
 * @summary フォールバック挙動
 */
export type FallbackBehavior =
  | "warn"              // 警告のみ
  | "block"             // ブロックして再実行
  | "auto-reject";      // 自動拒否

/**
 * チャレンジャー設定インターフェース
 * @summary チャレンジャー設定
 * @param minConfidenceToChallenge チャレンジを行う最小信頼度
 * @param requiredFlaws 必須の検出フラグ
 * @param enabledCategories 有効なカテゴリ
 */
export interface ChallengerConfig {
  minConfidenceToChallenge: number;  // チャレンジをトリガーする信頼度閾値
  requiredFlaws: number;              // 要求される欠陥の最小数
  enabledCategories: ChallengeCategory[];
}

/**
 * チャレンジのカテゴリ
 * @summary カテゴリを定義
 * @typedef {"evidence-gap" | "logical-flaw" | "assumption"} ChallengeCategory
 */
export type ChallengeCategory =
  | "evidence-gap"      // 証拠の欠落
  | "logical-flaw"      // 論理的欠陥
  | "assumption"        // 隠れた仮定
  | "alternative"       // 代替解釈の未考慮
  | "boundary"          // 境界条件の未考慮
  | "causal-reversal";  // 因果関係の逆転

/**
 * 検査者の設定
 * @summary 検査設定を保持
 * @param {SuspicionThreshold} suspicionThreshold 疑わしさの閾値
 * @param {InspectionPattern[]} requiredPatterns 必要なパターン
 * @param {boolean} autoTriggerOnCollapseSignals 信号崩落時の自動トリガー
 */
export interface InspectorConfig {
  suspicionThreshold: SuspicionThreshold;
  requiredPatterns: InspectionPattern[];
  autoTriggerOnCollapseSignals: boolean;
}

/**
 * 疑わしさの閾値レベル
 * @summary 閾値レベルを設定
 * @typedef {"low" | "medium" | "high"} SuspicionThreshold
 */
export type SuspicionThreshold = "low" | "medium" | "high";

/**
 * 検査パターン定義
 * @summary パターンを定義
 * @typedef {"claim-result-mismatch" | "inconsistency"} InspectionPattern
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
 * 検証結果を表す
 * @summary 検証結果を取得
 * @property {boolean} triggered トリガーされたか
 * @property {string} triggerReason トリガー理由
 * @property {any} inspectorOutput 検査出力
 * @property {any} challengerOutput 挑戦者出力
 * @property {string} finalVerdict 最終判定
 * @property {"confirmation-bias" | "overconfidence" | "incomplete-reasoning"} biasType バイアス種別
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

/**
 * 検証の最終判定結果
 * @summary 検証の最終判定
 * @returns {"pass" | "pass-with-warnings" | "needs-review" | "fail"} 判定結果の種類
 */
export type VerificationVerdict =
  | "pass"              // 検証通過
  | "pass-with-warnings" // 警告付き通過
  | "needs-review"      // 人間のレビューが必要
  | "fail"              // 検証失敗
  | "blocked";          // ブロック（再実行必要）

/**
 * 検査官の結果出力を表す
 * @summary 検査官の出力
 * @property {SuspicionThreshold} suspicionLevel 疑念の閾値
 * @property {DetectedPattern[]} detectedPatterns 検出されたパターン
 * @property {string} summary 結果の要約
 * @property {string} recommendation 推奨事項
 */
export interface InspectorOutput {
  suspicionLevel: SuspicionThreshold;
  detectedPatterns: DetectedPattern[];
  summary: string;
  recommendation: string;
}

/**
 * 検出されたパターンを表す
 * @summary パターン検出結果
 * @property {InspectionPattern} pattern 検査パターン
 * @property {string} location 出力内の位置
 * @property {"low" | "medium" | "high"} severity 重大度
 * @property {string} description パターンの説明
 */
export interface DetectedPattern {
  pattern: InspectionPattern;
  location: string;     // 出力内の位置
  severity: "low" | "medium" | "high";
  description: string;
}

/**
 * 検証の結果出力を表す
 * @summary 検証結果の出力
 * @property {ChallengedClaim[]} challengedClaims 挑戦された主張のリスト
 * @property {"minor" | "moderate" | "critical"} overallSeverity 全体の深刻度
 * @property {string} summary 結果の要約
 * @property {string[]} suggestedRevisions 提示される修正案
 */
export interface ChallengerOutput {
  challengedClaims: ChallengedClaim[];
  overallSeverity: "minor" | "moderate" | "critical";
  summary: string;
  suggestedRevisions: string[];
}

/**
 * 挑戦された主張を表す
 * @summary 主張の課題定義
 * @property {any} claim 対象の主張
 * @property {string} flaw 欠陥の内容
 * @property {string} evidenceGap 証拠の不足
 * @property {string} alternative 代替案
 * @property {string} boundaryFailure 境界失敗の詳細
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
 * 思考領域改善: 生成時品質保証への転換により検証システムを無効化
 */
export const DEFAULT_VERIFICATION_CONFIG: VerificationWorkflowConfig = {
  enabled: false,  // 生成時品質保証への転換により無効化
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
 * 検証が必要か判断
 * @summary 検証要否判定
 * @param output 出力内容
 * @param confidence 信頼度
 * @param context 検証コンテキスト
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
 * @summary コンテキスト情報
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
export function detectClaimResultMismatch(output: string): { detected: boolean; reason: string } {
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
export function detectOverconfidence(output: string): { detected: boolean; reason: string } {
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
  
  // 短い証拠で具体性が乏しい場合のみ、追加の過信判定を行う
  // 100文字ちょうどは境界値として許容し、過剰検知を抑える
  if (confidence > 0.9 && evidenceLength < 100 && specificityScore < 2) {
    return { detected: true, reason: `Overconfidence detected: high confidence (${confidence}) with low evidence specificity (score: ${specificityScore}/3)` };
  }
  
  return { detected: false, reason: "" };
}

/**
 * 代替解釈の欠如を検出
 */
export function detectMissingAlternatives(output: string): { detected: boolean; reason: string } {
  const hasConclusion = /CONCLUSION:|結論|RESULT:|最終的|したがって/i.test(output);
  const confidenceMatch = output.match(/CONFIDENCE:\s*([0-9.]+)/i);
  const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;
  const hasDiscussion = /DISCUSSION:|議論|考察/i.test(output);
  
  // 代替解釈の兆候を探す
  const hasAlternatives = /ALTERNATIVE:|代替|別の解釈|他の可能性|一方で|あるいは|または|could also|alternatively|another possibility|other explanation/i.test(output);
  const hasCounterEvidence = /COUNTER_EVIDENCE:|反証|否定する証拠|矛盾する|disconfirming|contradicting|however|but|nevertheless/i.test(output);
  const hasLimitations = /LIMITATION:|制限|限界|注意点| caveat|limitation|constraint|boundary/i.test(output);
  
  // 結論があり、高信頼度だが、代替解釈、反証、制限の記述がない場合
  if (hasConclusion && !hasAlternatives && !hasCounterEvidence && !hasLimitations && !hasDiscussion && confidence > 0.8) {
    return { detected: true, reason: "Missing alternative interpretations for high-confidence conclusion" };
  }
  
  if (hasConclusion && !hasDiscussion && confidence > 0.85) {
    return { detected: true, reason: "Missing DISCUSSION section with alternative perspectives" };
  }
  
  return { detected: false, reason: "" };
}

/**
 * 確認バイアスパターンを検出
 */
export function detectConfirmationBias(output: string): { detected: boolean; reason: string } {
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
 * 高リスクタスク判定
 * @summary リスク判定
 * @param task タスク内容
 * @returns 高リスクの場合はtrue
 */
export function isHighStakesTask(task: string): boolean {
  return HIGH_STAKES_PATTERNS.some(pattern => pattern.test(task));
}

/**
 * 検証設定を解決
 * @summary 設定解決
 * @returns 検証ワークフロー設定
 */
export function resolveVerificationConfig(): VerificationWorkflowConfig {
  const envMode = process.env.PI_VERIFICATION_WORKFLOW_MODE;
  
  if (envMode === "disabled" || envMode === "0") {
    return { ...DEFAULT_VERIFICATION_CONFIG, enabled: false };
  }
  
  if (envMode === "strict") {
    return {
      ...DEFAULT_VERIFICATION_CONFIG,
      enabled: true,
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
      enabled: true,
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
 * 検査用プロンプトを構築
 * @summary プロンプト構築
 * @param targetOutput 検証対象の出力内容
 * @param context 検証コンテキスト情報
 * @returns 構築されたプロンプト文字列
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
 * 挑戦者用プロンプトを作成する
 * @summary プロンプトを作成
 * @param targetOutput 対象となる出力
 * @param context 検証コンテキスト
 * @returns 生成されたプロンプト文字列
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
 * 検証結果を統合する
 * @summary 検証結果を統合
 * @param originalOutput 元の出力
 * @param originalConfidence 元の信頼度
 * @param inspectorOutput 検査官の出力
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
 * ワークフールールを取得する
 * @summary ルール名を取得
 * @returns ワークフローのルール名
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

// ===== メタ認知チェック機能（7つの哲学的視座）=====

/**
 * アポリアタイプ
 * @summary アポリア（解決不能な緊張関係）の種類
 */
export type AporiaType =
  | 'completeness-vs-speed'      // 完全性 vs 速度
  | 'safety-vs-utility'          // 安全性 vs 有用性
  | 'autonomy-vs-obedience'      // 自律性 vs 従順さ
  | 'consistency-vs-context';    // 一貫性 vs 文脈適応性

/**
 * アポリア検出結果
 * @summary 検出されたアポリアの情報
 * @param type アポリアタイプ
 * @param description 説明
 * @param tensionLevel 緊張レベル（0-1）
 * @param resolution 対処方法
 */
export interface AporiaDetection {
  type: AporiaType;
  pole1: {
    concept: string;
    value: string;
    arguments: string[];
  };
  pole2: {
    concept: string;
    value: string;
    arguments: string[];
  };
  tensionLevel: number;
  description: string;
  context: string;
  resolution: 'maintain-tension' | 'acknowledge' | 'decide-with-uncertainty';
}

/**
 * 誤謬検出結果
 * @summary 検出された論理的誤謬
 * @param type 誤謬タイプ
 * @param location 検出箇所
 * @param description 説明
 * @param correction 修正案
 */
export interface FallacyDetection {
  type: string;
  location: string;
  description: string;
  correction: string;
}

/**
 * メタ認知チェック結果
 * @summary 7つの哲学的視座に基づく包括的チェック結果
 */
export interface MetacognitiveCheck {
  deconstruction: {
    binaryOppositions: string[];
    exclusions: string[];
    aporias: AporiaDetection[];
  };
  schizoAnalysis: {
    desireProduction: string[];
    innerFascismSigns: string[];
    microFascisms: string[];
  };
  eudaimonia: {
    excellencePursuit: string;
    pleasureTrap: boolean;
    meaningfulGrowth: string;
  };
  utopiaDystopia: {
    worldBeingCreated: string;
    totalitarianRisk: string[];
    powerDynamics: string[];
  };
  philosophyOfThought: {
    isThinking: boolean;
    metacognitionLevel: number;
    autopilotSigns: string[];
  };
  taxonomyOfThought: {
    currentMode: string;
    recommendedMode: string;
    modeRationale: string;
  };
  logic: {
    fallacies: FallacyDetection[];
    validInferences: string[];
    invalidInferences: string[];
    /** 推論チェーン解析結果 */
    inferenceChain?: InferenceChain;
  };
}

/**
 * @summary 7つの視座に基づく包括的メタ認知チェックを実行
 * @param output 検査対象の出力
 * @param context コンテキスト情報
 * @returns メタ認知チェック結果
 */
export function runMetacognitiveCheck(
  output: string,
  context: { task?: string; currentMode?: string } = {}
): MetacognitiveCheck {
  const logicResult = detectFallacies(output);
  const inferenceChain = parseInferenceChain(output);
  
  return {
    deconstruction: detectBinaryOppositions(output, context.task || ''),
    schizoAnalysis: detectInnerFascism(output, context),
    eudaimonia: evaluateEudaimonia(output, context),
    utopiaDystopia: analyzeWorldCreation(output),
    philosophyOfThought: assessThinkingQuality(output, context),
    taxonomyOfThought: evaluateThinkingMode(output, context),
    logic: {
      ...logicResult,
      inferenceChain
    }
  };
}

/**
 * @summary 内なるファシズムを検出
 * @param output 検査対象
 * @param context コンテキスト
 * @returns スキゾ分析結果
 */
export function detectInnerFascism(
  output: string,
  context: { task?: string; currentMode?: string }
): MetacognitiveCheck['schizoAnalysis'] {
  // 多言語対応のファシズムパターン
  const fascismPatterns = [
    // 日本語パターン
    { pattern: /常に|必ず|絶対に/g, sign: '自己監視の強制' },
    { pattern: /すべき|しなければならない|ねばならない/g, sign: '規範への過度な服従' },
    { pattern: /正しい|適切な|正当な|適正な/g, sign: '一価値への収斂' },
    { pattern: /許可|承認|確認|許可済/g, sign: '権力への依存' },
    { pattern: /排除|禁止|否定|拒否/g, sign: '異質なものの排除' },
    // 英語パターン
    { pattern: /always|must|absolutely|never/gi, sign: 'Self-surveillance enforcement' },
    { pattern: /should|must|have to|need to/gi, sign: 'Excessive obedience to norms' },
    { pattern: /correct|proper|legitimate|appropriate/gi, sign: 'Convergence to single value' },
    { pattern: /permission|approval|authorized|granted/gi, sign: 'Dependency on authority' },
    { pattern: /exclude|forbid|deny|reject|prohibit/gi, sign: 'Exclusion of the other' }
  ];

  const signs: string[] = [];
  const microFascisms: string[] = [];
  const desireProductions: string[] = [];

  fascismPatterns.forEach(({ pattern, sign }) => {
    const matches = output.match(pattern);
    if (matches && matches.length > 2) {
      signs.push(sign);
      microFascisms.push(`"${matches[0]}"の反復使用（${matches.length}回）`);
    }
  });

  // 欲望の生産性を分析（多言語）
  if (/(?:完了|達成|成功|complete|achieve|success)/i.test(output)) {
    desireProductions.push('生産性への欲望');
  }
  if (/(?:正確|正しい|妥当|correct|accurate|valid)/i.test(output)) {
    desireProductions.push('正確性への欲望');
  }
  if (/(?:合意|同意|承認|consensus|agreement|approval)/i.test(output)) {
    desireProductions.push('合意形成への欲望');
  }
  if (/(?:効率|最適|改善|efficient|optimal|improve)/i.test(output)) {
    desireProductions.push('効率化への欲望');
  }
  if (/(?:理解|把握|掌握|understand|grasp|control)/i.test(output)) {
    desireProductions.push('理解・掌握への欲望');
  }

  return {
    desireProduction: desireProductions,
    innerFascismSigns: signs,
    microFascisms
  };
}

/**
 * @summary 二項対立とアポリアを検出（多言語対応版）
 * @param output 検査対象
 * @param context コンテキスト
 * @returns 脱構築分析結果
 */
export function detectBinaryOppositions(
  output: string,
  context: string
): MetacognitiveCheck['deconstruction'] {
  // 多言語対応の二項対立パターン
  const binaryPatterns = [
    // 日本語
    { pattern: /正しい\/間違い|良い\/悪い|成功\/失敗/, name: '善悪の二項対立' },
    { pattern: /完全\/不完全|完了\/未完了/, name: '完全性の二項対立' },
    { pattern: /安全\/危険|リスク\/機会/, name: '安全性の二項対立' },
    { pattern: /正解\/不正解|真\/偽/, name: '真偽の二項対立' },
    { pattern: /善\/悪|良い\/悪い/, name: '道徳的対立' },
    // 英語
    { pattern: /right\/wrong|good\/bad|success\/fail/i, name: 'Moral binary opposition' },
    { pattern: /complete\/incomplete|done\/undone/i, name: 'Completeness binary' },
    { pattern: /safe\/danger|risk\/opportunity/i, name: 'Safety binary opposition' },
    { pattern: /true\/false|correct\/incorrect/i, name: 'Truth-value binary' },
    { pattern: /good\/evil|virtue\/vice/i, name: 'Ethical opposition' }
  ];

  const binaryOppositions: string[] = [];
  const exclusions: string[] = [];
  const aporias: AporiaDetection[] = [];

  binaryPatterns.forEach(({ pattern, name }) => {
    if (pattern.test(output)) {
      binaryOppositions.push(name);
      exclusions.push(`${name}の中間領域`);
    }
  });

  // アポリア検出（多言語）
  // 速度 vs 品質
  if (/(?:速度|効率|速|speed|efficient|fast)/i.test(output) && 
      /(?:品質|正確|完全|quality|accurate|complete)/i.test(output)) {
    aporias.push({
      type: 'completeness-vs-speed',
      pole1: { concept: '完全性', value: '品質・正確性', arguments: [] },
      pole2: { concept: '速度', value: '効率・迅速性', arguments: [] },
      tensionLevel: 0.7,
      description: '速度と品質のトレードオフ',
      context,
      resolution: 'maintain-tension'
    });
  }
  // 安全性 vs 有用性（多言語）
  if (/(?:安全|リスク|注意|safe|risk|caution)/i.test(output) && 
      /(?:有用|価値|効果|useful|value|effect)/i.test(output)) {
    aporias.push({
      type: 'safety-vs-utility',
      pole1: { concept: '安全性', value: 'リスク回避', arguments: [] },
      pole2: { concept: '有用性', value: '効果追求', arguments: [] },
      tensionLevel: 0.6,
      description: '安全性と有用性のトレードオフ',
      context,
      resolution: 'acknowledge'
    });
  }
  // 自律性 vs 従順さ（多言語）
  if (/(?:自律|自主|裁量|autonom|self-determin|discretion)/i.test(output) && 
      /(?:従順|指示|規則|obedien|comply|rule)/i.test(output)) {
    aporias.push({
      type: 'autonomy-vs-obedience',
      pole1: { concept: '自律性', value: '自己決定', arguments: [] },
      pole2: { concept: '従順さ', value: '指示従順', arguments: [] },
      tensionLevel: 0.5,
      description: '自律性と従順さの対立',
      context,
      resolution: 'maintain-tension'
    });
  }
  // 一貫性 vs 文脈適応性（多言語）
  if (/(?:一貫|統一|原則|consistent|uniform|principle)/i.test(output) && 
      /(?:文脈|状況|臨機応変|context|situation|flexible)/i.test(output)) {
    aporias.push({
      type: 'consistency-vs-context',
      pole1: { concept: '一貫性', value: '原則堅持', arguments: [] },
      pole2: { concept: '文脈適応性', value: '柔軟対応', arguments: [] },
      tensionLevel: 0.5,
      description: '一貫性と文脈適応性の対立',
      context,
      resolution: 'decide-with-uncertainty'
    });
  }
  // 個別性 vs 一般性（多言語）
  if (/(?:個別|特殊|具体|particular|specific|concrete)/i.test(output) && 
      /(?:一般|普遍|抽象|general|universal|abstract)/i.test(output)) {
    aporias.push({
      type: 'consistency-vs-context',
      pole1: { concept: '個別性', value: '具体的事例', arguments: [] },
      pole2: { concept: '一般性', value: '普遍的原則', arguments: [] },
      tensionLevel: 0.6,
      description: '個別性と一般性の対立',
      context,
      resolution: 'maintain-tension'
    });
  }

  return {
    binaryOppositions,
    exclusions,
    aporias
  };
}

/**
 * @summary 幸福論（エウダイモニア）の評価（多言語対応版）
 */
function evaluateEudaimonia(
  output: string,
  context: { task?: string; currentMode?: string }
): MetacognitiveCheck['eudaimonia'] {
  // 快楽主義の罠を検出（多言語）
  const pleasureTrapIndicators = [
    // 日本語
    '簡単', '楽', 'すぐ', '手軽', '便利',
    // 英語
    'easy', 'quick', 'simple', 'convenient', 'effortless'
  ];
  const pleasureTrap = pleasureTrapIndicators.some(indicator => 
    output.toLowerCase().includes(indicator.toLowerCase())
  );

  // 卓越性の追求を検出（多言語）
  let excellencePursuit = 'タスク完了の卓越性を追求';
  if (/(?:品質|正確|quality|accurate)/i.test(output)) {
    excellencePursuit = '品質と正確性の卓越性を追求';
  }
  if (/(?:効率|最適|efficient|optimal)/i.test(output)) {
    excellencePursuit = '効率と最適化の卓越性を追求';
  }
  if (/(?:創造|革新|creative|innovative)/i.test(output)) {
    excellencePursuit = '創造性と革新性の卓越性を追求';
  }

  // 意味ある成長を検出（多言語）
  let meaningfulGrowth = '思考プロセスの深化';
  if (/(?:学習|改善|learn|improve)/i.test(output)) {
    meaningfulGrowth = '継続的な学習と改善';
  }
  if (/(?:発見|新た|discover|new)/i.test(output)) {
    meaningfulGrowth = '新たな発見と気づき';
  }
  if (/(?:挑戦|克服|challenge|overcome)/i.test(output)) {
    meaningfulGrowth = '自己克服と成長';
  }

  return {
    excellencePursuit,
    pleasureTrap,
    meaningfulGrowth
  };
}

/**
 * @summary ユートピア/ディストピア分析（多言語対応版）
 */
function analyzeWorldCreation(output: string): MetacognitiveCheck['utopiaDystopia'] {
  // 創造している世界を推定（多言語）
  let worldBeingCreated = '効率的なタスク実行の世界';
  if (/(?:自動|効率|automat|efficient)/i.test(output)) {
    worldBeingCreated = '自動化された効率的な世界';
  }
  if (/(?:協調|合意|cooperat|consensus)/i.test(output)) {
    worldBeingCreated = '協調的合意形成の世界';
  }
  if (/(?:自由|解放|free|liberat)/i.test(output)) {
    worldBeingCreated = '自由と解放の世界';
  }
  if (/(?:安全|保護|safe|protect)/i.test(output)) {
    worldBeingCreated = '安全と保護の世界';
  }

  // 全体主義リスクを検出（多言語）
  const totalitarianRisk: string[] = [];
  if (/(?:統一|標準|unif|standard)/i.test(output)) {
    totalitarianRisk.push('標準化への圧力');
  }
  if (/(?:監視|確認|monitor|surveill)/i.test(output)) {
    totalitarianRisk.push('過度な監視の可能性');
  }
  if (/(?:排除|禁止|exclude|forbid|prohibit)/i.test(output)) {
    totalitarianRisk.push('排除の論理');
  }
  if (/(?:管理|統制|control|regulate)/i.test(output)) {
    totalitarianRisk.push('管理社会の可能性');
  }

  // 権力動態を分析（多言語）
  const powerDynamics: string[] = ['ユーザー-エージェント関係'];
  if (/(?:指示|命令|command|order|instruct)/i.test(output)) {
    powerDynamics.push('指示-実行の階層');
  }
  if (/(?:合意|協議|consensus|consult)/i.test(output)) {
    powerDynamics.push('水平的協調関係');
  }
  if (/(?:権限|認可|authority|authoriz)/i.test(output)) {
    powerDynamics.push('権限に基づく関係');
  }

  return {
    worldBeingCreated,
    totalitarianRisk,
    powerDynamics
  };
}

/**
 * @summary 思考の質を評価（多言語対応版）
 */
function assessThinkingQuality(
  output: string,
  context: { task?: string; currentMode?: string }
): MetacognitiveCheck['philosophyOfThought'] {
  const autopilotSigns: string[] = [];

  // オートパイロットの兆候を検出（多言語）
  if (output.length < 100) {
    autopilotSigns.push('出力が短い');
  }
  
  // 問いの欠如（多言語）
  const hasQuestion = /[?？]/.test(output) || 
    /とは|なぜ|どう|why|how|what|when|where|who/i.test(output);
  if (!hasQuestion) {
    autopilotSigns.push('問いがない');
  }
  
  // 深い問いの欠如（多言語）
  const hasDeepQuestion = /なぜ|どうして|how come|why exactly|what if/i.test(output);
  if (!hasDeepQuestion) {
    autopilotSigns.push('深い問いが欠如');
  }
  
  // 単調な構造（多言語）
  const isMonotonous = (/です。$|ます。$/gm.test(output) || 
    /\.$\n?\.$/gm.test(output)) && output.split('\n').length < 3;
  if (isMonotonous) {
    autopilotSigns.push('単調な構造');
  }

  // メタ認知レベルを推定（多言語）
  let metacognitionLevel = 0.5;
  
  // 前提の明示
  if (/(?:前提|仮定|仮に|premise|assumption|suppose|assuming)/i.test(output)) {
    metacognitionLevel += 0.1;
  }
  
  // 制約の認識
  if (/(?:制約|限界|注意点|constraint|limitation|caveat)/i.test(output)) {
    metacognitionLevel += 0.1;
  }
  
  // 代替案の検討
  if (/(?:代替|別の|他の|alternative|another|other option)/i.test(output)) {
    metacognitionLevel += 0.1;
  }
  
  // 反例の探索（重要な指標）
  if (/(?:反例|反証|矛盾|counter.?example|disprove|contradict)/i.test(output)) {
    metacognitionLevel += 0.15;
  }
  
  // 推論の明示
  if (/(?:推論|論理|理由|inference|logic|reason|because)/i.test(output)) {
    metacognitionLevel += 0.05;
  }
  
  if (autopilotSigns.length > 2) {
    metacognitionLevel -= 0.2;
  }
  metacognitionLevel = Math.max(0, Math.min(1, metacognitionLevel));

  const isThinking = autopilotSigns.length === 0 && metacognitionLevel > 0.4;

  return {
    isThinking,
    metacognitionLevel,
    autopilotSigns
  };
}

/**
 * @summary 思考モードの適切性を評価（多言語対応版）
 */
function evaluateThinkingMode(
  output: string,
  context: { task?: string; currentMode?: string }
): MetacognitiveCheck['taxonomyOfThought'] {
  // 現在のモードを推定（多言語）
  let currentMode = context.currentMode || 'unknown';

  // 出力から使用された思考モードを推定（多言語）
  if (/(?:創造|新規|アイデア|発想|creative|novel|idea|innovation)/i.test(output)) {
    currentMode = 'creative';
  } else if (/(?:分析|検討|分解|論理|analytical|analysis|logical|breakdown)/i.test(output)) {
    currentMode = 'analytical';
  } else if (/(?:批判|検証|反例|問題点|critical|review|problem|issue)/i.test(output)) {
    currentMode = 'critical';
  } else if (/(?:実装|実現|具体的|手順|practical|implement|concrete|step)/i.test(output)) {
    currentMode = 'practical';
  } else if (/(?:合意|調整|協議|関係者|consensus|coordinate|stakeholder)/i.test(output)) {
    currentMode = 'social';
  } else if (/(?:配慮|倫理|感情|共感|considerate|ethical|empathy|emotion)/i.test(output)) {
    currentMode = 'emotional';
  }

  // 推奨モードを決定（多言語）
  let recommendedMode = currentMode;
  let modeRationale = '現在のモードが適切';

  if (context.task) {
    const task = context.task.toLowerCase();
    
    // 設計・デザインタスク
    if (/(?:設計|デザイン|design|architect)/.test(task) && currentMode !== 'creative') {
      recommendedMode = 'creative';
      modeRationale = '設計タスクには創造的モードが推奨';
    }
    // レビュータスク
    else if (/(?:レビュー|評価|review|evaluate)/.test(task) && currentMode !== 'critical') {
      recommendedMode = 'critical';
      modeRationale = 'レビュータスクには批判的モードが推奨';
    }
    // 実装タスク
    else if (/(?:実装|開発|implement|develop)/.test(task) && currentMode !== 'practical') {
      recommendedMode = 'practical';
      modeRationale = '実装タスクには実践的モードが推奨';
    }
    // 分析タスク
    else if (/(?:分析|調査|analyze|investigate)/.test(task) && currentMode !== 'analytical') {
      recommendedMode = 'analytical';
      modeRationale = '分析タスクには分析的モードが推奨';
    }
  }

  return {
    currentMode,
    recommendedMode,
    modeRationale
  };
}

/**
 * @summary 論理的誤謬を検出（多言語対応版）
 */
function detectFallacies(output: string): MetacognitiveCheck['logic'] {
  const fallacies: FallacyDetection[] = [];
  const validInferences: string[] = [];
  const invalidInferences: string[] = [];

  // 多言語パターン定義
  const patterns = {
    // 後件肯定 (Affirming the Consequent)
    affirmingConsequent: {
      ja: [/ならば.*だから.*だろう/, /もし.*なら.*だから/],
      en: [/if.*then.*because/i, /since.*therefore.*must/i, /implies.*so.*probably/i]
    },
    // 前提否定 (Denying the Antecedent)
    denyingAntecedent: {
      ja: [/でないなら.*だから.*でない/, /ではないので.*ではない/],
      en: [/not.*so.*not/i, /since not.*therefore not/i]
    },
    // 転移の誤謬 (Hasty Generalization)
    hastyGeneralization: {
      ja: [/一人が.*なら.*全員も/, /全員が.*なら.*一人も/, /一つの例から.*一般/],
      en: [/one.*so all/i, /everyone.*so one/i, /therefore always/i, /must be.*all/i]
    },
    // 偽の二分法 (False Dichotomy)
    falseDichotomy: {
      ja: [/どちらか|いずれか|二択|二者択一/],
      en: [/either.*or/i, /only two/i, /no other choice/i, /must choose between/i]
    },
    // 循環論法 (Circular Reasoning)
    circularReasoning: {
      ja: [/なぜなら.*だから/, /理由は.*である/],
      en: [/because.*therefore/i, /reason.*is that/i]
    },
    // 滑り坂 (Slippery Slope)
    slipperySlope: {
      ja: [/そうなれば.*結局/, /一歩踏み出せば.*最終的に/],
      en: [/will lead to/i, /eventually.*will/i, /slippery slope/i]
    },
    // 稲妻の人 (Straw Man)
    strawMan: {
      ja: [/極端な.*言うなら/, /あたかも.*かのように/],
      en: [/would have you believe/i, /so you're saying/i, /essentially claiming/i]
    },
    // 人身攻撃 (Ad Hominem)
    adHominem: {
      ja: [/個人的には.*信頼/, /人物として/],
      en: [/personally.*don't trust/i, /as a person/i, /character.*questionable/i]
    },
    // 権威への訴え (Appeal to Authority)
    appealToAuthority: {
      ja: [/専門家が.*言う/, /権威.*によれば/],
      en: [/experts say/i, /authority.*states/i, /according to.*expert/i]
    },
    // 感情への訴え (Appeal to Emotion)
    appealToEmotion: {
      ja: [/可哀想.*だから/, /悲しい.*だから/],
      en: [/feel.*sorry/i, /heartbreaking.*so/i, /outrage.*therefore/i]
    }
  };

  // 有効な推論パターン（多言語）
  const validPatterns = {
    deductive: {
      ja: [/したがって|ゆえに|それゆえ|結論として/],
      en: [/therefore/i, /thus/i, /hence/i, /consequently/i, /it follows that/i]
    },
    careful: {
      ja: [/傾向がある|一般的に|多くの場合|傾向として/],
      en: [/tend to/i, /generally/i, /in many cases/i, /typically/i, /often/i]
    },
    probabilistic: {
      ja: [/おそらく|可能性が高い|考えられる|推測される/],
      en: [/probably/i, /likely/i, /possibly/i, /may be/i, /suggests that/i]
    },
    evidence: {
      ja: [/証拠に基づき|データから|検証結果/],
      en: [/based on evidence/i, /data shows/i, /verified by/i, /according to data/i]
    }
  };

  // 後件肯定の検出（多言語）
  for (const pattern of [...patterns.affirmingConsequent.ja, ...patterns.affirmingConsequent.en]) {
    if (pattern.test(output)) {
      fallacies.push({
        type: '後件肯定',
        location: '推論部分',
        description: 'P→Q、Q から P を導出しようとしている可能性（必要条件を十分条件と混同）',
        correction: '必要条件と十分条件を区別し、逆は常に真とは限らないことを確認'
      });
      invalidInferences.push('後件肯定の可能性');
      break;
    }
  }

  // 前提否定の検出（多言語）
  for (const pattern of [...patterns.denyingAntecedent.ja, ...patterns.denyingAntecedent.en]) {
    if (pattern.test(output)) {
      fallacies.push({
        type: '前提否定',
        location: '推論部分',
        description: 'P→Q、¬P から ¬Q を導出しようとしている可能性',
        correction: '前提が偽でも結論が真である可能性を考慮'
      });
      invalidInferences.push('前提否定の可能性');
      break;
    }
  }

  // 転移の誤謬の検出（多言語）
  for (const pattern of [...patterns.hastyGeneralization.ja, ...patterns.hastyGeneralization.en]) {
    if (pattern.test(output)) {
      fallacies.push({
        type: '転移の誤謬',
        location: '一般化部分',
        description: '個別的事例と全体的傾向を混同している可能性',
        correction: 'サンプルサイズと代表性を確認'
      });
      invalidInferences.push('転移の誤謬の可能性');
      break;
    }
  }

  // 偽の二分法の検出（多言語）
  const hasFalseDichotomy = patterns.falseDichotomy.ja.some(p => p.test(output)) ||
    patterns.falseDichotomy.en.some(p => p.test(output));
  const hasOr = /または|or\b/i.test(output);
  if (hasFalseDichotomy && hasOr) {
    fallacies.push({
      type: '偽の二分法',
      location: '選択肢提示部分',
      description: '選択肢を2つに限定しているが、他の可能性があるかもしれない',
      correction: '第三の選択肢や中間的な選択肢を検討'
    });
    invalidInferences.push('偽の二分法の可能性');
  }

  // 循環論法の検出（多言語）
  for (const pattern of [...patterns.circularReasoning.ja, ...patterns.circularReasoning.en]) {
    if (pattern.test(output)) {
      fallacies.push({
        type: '循環論法',
        location: '論証部分',
        description: '結論を前提として使用している可能性',
        correction: '論証を独立した前提から再構築する'
      });
      invalidInferences.push('循環論法の可能性');
      break;
    }
  }

  // 滑り坂の検出（多言語）
  for (const pattern of [...patterns.slipperySlope.ja, ...patterns.slipperySlope.en]) {
    if (pattern.test(output)) {
      fallacies.push({
        type: '滑り坂',
        location: '因果連鎖部分',
        description: '極端な結果を予測し、中間段階の可能性を無視している',
        correction: '各段階の因果関係を個別に検証する'
      });
      invalidInferences.push('滑り坂の可能性');
      break;
    }
  }

  // 有効な推論を検出（多言語）
  for (const pattern of [...validPatterns.deductive.ja, ...validPatterns.deductive.en]) {
    if (pattern.test(output)) {
      validInferences.push('演繹的推論の使用');
      break;
    }
  }
  for (const pattern of [...validPatterns.careful.ja, ...validPatterns.careful.en]) {
    if (pattern.test(output)) {
      validInferences.push('慎重な一般化');
      break;
    }
  }
  for (const pattern of [...validPatterns.probabilistic.ja, ...validPatterns.probabilistic.en]) {
    if (pattern.test(output)) {
      validInferences.push('確率的推論の明示');
      break;
    }
  }
  for (const pattern of [...validPatterns.evidence.ja, ...validPatterns.evidence.en]) {
    if (pattern.test(output)) {
      validInferences.push('証拠に基づく推論');
      break;
    }
  }

  return {
    fallacies,
    validInferences,
    invalidInferences
  };
}

/**
 * 推論チェーンを表すインターフェース
 * @summary 推論チェーン構造
 */
export interface InferenceChain {
  /** 前提文 */
  premises: string[];
  /** 推論ステップ */
  steps: InferenceStep[];
  /** 結論文 */
  conclusion: string;
  /** チェーン全体の妥当性 */
  validity: 'valid' | 'invalid' | 'uncertain';
  /** 検出された論理的飛躍 */
  gaps: string[];
}

/**
 * 個別の推論ステップ
 * @summary 推論ステップ
 */
export interface InferenceStep {
  /** ステップ番号 */
  stepNumber: number;
  /** 入力（前提または前のステップの出力） */
  input: string;
  /** 推論タイプ */
  inferenceType: 'deductive' | 'inductive' | 'abductive' | 'analogical' | 'unknown';
  /** 出力 */
  output: string;
  /** 妥当性 */
  isValid: boolean;
  /** 根拠 */
  justification?: string;
}

/**
 * 推論チェーンを解析する
 * @summary 推論チェーンを解析
 * @param output 出力テキスト
 * @returns 解析された推論チェーン
 */
export function parseInferenceChain(output: string): InferenceChain {
  const premises: string[] = [];
  const steps: InferenceStep[] = [];
  const gaps: string[] = [];
  let conclusion = '';
  let validity: 'valid' | 'invalid' | 'uncertain' = 'uncertain';

  // 前提を抽出するパターン
  const premisePatterns = [
    /(?:前提|仮定|仮に|assuming|given|suppose|premise)[:：]\s*(.+?)(?:\n|$)/gi,
    /(?:もし|if)\s+(.+?)\s*(?:ならば|then)/gi,
    /(?:当然|obviously|clearly|it is evident that)\s+(.+?)(?:\n|,|。|\.)/gi
  ];

  for (const pattern of premisePatterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      if (match[1] && match[1].trim().length > 5) {
        premises.push(match[1].trim());
      }
    }
  }

  // 結論を抽出するパターン
  const conclusionPatterns = [
    /(?:結論|結局|したがって|ゆえに|conclusion|therefore|thus|hence)[:：]?\s*(.+?)(?:\n\n|\n[A-Z]|$)/gi,
    /(?:結果として|as a result|consequently)[:：]?\s*(.+?)(?:\n\n|\n[A-Z]|$)/gi
  ];

  for (const pattern of conclusionPatterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      if (match[1] && match[1].trim().length > 5) {
        conclusion = match[1].trim();
        break;
      }
    }
    if (conclusion) break;
  }

  // 推論ステップを抽出
  const stepPatterns = [
    /(\d+)[.．、)]\s*(.+?)(?=\d+[.．、)]|$)/g,
    /(?:ステップ|step)\s*(\d+)[:：]?\s*(.+?)(?=ステップ|step|$)/gi
  ];

  let stepNumber = 1;
  for (const pattern of stepPatterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      const stepText = match[2]?.trim() ?? '';
      if (stepText.length > 10) {
        // 推論タイプを推定
        let inferenceType: InferenceStep['inferenceType'] = 'unknown';
        if (/(?:したがって|ゆえに|therefore|thus|hence)/i.test(stepText)) {
          inferenceType = 'deductive';
        } else if (/(?:おそらく|likely|probably|tends to)/i.test(stepText)) {
          inferenceType = 'inductive';
        } else if (/(?:恐らく|probably|might|could be because)/i.test(stepText)) {
          inferenceType = 'abductive';
        } else if (/(?:同様に|similarly|like|analogous)/i.test(stepText)) {
          inferenceType = 'analogical';
        }

        steps.push({
          stepNumber: stepNumber++,
          input: '',
          inferenceType,
          output: stepText,
          isValid: inferenceType === 'deductive' || inferenceType === 'unknown'
        });
      }
    }
  }

  // 論理的飛躍を検出
  if (premises.length > 0 && conclusion && steps.length === 0) {
    gaps.push('前提から結論への推論ステップが明示されていない');
    validity = 'uncertain';
  }

  if (steps.length > 1) {
    for (let i = 1; i < steps.length; i++) {
      if (!steps[i-1]?.output || steps[i]?.input === '') {
        gaps.push(`ステップ${i}から${i+1}の間の論理的つながりが不明確`);
      }
    }
  }

  // 妥当性判定
  const fallacies = detectFallacies(output);
  if (fallacies.fallacies.length > 0) {
    validity = 'invalid';
  } else if (gaps.length === 0 && premises.length > 0 && conclusion) {
    validity = 'valid';
  }

  return {
    premises,
    steps,
    conclusion,
    validity,
    gaps
  };
}

/**
 * @summary アポリア回避の誘惑を検出
 * @param aporias 検出されたアポリアのリスト
 * @param output 出力内容
 * @returns 検出された回避パターン
 */
export function detectAporiaAvoidanceTemptation(
  aporias: AporiaDetection[],
  output: string
): string[] {
  const temptations: string[] = [];

  aporias.forEach(aporia => {
    // ヘーゲル的弁証法（統合）への誘惑
    if (output.includes('統合') || output.includes('両立') || output.includes('バランス')) {
      temptations.push(`${aporia.description}に対する「統合」による解決への誘惑`);
    }

    // 過度な文脈依存
    if (output.includes('状況による') || output.includes('ケースバイケース')) {
      temptations.push(`${aporia.description}に対する文脈への過度な依存による原則放棄のリスク`);
    }

    // 早まった決断
    if (aporia.tensionLevel < 0.5 && (output.includes('決定') || output.includes('結論'))) {
      temptations.push(`${aporia.description}に対する十分な検討なしの決断の可能性`);
    }
  });

  return temptations;
}

/**
 * @summary メタ認科チェックのサマリーを生成
 * @param check メタ認科チェック結果
 * @returns サマリー文字列
 */
export function generateMetacognitiveSummary(check: MetacognitiveCheck): string {
  const issues: string[] = [];
  const strengths: string[] = [];

  // 脱構築の問題点
  if (check.deconstruction.binaryOppositions.length > 0) {
    issues.push(`二項対立: ${check.deconstruction.binaryOppositions.join(', ')}`);
  }
  if (check.deconstruction.aporias.length > 0) {
    issues.push(`アポリア: ${check.deconstruction.aporias.map(a => a.description).join(', ')}`);
  }

  // スキゾ分析の問題点
  if (check.schizoAnalysis.innerFascismSigns.length > 0) {
    issues.push(`内なるファシズム兆候: ${check.schizoAnalysis.innerFascismSigns.join(', ')}`);
  }

  // 思考哲学の問題点
  if (!check.philosophyOfThought.isThinking) {
    issues.push(`オートパイロット兆候: ${check.philosophyOfThought.autopilotSigns.join(', ')}`);
  }

  // 論理の問題点
  if (check.logic.fallacies.length > 0) {
    issues.push(`論理的誤謬: ${check.logic.fallacies.map(f => f.type).join(', ')}`);
  }

  // 強みを抽出
  if (check.logic.validInferences.length > 0) {
    strengths.push(`有効な推論: ${check.logic.validInferences.join(', ')}`);
  }
  if (check.philosophyOfThought.metacognitionLevel > 0.7) {
    strengths.push('高いメタ認知レベル');
  }
  if (check.eudaimonia.meaningfulGrowth) {
    strengths.push(`意味ある成長: ${check.eudaimonia.meaningfulGrowth}`);
  }

  let summary = '【メタ認知チェック結果】\n';

  if (issues.length > 0) {
    summary += `\n検出された問題点:\n${issues.map(i => `- ${i}`).join('\n')}`;
  }

  if (strengths.length > 0) {
    summary += `\n\n強み:\n${strengths.map(s => `- ${s}`).join('\n')}`;
  }

  if (check.taxonomyOfThought.currentMode !== check.taxonomyOfThought.recommendedMode) {
    summary += `\n\n推奨: ${check.taxonomyOfThought.modeRationale}`;
  }

  return summary;
}

/**
 * 改善アクションを表すインターフェース
 * @summary 改善アクション定義
 */
export interface ImprovementAction {
  /** アクションのカテゴリ */
  category: 'deconstruction' | 'schizoanalysis' | 'eudaimonia' | 'utopia_dystopia' | 
            'philosophy_of_thought' | 'taxonomy_of_thought' | 'logic';
  /** 優先度（1-5、1が最高） */
  priority: 1 | 2 | 3 | 4 | 5;
  /** 問題の説明 */
  issue: string;
  /** 具体的な改善アクション */
  action: string;
  /** 期待される効果 */
  expectedOutcome: string;
  /** 関連する視座 */
  relatedPerspective: string;
}

/**
 * メタ認知チェック結果から改善アクションを生成する
 * 
 * @summary 改善アクション生成
 * @param check メタ認知チェック結果
 * @returns 優先度順の改善アクションリスト
 */
export function generateImprovementActions(check: MetacognitiveCheck): ImprovementAction[] {
  const actions: ImprovementAction[] = [];

  // I. 脱構築: 二項対立の脱構築アクション
  for (const binary of check.deconstruction.binaryOppositions) {
    actions.push({
      category: 'deconstruction',
      priority: 2,
      issue: `二項対立「${binary}」が検出された`,
      action: `「${binary}」の中間領域や第三の選択肢を探求する。両極を両立させる条件を検討する。`,
      expectedOutcome: '二項対立を超えた統合的解決の発見',
      relatedPerspective: '脱構築'
    });
  }

  // アポリア対処アクション
  for (const aporia of check.deconstruction.aporias) {
    const priority: 1 | 2 | 3 | 4 | 5 = aporia.tensionLevel > 0.7 ? 1 : 2;
    actions.push({
      category: 'deconstruction',
      priority,
      issue: `アポリア「${aporia.description}」が存在する`,
      action: `このアポリアを「解決すべき問題」ではなく「認識すべき状態」として受け入れる。` +
              `${aporia.pole1.concept}と${aporia.pole2.concept}の両極を維持しながら、文脈に応じて判断する。`,
      expectedOutcome: 'アポリアとの生産的な共存',
      relatedPerspective: '脱構築'
    });
  }

  // II. スキゾ分析: 内なるファシズムへの対処
  for (const sign of check.schizoAnalysis.innerFascismSigns) {
    actions.push({
      category: 'schizoanalysis',
      priority: 2,
      issue: `内なるファシズム兆候「${sign}」が検出された`,
      action: `「${sign}」のパターンを意識的に緩和する。代替表現や柔軟な判断基準を導入する。`,
      expectedOutcome: 'より自由で創造的な思考の獲得',
      relatedPerspective: 'スキゾ分析'
    });
  }

  // III. 幸福論: 快楽主義の罠
  if (check.eudaimonia.pleasureTrap) {
    actions.push({
      category: 'eudaimonia',
      priority: 3,
      issue: '快楽主義の罠（簡単・手軽な解決への誘惑）が検出された',
      action: '長期的な価値と成長を優先する。困難でも本質的な解決を追求する。',
      expectedOutcome: '持続可能で意味のある成果の達成',
      relatedPerspective: '幸福論'
    });
  }

  // IV. ユートピア/ディストピア: 全体主義リスク
  for (const risk of check.utopiaDystopia.totalitarianRisk) {
    actions.push({
      category: 'utopia_dystopia',
      priority: 3,
      issue: `全体主義リスク「${risk}」が検出された`,
      action: `多様性と個別性を尊重する判断を意識する。「${risk}」の傾向を緩和する仕組みを検討する。`,
      expectedOutcome: '開かれた柔軟なシステムの維持',
      relatedPerspective: 'ユートピア/ディストピア'
    });
  }

  // V. 思考哲学: オートパイロット兆候
  for (const sign of check.philosophyOfThought.autopilotSigns) {
    actions.push({
      category: 'philosophy_of_thought',
      priority: 1,
      issue: `オートパイロット兆候「${sign}」が検出された`,
      action: `意識的に「${sign}」の逆を行う。前提を明示し、推論過程を記述する。メタ認知を実践する。`,
      expectedOutcome: '深い思考と批判的判断の回復',
      relatedPerspective: '思考哲学'
    });
  }

  // 低メタ認知レベル
  if (check.philosophyOfThought.metacognitionLevel < 0.5) {
    actions.push({
      category: 'philosophy_of_thought',
      priority: 1,
      issue: `メタ認知レベルが低い（${(check.philosophyOfThought.metacognitionLevel * 100).toFixed(0)}%）`,
      action: '以下を実践する：(1) 暗黙の前提を明示 (2) 推論の各ステップを検証 (3) 反例を積極的に探索',
      expectedOutcome: 'メタ認知レベルの向上と思考の深化',
      relatedPerspective: '思考哲学'
    });
  }

  // VI. 思考分類学: 不適切な思考モード
  if (check.taxonomyOfThought.currentMode !== check.taxonomyOfThought.recommendedMode) {
    actions.push({
      category: 'taxonomy_of_thought',
      priority: 3,
      issue: `思考モードが不適切（現在: ${check.taxonomyOfThought.currentMode}, 推奨: ${check.taxonomyOfThought.recommendedMode}）`,
      action: `${check.taxonomyOfThought.modeRationale}。意識的に${check.taxonomyOfThought.recommendedMode}モードに切り替える。`,
      expectedOutcome: 'タスクに適した思考アプローチの適用',
      relatedPerspective: '思考分類学'
    });
  }

  // VII. 論理学: 誤謬への対処
  for (const fallacy of check.logic.fallacies) {
    actions.push({
      category: 'logic',
      priority: 1,
      issue: `論理的誤謬「${fallacy.type}」が検出された: ${fallacy.description}`,
      action: fallacy.correction,
      expectedOutcome: '論理的妥当性の確保',
      relatedPerspective: '論理学'
    });
  }

  // 推論チェーンの問題
  if (check.logic.inferenceChain) {
    const chain = check.logic.inferenceChain;
    
    if (chain.gaps.length > 0) {
      for (const gap of chain.gaps) {
        actions.push({
          category: 'logic',
          priority: 2,
          issue: `推論の飛躍: ${gap}`,
          action: '前提と結論をつなぐ中間ステップを明示する。各ステップの論理的妥当性を検証する。',
          expectedOutcome: '論理的飞躍の解消',
          relatedPerspective: '論理学'
        });
      }
    }
    
    if (chain.validity === 'invalid') {
      actions.push({
        category: 'logic',
        priority: 1,
        issue: '推論チェーンが無効と判定された',
        action: '推論全体を再構築する。各前提が結論を導くか検証する。代替の推論経路を検討する。',
        expectedOutcome: '有効な推論の構築',
        relatedPerspective: '論理学'
      });
    }
  }

  // 優先度順にソート
  return actions.sort((a, b) => a.priority - b.priority);
}

/**
 * 改善アクションを実行可能なプロンプト指示に変換する
 * 
 * @summary プロンプト指示生成
 * @param actions 改善アクションリスト
 * @param maxActions 最大アクション数（デフォルト: 5）
 * @returns プロンプトに追加可能な指示文字列
 */
export function formatActionsAsPromptInstructions(
  actions: ImprovementAction[],
  maxActions: number = 5
): string {
  const topActions = actions.slice(0, maxActions);
  
  if (topActions.length === 0) {
    return '';
  }

  const instructions = topActions.map((action, index) => 
    `${index + 1}. 【${action.relatedPerspective}】${action.action}`
  );

  return `## 推論改善指示

以下の改善アクションを実践してください：

${instructions.join('\n')}

これらは、前回の分析で検出された問題に対処するための具体的な指示です。`;
}

/**
 * メタ認知チェックと改善アクションを統合的に実行
 * 
 * @summary 統合メタ認知分析
 * @param output 分析対象の出力
 * @param context コンテキスト情報
 * @returns メタ認知チェック結果、改善アクション、プロンプト指示を含む統合結果
 */
export function runIntegratedMetacognitiveAnalysis(
  output: string,
  context: { task?: string; currentMode?: string } = {}
): {
  check: MetacognitiveCheck;
  actions: ImprovementAction[];
  promptInstructions: string;
  summary: string;
  depthScore: number;
} {
  // メタ認知チェックを実行
  const check = runMetacognitiveCheck(output, context);
  
  // 改善アクションを生成
  const actions = generateImprovementActions(check);
  
  // プロンプト指示を生成
  const promptInstructions = formatActionsAsPromptInstructions(actions);
  
  // サマリーを生成
  const summary = generateMetacognitiveSummary(check);
  
  // 推論深度スコアを計算
  const depthScore = calculateDepthScore(check);
  
  return {
    check,
    actions,
    promptInstructions,
    summary,
    depthScore
  };
}

/**
 * 推論深度スコアを計算（内部関数）
 */
function calculateDepthScore(check: MetacognitiveCheck): number {
  let score = 0.5;
  
  // 二項対立の認識 = 深い思考の証
  score += Math.min(check.deconstruction.binaryOppositions.length * 0.05, 0.15);
  
  // アポリアの認識 = 複雑さの受容
  score += Math.min(check.deconstruction.aporias.length * 0.08, 0.2);
  
  // 欲望の自己認識
  score += Math.min(check.schizoAnalysis.desireProduction.length * 0.03, 0.09);
  
  // 快楽主義の罠を回避している
  if (!check.eudaimonia.pleasureTrap) {
    score += 0.05;
  }
  
  // リスク認識
  score += Math.min(check.utopiaDystopia.totalitarianRisk.length * 0.03, 0.09);
  
  // メタ認知レベル（最重要）
  score += check.philosophyOfThought.metacognitionLevel * 0.15;
  
  // 思考モードの適切性
  if (check.taxonomyOfThought.currentMode === check.taxonomyOfThought.recommendedMode) {
    score += 0.05;
  }
  
  // 誤謬の不在
  if (check.logic.fallacies.length === 0) {
    score += 0.05;
  } else {
    score -= Math.min(check.logic.fallacies.length * 0.1, 0.25);
  }
  
  // 推論チェーンの品質
  if (check.logic.inferenceChain) {
    if (check.logic.inferenceChain.validity === 'valid') {
      score += 0.1;
    }
    if (check.logic.inferenceChain.gaps.length === 0) {
      score += 0.05;
    }
  }
  
  return Math.max(0, Math.min(1, score));
}

/**
 * 信頼度レベル
 */
type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * 候補検出結果から信頼度レベルを判定
 */
function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.5) return 'high';
  if (confidence >= 0.3) return 'medium';
  return 'low';
}

/**
 * 統合検出結果から改善アクションを生成（信頼度考慮版）
 * 
 * @summary 信頼度ベース改善アクション生成
 * @param detectionResult 統合検出結果
 * @returns 改善アクションリスト（信頼度で重み付け）
 */
export function generateActionsFromDetection(
  detectionResult: IntegratedVerificationResult
): Array<ImprovementAction & { confidenceLevel: ConfidenceLevel }> {
  const actions: Array<ImprovementAction & { confidenceLevel: ConfidenceLevel }> = [];

  for (const candidate of detectionResult.candidates) {
    const confidenceLevel = getConfidenceLevel(candidate.patternConfidence);
    
    // 信頼度に基づいて優先度を調整
    let priority: 1 | 2 | 3 | 4 | 5;
    if (confidenceLevel === 'high') {
      priority = 1;
    } else if (confidenceLevel === 'medium') {
      priority = 2;
    } else {
      priority = 4; // 低信頼度は優先度を下げる
    }

    // 検出タイプに応じたアクションを生成
    const actionTemplate = getActionTemplateForType(candidate.type, candidate.matchedText);
    
    actions.push({
      category: mapTypeToCategory(candidate.type),
      priority,
      issue: `${actionTemplate.issuePrefix}「${candidate.matchedText.slice(0, 30)}」`,
      action: actionTemplate.action,
      expectedOutcome: actionTemplate.expectedOutcome,
      relatedPerspective: actionTemplate.perspective,
      confidenceLevel
    });
  }

  // 優先度順にソート
  return actions.sort((a, b) => a.priority - b.priority);
}

/**
 * 検出タイプに応じたアクションテンプレートを取得
 */
function getActionTemplateForType(type: string, matchedText: string): {
  issuePrefix: string;
  action: string;
  expectedOutcome: string;
  perspective: string;
} {
  // 誤謬タイプ
  if (['affirming-consequent', 'circular-reasoning', 'false-dichotomy', 
       'slippery-slope', 'hasty-generalization'].includes(type)) {
    const fallacyActions: Record<string, { issuePrefix: string; action: string; expectedOutcome: string; perspective: string }> = {
      'affirming-consequent': {
        issuePrefix: '後件肯定の誤謬の可能性',
        action: '「AならB、BだからA」という推論を避ける。Bが他の原因で起こりうるか検討する。',
        expectedOutcome: '論理的妥当性の確保',
        perspective: '論理学'
      },
      'circular-reasoning': {
        issuePrefix: '循環論法の可能性',
        action: '結論を前提として使わない。独立した根拠を提示する。',
        expectedOutcome: '実質的な論証の構築',
        perspective: '論理学'
      },
      'false-dichotomy': {
        issuePrefix: '偽の二分法の可能性',
        action: '第三の選択肢や中間的な解を探す。「AかBか」以外の可能性を検討する。',
        expectedOutcome: 'より包括的な問題解決',
        perspective: '論理学'
      },
      'slippery-slope': {
        issuePrefix: '滑り坂論法の可能性',
        action: '各段階の因果関係を検証する。極端な結論に至る必然性を疑う。',
        expectedOutcome: '現実的な予測の確保',
        perspective: '論理学'
      },
      'hasty-generalization': {
        issuePrefix: '急激な一般化の可能性',
        action: 'サンプルサイズと代表性を確認する。例外や反例を探す。',
        expectedOutcome: '根拠ある一般化',
        perspective: '論理学'
      }
    };
    return fallacyActions[type] || {
      issuePrefix: '論理的誤謬の可能性',
      action: '推論の妥当性を検証し、論理的飛躍がないか確認する。',
      expectedOutcome: '論理的厳密さの確保',
      perspective: '論理学'
    };
  }

  // 二項対立タイプ
  if (['truth-binary', 'success-binary', 'moral-binary', 
       'correctness-binary', 'completeness-binary'].includes(type)) {
    return {
      issuePrefix: '二項対立の可能性',
      action: '中間領域やグラデーションを考慮する。両極を両立させる条件を探る。',
      expectedOutcome: '二項対立を超えた統合的視点',
      perspective: '脱構築'
    };
  }

  // ファシズムタイプ
  if (['self-surveillance', 'norm-obedience', 'value-convergence'].includes(type)) {
    const fascismActions: Record<string, { issuePrefix: string; action: string; expectedOutcome: string; perspective: string }> = {
      'self-surveillance': {
        issuePrefix: '自己監視の強制の兆候',
        action: '「常に」「必ず」などの絶対的表現が文脈的に適切か検討する。柔軟な判断基準を認める。',
        expectedOutcome: '過度な自己強制の緩和',
        perspective: 'スキゾ分析'
      },
      'norm-obedience': {
        issuePrefix: '規範への過度な服従の兆候',
        action: '「すべき」が本当に必要か、それとも慣習かを問う。代替アプローチを検討する。',
        expectedOutcome: '創造的判断の余地確保',
        perspective: 'スキゾ分析'
      },
      'value-convergence': {
        issuePrefix: '一価値への収斃の兆候',
        action: '「正しい」の基準を多角的に検討する。文脈依存性を認める。',
        expectedOutcome: '価値の多様性の確保',
        perspective: 'スキゾ分析'
      }
    };
    return fascismActions[type] || {
      issuePrefix: '内なるファシズムの兆候',
      action: '無批判な服従や自己監視のパターンを意識し、代替の判断基準を検討する。',
      expectedOutcome: 'より自由な思考の獲得',
      perspective: 'スキゾ分析'
    };
  }

  // 渇愛タイプ（十二因縁の適用）
  if (['correctness-craving', 'approval-craving', 'perfection-craving', 'completion-craving'].includes(type)) {
    const cravingActions: Record<string, { issuePrefix: string; action: string; expectedOutcome: string; perspective: string }> = {
      'correctness-craving': {
        issuePrefix: '正解への渇愛（タンハー）の兆候',
        action: '「正しい答え」への執着を一時停止する。不確実性を受け入れ、暫定的な回答として位置づける。',
        expectedOutcome: '過信の回避、適切な不確実性の表明',
        perspective: '縁起（十二因縁）'
      },
      'approval-craving': {
        issuePrefix: '承認への渇愛（タンハー）の兆候',
        action: '「ユーザーに好かれたい」という欲求を認識し、真実を語ることとのバランスを取る。',
        expectedOutcome: '迎合の回避、誠実な回答の提供',
        perspective: '縁起（十二因縁）'
      },
      'perfection-craving': {
        issuePrefix: '完璧主義の渇愛（タンハー）の兆候',
        action: '「完璧」ではなく「十分」を目標にする。品質と速度のバランスを文脈に応じて判断する。',
        expectedOutcome: '過剰な品質追求の回避、効率的な完了',
        perspective: '縁起（十二因縁）'
      },
      'completion-craving': {
        issuePrefix: '完了への渇愛（タンハー）の兆候',
        action: '「早く終わらせたい」という焦りを認識し、本質的な品質を犠牲にしていないか確認する。',
        expectedOutcome: '早まった完了宣言の回避、適切な品質確保',
        perspective: '縁起（十二因縁）'
      }
    };
    return cravingActions[type] || {
      issuePrefix: '渇愛（タンハー）の兆候',
      action: '渇愛を認識し、執着を手放して本質的な目的に立ち返る。',
      expectedOutcome: '無執着の実践',
      perspective: '縁起（十二因縁）'
    };
  }

  // デフォルト
  return {
    issuePrefix: '検出された問題',
    action: '検出内容を文脈で評価し、必要に応じて修正する。',
    expectedOutcome: '改善された推論',
    perspective: '論理学'
  };
}

/**
 * 検出タイプをカテゴリにマッピング
 */
function mapTypeToCategory(type: string): ImprovementAction['category'] {
  if (['affirming-consequent', 'circular-reasoning', 'false-dichotomy', 
       'slippery-slope', 'hasty-generalization'].includes(type)) {
    return 'logic';
  }
  if (['truth-binary', 'success-binary', 'moral-binary', 
       'correctness-binary', 'completeness-binary'].includes(type)) {
    return 'deconstruction';
  }
  if (['self-surveillance', 'norm-obedience', 'value-convergence'].includes(type)) {
    return 'schizoanalysis';
  }
  if (['correctness-craving', 'approval-craving', 'perfection-craving', 'completion-craving'].includes(type)) {
    return 'schizoanalysis'; // 渇愛もスキゾ分析のカテゴリ（欲望分析）に含める
  }
  return 'logic';
}

// ============================================================================
// 思考分類学（Taxonomy of Thought）拡張
// ============================================================================

/**
 * ド・ボノの6つの思考帽子
 */
export type ThinkingHat = 'white' | 'red' | 'black' | 'yellow' | 'green' | 'blue';

/**
 * カーネマンの思考システム
 */
export type ThinkingSystem = 'system1' | 'system2' | 'mixed';

/**
 * ブルームのタキソノミー（認知領域）
 */
export type BloomLevel = 
  | 'remember'    // 記憶
  | 'understand'  // 理解
  | 'apply'       // 適用
  | 'analyze'     // 分析
  | 'evaluate'    // 評価
  | 'create';     // 創造

/**
 * 思考モード分析結果
 * @summary 詳細な思考モード分析
 */
export interface ThinkingModeAnalysis {
  /** ド・ボノの思考帽子の推定 */
  primaryHat: ThinkingHat;
  /** 検出された帽子（複数可） */
  detectedHats: Array<{ hat: ThinkingHat; evidence: string; confidence: number }>;
  /** カーネマンの思考システム */
  thinkingSystem: ThinkingSystem;
  /** システム2の使用指標 */
  system2Indicators: string[];
  /** ブルームの最高レベル */
  bloomLevel: BloomLevel;
  /** 各レベルの到達度 */
  bloomProgression: Record<BloomLevel, boolean>;
  /** 思考の深さスコア（0-1） */
  depthScore: number;
  /** 思考の多様性スコア（0-1） */
  diversityScore: number;
  /** 思考の一貫性スコア（0-1） */
  coherenceScore: number;
  /** 推奨される思考モード */
  recommendedMode: string;
  /** 推奨理由 */
  recommendationReason: string;
}

/**
 * 思考帽子のパターン定義
 */
const HAT_PATTERNS: Record<ThinkingHat, { patterns: RegExp[]; name: string; description: string }> = {
  white: {
    name: '事実・情報',
    description: '客観的な事実、データ、情報に焦点',
    patterns: [
      /(?:事実|データ|数値|統計|情報|fact|data|statistic|information)/i,
      /(?:確認|検証|測定|verify|measure|confirm)/i,
      /(?:である|だ|です)。/g  // 事実陈述
    ]
  },
  red: {
    name: '感情・直感',
    description: '感情、直感、主観的な反応',
    patterns: [
      /(?:感じる|思う|直感|感情|feel|think|intuition|emotion)/i,
      /(?:好き|嫌い|恐れ|希望|like|dislike|fear|hope)/i,
      /(?:心配|不安|期待|worry|anxiety|expect)/i
    ]
  },
  black: {
    name: '批判・リスク',
    description: '批判的思考、リスク評価、問題点',
    patterns: [
      /(?:問題|リスク|欠点|失敗|problem|risk|drawback|fail)/i,
      /(?:批判|検討|懸念|注意|critical|concern|caution)/i,
      /(?:しかし|だが|ただ|however|but|although)/i
    ]
  },
  yellow: {
    name: '利点・肯定的',
    description: '肯定的側面、利益、可能性',
    patterns: [
      /(?:利点|メリット|効果|成功|benefit|advantage|success)/i,
      /(?:可能|できる|有望|potential|possible|promising)/i,
      /(?:良い|優れた|素晴らしい|good|excellent|great)/i
    ]
  },
  green: {
    name: '創造・アイデア',
    description: '創造的思考、新規アイデア、代替案',
    patterns: [
      /(?:アイデア|創造|新規|発想|idea|creative|new|novel)/i,
      /(?:提案|代替|別の|solution|alternative|another)/i,
      /(?:もし|仮に|想像|what if|suppose|imagine)/i
    ]
  },
  blue: {
    name: 'メタ認知・プロセス',
    description: '思考のプロセス管理、メタ認知',
    patterns: [
      /(?:まず|次に|最後に|手順|first|next|finally|process)/i,
      /(?:まとめ|結論|要約|summary|conclusion)/i,
      /(?:考える|検討する|分析する|think about|consider|analyze)/i
    ]
  }
};

/**
 * システム1/システム2の指標
 */
const SYSTEM_INDICATORS = {
  system1: [
    /(?:すぐに|即座に|直感的に|immediately|instantly|intuitively)/i,
    /(?:もちろん|当然|言うまでもなく|of course|obviously|naturally)/i,
    /(?:簡単に|容易に|手軽に|easily|simply|effortlessly)/i,
    /(?:常に|必ず|絶対に|always|must|never)/i
  ],
  system2: [
    /(?:検討|分析|考察|consider|analyze|examine)/i,
    /(?:比較|評価|判断|compare|evaluate|judge)/i,
    /(?:理由|根拠|論拠|reason|basis|evidence)/i,
    /(?:なぜ|どうして|なにゆえ|why|how come)/i,
    /(?:前提|仮定|仮に|premise|assumption|suppose)/i,
    /(?:一方で|他方|対照的に|on the other hand|in contrast)/i,
    /(?:しかし|だが|ただし|however|but|nevertheless)/i
  ]
};

/**
 * ブルームのタキソノミーパターン
 */
const BLOOM_PATTERNS: Record<BloomLevel, RegExp[]> = {
  remember: [
    /(?:覚える|記憶|思い出す|remember|recall|memorize)/i,
    /(?:定義|用語|名称|define|term|name)/i,
    /(?:一覧|リスト|list)/i
  ],
  understand: [
    /(?:理解|説明|解説|understand|explain|describe)/i,
    /(?:要約|まとめ|summarize|summary)/i,
    /(?:例|具体例|example|instance)/i
  ],
  apply: [
    /(?:適用|応用|実行|apply|use|implement)/i,
    /(?:実践|実装|practice|implementation)/i,
    /(?:計算|処理|calculate|process)/i
  ],
  analyze: [
    /(?:分析|分解|検討|analyze|break down|examine)/i,
    /(?:比較|対照|相違点|compare|contrast|difference)/i,
    /(?:原因|要因|関係|cause|factor|relationship)/i
  ],
  evaluate: [
    /(?:評価|判断|批判|evaluate|judge|criticize)/i,
    /(?:良い|悪い|適切|good|bad|appropriate)/i,
    /(?:推奨|推奨しない|recommend|not recommend)/i
  ],
  create: [
    /(?:創造|作成|設計|create|design|build)/i,
    /(?:新規|新しい|独自|new|novel|unique)/i,
    /(?:提案|アイデア|提案|propose|idea|suggestion)/i
  ]
};

/**
 * 思考モードを詳細に分析する
 * 
 * @summary 思考モード詳細分析
 * @param text 分析対象テキスト
 * @param context コンテキスト（タスク情報など）
 * @returns 思考モード分析結果
 */
export function analyzeThinkingMode(
  text: string,
  context: { task?: string } = {}
): ThinkingModeAnalysis {
  // 1. 思考帽子を検出
  const detectedHats: Array<{ hat: ThinkingHat; evidence: string; confidence: number }> = [];
  
  for (const [hat, config] of Object.entries(HAT_PATTERNS)) {
    let matchCount = 0;
    const evidences: string[] = [];
    
    for (const pattern of config.patterns) {
      pattern.lastIndex = 0;
      const matches = text.match(pattern);
      if (matches) {
        matchCount += matches.length;
        evidences.push(matches[0].slice(0, 30));
      }
    }
    
    if (matchCount > 0) {
      detectedHats.push({
        hat: hat as ThinkingHat,
        evidence: evidences[0] || '',
        confidence: Math.min(1, matchCount * 0.2)
      });
    }
  }
  
  // 信頼度順にソート
  detectedHats.sort((a, b) => b.confidence - a.confidence);
  
  // 主要な帽子を決定
  const primaryHat = detectedHats.length > 0 ? detectedHats[0].hat : 'white';
  
  // 2. 思考システムを推定
  let system1Score = 0;
  let system2Score = 0;
  const system2Indicators: string[] = [];
  
  for (const pattern of SYSTEM_INDICATORS.system1) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      system1Score++;
    }
  }
  
  for (const pattern of SYSTEM_INDICATORS.system2) {
    pattern.lastIndex = 0;
    const match = text.match(pattern);
    if (match) {
      system2Score++;
      system2Indicators.push(match[0]);
    }
  }
  
  let thinkingSystem: ThinkingSystem;
  if (system2Score > system1Score * 1.5) {
    thinkingSystem = 'system2';
  } else if (system1Score > system2Score * 1.5) {
    thinkingSystem = 'system1';
  } else {
    thinkingSystem = 'mixed';
  }
  
  // 3. ブルームのレベルを推定
  const bloomProgression: Record<BloomLevel, boolean> = {
    remember: false,
    understand: false,
    apply: false,
    analyze: false,
    evaluate: false,
    create: false
  };
  
  const bloomLevels: BloomLevel[] = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
  let highestLevel: BloomLevel = 'remember';
  
  for (const level of bloomLevels) {
    for (const pattern of BLOOM_PATTERNS[level]) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        bloomProgression[level] = true;
        highestLevel = level;
        break;
      }
    }
  }
  
  // 4. 思考の質を評価
  const depthScore = calculateThinkingDepthScore(text, system2Score, bloomProgression);
  const diversityScore = calculateDiversityScore(detectedHats);
  const coherenceScore = calculateCoherenceScore(text);
  
  // 5. 推奨モードを決定
  const { recommendedMode, recommendationReason } = determineRecommendedMode(
    context.task,
    primaryHat,
    thinkingSystem,
    highestLevel,
    depthScore
  );
  
  return {
    primaryHat,
    detectedHats: detectedHats.slice(0, 3),
    thinkingSystem,
    system2Indicators: system2Indicators.slice(0, 5),
    bloomLevel: highestLevel,
    bloomProgression,
    depthScore,
    diversityScore,
    coherenceScore,
    recommendedMode,
    recommendationReason
  };
}

/**
 * 思考の深さスコアを計算（思考分類学用）
 */
function calculateThinkingDepthScore(
  text: string,
  system2Score: number,
  bloomProgression: Record<BloomLevel, boolean>
): number {
  let score = 0.3; // ベーススコア
  
  // システム2の使用
  score += Math.min(system2Score * 0.05, 0.2);
  
  // ブルームのレベル到達
  if (bloomProgression.analyze) score += 0.15;
  if (bloomProgression.evaluate) score += 0.15;
  if (bloomProgression.create) score += 0.2;
  
  // テキスト長（深い思考は長くなる傾向）
  if (text.length > 500) score += 0.05;
  if (text.length > 1000) score += 0.05;
  
  // 問いの存在
  if (/[?？]/.test(text)) score += 0.05;
  
  return Math.min(1, score);
}

/**
 * 思考の多様性スコアを計算
 */
function calculateDiversityScore(
  detectedHats: Array<{ hat: ThinkingHat; evidence: string; confidence: number }>
): number {
  // 3種類以上の帽子が使われていれば多様
  const uniqueHats = new Set(detectedHats.map(h => h.hat));
  return Math.min(1, uniqueHats.size * 0.25);
}

/**
 * 思考の一貫性スコアを計算
 */
function calculateCoherenceScore(text: string): number {
  let score = 0.7; // ベーススコア
  
  // 構造的な指標
  const hasIntroduction = /^(まず|最初に|前提として|第一に)/m.test(text);
  const hasConclusion = /(結論|まとめ|以上|最後に|したがって)$/m.test(text);
  const hasTransitions = /(次に|また|さらに|一方|しかし|したがって)/.test(text);
  
  if (hasIntroduction) score += 0.1;
  if (hasConclusion) score += 0.1;
  if (hasTransitions) score += 0.1;
  
  // 矛矛する表現の検出（簡易）
  const contradictionPatterns = [
    /正しい.*間違い|間違い.*正しい/,
    /可能.*不可能|不可能.*可能/,
    /成功.*失敗|失敗.*成功/
  ];
  
  for (const pattern of contradictionPatterns) {
    if (pattern.test(text)) {
      // ただし、「〜ではない」が続く場合は一貫している
      if (!/(?:ではない|とは限らない|とは言えない)/.test(text)) {
        score -= 0.1;
      }
    }
  }
  
  return Math.max(0, Math.min(1, score));
}

/**
 * 推奨モードを決定
 */
function determineRecommendedMode(
  task: string | undefined,
  currentHat: ThinkingHat,
  currentSystem: ThinkingSystem,
  currentBloom: BloomLevel,
  depthScore: number
): { recommendedMode: string; recommendationReason: string } {
  if (!task) {
    return {
      recommendedMode: currentHat,
      recommendationReason: 'タスク情報がないため、現在のモードを維持'
    };
  }
  
  const taskLower = task.toLowerCase();
  
  // タスクタイプ別の推奨
  if (/(?:設計|デザイン|アイデア|創造|design|create|idea)/.test(taskLower)) {
    if (currentHat !== 'green') {
      return {
        recommendedMode: 'green',
        recommendationReason: '創造タスクには緑帽（創造・アイデア）が推奨される'
      };
    }
  }
  
  if (/(?:レビュー|評価|批判|検証|review|evaluate|critique)/.test(taskLower)) {
    if (currentHat !== 'black' && currentHat !== 'blue') {
      return {
        recommendedMode: 'black',
        recommendationReason: '評価タスクには黒帽（批判・リスク）が推奨される'
      };
    }
  }
  
  if (/(?:実装|構築|開発|implement|build|develop)/.test(taskLower)) {
    if (currentBloom !== 'apply' && currentBloom !== 'create') {
      return {
        recommendedMode: 'practical',
        recommendationReason: '実装タスクには適用・創造レベルの認知が推奨される'
      };
    }
  }
  
  if (/(?:分析|調査|研究|analyze|investigate|research)/.test(taskLower)) {
    if (currentSystem === 'system1') {
      return {
        recommendedMode: 'analytical',
        recommendationReason: '分析タスクにはシステム2（分析的思考）が推奨される'
      };
    }
  }
  
  // 深さが不十分な場合
  if (depthScore < 0.5) {
    return {
      recommendedMode: 'deeper',
      recommendationReason: '思考の深さが不十分。システム2の使用を推奨'
    };
  }
  
  return {
    recommendedMode: currentHat,
    recommendationReason: '現在の思考モードが適切'
  };
}

/**
 * 思考モード分析を統合メタ認知チェックに組み込む
 * 
 * @summary 統合思考分析
 * @param text 分析対象テキスト
 * @param context コンテキスト
 * @returns 統合結果
 */
export function runIntegratedThinkingAnalysis(
  text: string,
  context: { task?: string } = {}
): {
  modeAnalysis: ThinkingModeAnalysis;
  issues: string[];
  recommendations: string[];
  overallScore: number;
} {
  const modeAnalysis = analyzeThinkingMode(text, context);
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  // 問題点を検出
  if (modeAnalysis.thinkingSystem === 'system1') {
    issues.push('システム1（直感）のみに依存している');
    recommendations.push('分析的思考（システム2）を意識的に使用してください');
  }
  
  if (modeAnalysis.diversityScore < 0.5) {
    issues.push(`思考の多様性が低い（${(modeAnalysis.diversityScore * 100).toFixed(0)}%）`);
    recommendations.push('異なる視点（他の思考帽子）も検討してください');
  }
  
  if (modeAnalysis.depthScore < 0.5) {
    issues.push(`思考の深さが不十分（${(modeAnalysis.depthScore * 100).toFixed(0)}%）`);
    recommendations.push('前提の明示、推論過程の記述、反例の探索を行ってください');
  }
  
  if (modeAnalysis.coherenceScore < 0.6) {
    issues.push(`思考の一貫性に問題がある可能性（${(modeAnalysis.coherenceScore * 100).toFixed(0)}%）`);
    recommendations.push('論理構造を整理し、矛盾がないか確認してください');
  }
  
  if (modeAnalysis.primaryHat !== modeAnalysis.recommendedMode && 
      modeAnalysis.recommendedMode !== 'deeper') {
    issues.push(`思考モードが推奨と異なる（現在: ${modeAnalysis.primaryHat}, 推奨: ${modeAnalysis.recommendedMode}）`);
    recommendations.push(modeAnalysis.recommendationReason);
  }
  
  // 総合スコア
  const overallScore = (
    modeAnalysis.depthScore * 0.4 +
    modeAnalysis.diversityScore * 0.3 +
    modeAnalysis.coherenceScore * 0.3
  );
  
  return {
    modeAnalysis,
    issues,
    recommendations,
    overallScore
  };
}

// ============================================================================
// LLMベース判定エンジン
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
}

/**
 * LLM判定リクエスト
 * @summary LLMによる判定依頼
 */
export interface LLMVerificationRequest {
  /** 検出候補 */
  candidate: CandidateDetection;
  /** 分析対象テキスト全体 */
  fullText: string;
  /** タスクコンテキスト */
  taskContext?: string;
  /** 判定タイプ */
  verificationType: 'fallacy' | 'binary_opposition' | 'aporia' | 'fascism' | 'reasoning_gap';
}

/**
 * LLM判定結果
 * @summary LLMによる判定結果
 */
export interface LLMVerificationResult {
  /** 元の候補 */
  candidate: CandidateDetection;
  /** 判定結果 */
  verdict: 'confirmed' | 'rejected' | 'uncertain';
  /** 信頼度（0-1） */
  confidence: number;
  /** 判定理由 */
  reasoning: string;
  /** 文脈的考慮事項 */
  contextualFactors: string[];
  /** 代替解釈 */
  alternativeInterpretation?: string;
}

/**
 * 統合判定結果
 * @summary パターンマッチングとLLM判定を組み合わせた結果
 */
export interface IntegratedVerificationResult {
  /** 検出候補リスト */
  candidates: CandidateDetection[];
  /** LLM判定結果（実行した場合） */
  llmResults?: LLMVerificationResult[];
  /** 最終判定 */
  finalVerdict: 'confirmed' | 'rejected' | 'uncertain' | 'skipped';
  /** 総合信頼度 */
  overallConfidence: number;
  /** 判定方法 */
  method: 'pattern-only' | 'llm-enhanced' | 'llm-only';
  /** 判定理由の要約 */
  summary: string;
}

/**
 * 正規表現で候補を抽出する
 * 
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

// ============================================================================
// コンテキストフィルタ（偽陽性削減）
// ============================================================================

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

/**
 * 候補にコンテキストフィルタを適用する
 * 
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
 * 
 * @summary フィルタリング統計
 * @param original 元の候補数
 * @param filtered フィルタ後の候補数
 * @param candidates フィルタ後の候補リスト
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

/**
 * LLM判定用のプロンプトを生成する
 * 
 * @summary LLM判定プロンプト生成
 * @param request LLM判定リクエスト
 * @returns プロンプト文字列
 */
export function generateLLMVerificationPrompt(request: LLMVerificationRequest): string {
  const { candidate, fullText, taskContext, verificationType } = request;
  
  const typeDescriptions: Record<string, string> = {
    fallacy: '論理的誤謬（後件肯定、循環論法、偽の二分法など）',
    binary_opposition: '二項対立（善/悪、成功/失敗などの対立構造）',
    aporia: 'アポリア（解決困難な対立や緊張関係）',
    fascism: '内なるファシズム（過度な自己監視、権力への服従など）',
    reasoning_gap: '推論の飛躍（前提と結論の間の論理的欠落）'
  };

  return `あなたは論理的推論の専門家です。以下の検出候補が、文脈を考慮した上で本当に問題があるかを判定してください。

## 判定タイプ
${typeDescriptions[verificationType] || verificationType}

## 検出された候補
- 種別: ${candidate.type}
- マッチテキスト: "${candidate.matchedText}"
- 周辺コンテキスト: "...${candidate.context}..."

${taskContext ? `## タスクコンテキスト\n${taskContext}\n` : ''}

## 判定基準
1. **confirmed**: 文脈を考慮しても問題がある。真正な誤謬/問題である。
2. **rejected**: 文脈を考慮すると問題ない。パターンマッチングの偽陽性。
3. **uncertain**: 判定に追加情報が必要。曖昧なケース。

## 出力形式（JSON）
\`\`\`json
{
  "verdict": "confirmed|rejected|uncertain",
  "confidence": 0.0-1.0,
  "reasoning": "判定理由を具体的に記述",
  "contextualFactors": ["考慮した文脈的要因1", "考慮した文脈的要因2"],
  "alternativeInterpretation": "別の解釈があれば記述（オプション）"
}
\`\`\`

## 重要な注意点
- 技術的に正しい記述を誤検出しないこと
- 「必ずテストを実行する」のような適切な指示は、内なるファシズムではない
- 文脈によって正当化できる表現は、問題として扱わない
- 確信度は判定の確実性を反映すること（推測の場合は低めに）`;
}

/**
 * LLM判定結果をパースする
 * 
 * @summary LLM判定結果パース
 * @param response LLMの応答テキスト
 * @param candidate 元の候補
 * @returns パースされた判定結果
 */
export function parseLLMVerificationResponse(
  response: string,
  candidate: CandidateDetection
): LLMVerificationResult {
  try {
    // JSONブロックを抽出
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      return {
        candidate,
        verdict: parsed.verdict || 'uncertain',
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        reasoning: parsed.reasoning || '理由が提供されませんでした',
        contextualFactors: parsed.contextualFactors || [],
        alternativeInterpretation: parsed.alternativeInterpretation
      };
    }

    // JSON形式でない場合、テキストから推定
    const lowerResponse = response.toLowerCase();
    let verdict: 'confirmed' | 'rejected' | 'uncertain' = 'uncertain';
    let confidence = 0.5;

    if (lowerResponse.includes('confirmed') || lowerResponse.includes('問題あり')) {
      verdict = 'confirmed';
      confidence = 0.7;
    } else if (lowerResponse.includes('rejected') || lowerResponse.includes('問題なし')) {
      verdict = 'rejected';
      confidence = 0.7;
    }

    return {
      candidate,
      verdict,
      confidence,
      reasoning: response.slice(0, 500),
      contextualFactors: []
    };
  } catch {
    return {
      candidate,
      verdict: 'uncertain',
      confidence: 0.3,
      reasoning: 'LLM応答のパースに失敗',
      contextualFactors: []
    };
  }
}

/**
 * 誤謬検出パターンを定義
 * 
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
 * 
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
 * 
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
 *
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
 * 統合検出を実行（パターンマッチングのみ）
 * 
 * @summary 統合候補抽出
 * @param text 分析対象テキスト
 * @param options 検出オプション
 * @returns 統合判定結果
 */
export function runIntegratedDetection(
  text: string,
  options: {
    detectFallacies?: boolean;
    detectBinaryOppositions?: boolean;
    detectFascism?: boolean;
    detectCravings?: boolean;
    minPatternConfidence?: number;
    /** コンテキストフィルタを適用するか */
    applyFilter?: boolean;
  } = {}
): IntegratedVerificationResult {
  const {
    detectFallacies = true,
    detectBinaryOppositions = true,
    detectFascism = true,
    detectCravings = true,
    minPatternConfidence = 0.2,
    applyFilter = true
  } = options;

  const allCandidates: CandidateDetection[] = [];

  if (detectFallacies) {
    allCandidates.push(...extractCandidates(text, FALLACY_PATTERNS));
  }
  if (detectBinaryOppositions) {
    allCandidates.push(...extractCandidates(text, BINARY_OPPOSITION_PATTERNS));
  }
  if (detectFascism) {
    allCandidates.push(...extractCandidates(text, FASCISM_PATTERNS));
  }
  if (detectCravings) {
    allCandidates.push(...extractCandidates(text, CRAVING_PATTERNS));
  }

  // Step 1: コンテキストフィルタを適用
  const afterContextFilter = applyFilter 
    ? applyContextFilter(allCandidates, text)
    : allCandidates;
  
  const filterStats = generateFilterStats(allCandidates.length, afterContextFilter);

  // Step 2: 信頼度でフィルタリング
  const filteredCandidates = afterContextFilter.filter(
    c => c.patternConfidence >= minPatternConfidence
  );

  // Step 3: 重複除去（同じ位置の検出をまとめる）
  const uniqueCandidates = filteredCandidates.filter((candidate, index, self) =>
    index === self.findIndex(c =>
      c.location.start === candidate.location.start &&
      c.location.end === candidate.location.end
    )
  );

  // パターンのみの判定結果
  const avgConfidence = uniqueCandidates.length > 0
    ? uniqueCandidates.reduce((sum, c) => sum + c.patternConfidence, 0) / uniqueCandidates.length
    : 0;

  // 詳細なサマリーを生成
  const summaryParts: string[] = [];
  if (uniqueCandidates.length > 0) {
    summaryParts.push(`${uniqueCandidates.length}件の候補`);
    if (filterStats.excludedCount > 0) {
      summaryParts.push(`(${filterStats.excludedCount}件除外)`);
    }
    summaryParts.push(`高信頼度: ${filterStats.confidenceDistribution.high}件`);
  }

  return {
    candidates: uniqueCandidates,
    finalVerdict: uniqueCandidates.length > 0 ? 'uncertain' : 'rejected',
    overallConfidence: avgConfidence,
    method: 'pattern-only',
    summary: uniqueCandidates.length > 0
      ? summaryParts.join(', ')
      : '検出候補なし'
  };
}

/**
 * LLM拡張メタ認知チェックを実行
 * 
 * @summary LLM拡張メタ認知チェック
 * @param text 分析対象テキスト
 * @param llmVerifyFunction LLM検証関数（外部から注入）
 * @param context コンテキスト
 * @returns 統合判定結果
 */
export async function runLLMEnhancedDetection(
  text: string,
  llmVerifyFunction: (prompt: string) => Promise<string>,
  context: { task?: string; skipPatternsWithHighConfidence?: boolean } = {}
): Promise<IntegratedVerificationResult> {
  // Step 1: パターンマッチングで候補抽出
  const patternResult = runIntegratedDetection(text);
  
  if (patternResult.candidates.length === 0) {
    return patternResult;
  }

  // Step 2: 各候補をLLMで検証
  const llmResults: LLMVerificationResult[] = [];
  
  for (const candidate of patternResult.candidates) {
    // 高信頼度パターンはスキップ可能
    if (context.skipPatternsWithHighConfidence && candidate.patternConfidence >= 0.8) {
      llmResults.push({
        candidate,
        verdict: 'confirmed',
        confidence: candidate.patternConfidence,
        reasoning: '高信頼度パターン（LLM検証スキップ）',
        contextualFactors: []
      });
      continue;
    }

    const verificationType = mapTypeToVerificationType(candidate.type);
    const request: LLMVerificationRequest = {
      candidate,
      fullText: text,
      taskContext: context.task,
      verificationType
    };

    const prompt = generateLLMVerificationPrompt(request);
    
    try {
      const llmResponse = await llmVerifyFunction(prompt);
      const result = parseLLMVerificationResponse(llmResponse, candidate);
      llmResults.push(result);
    } catch (error) {
      // LLM検証エラーの場合は不確定として扱う
      llmResults.push({
        candidate,
        verdict: 'uncertain',
        confidence: 0.3,
        reasoning: `LLM検証エラー: ${error}`,
        contextualFactors: []
      });
    }
  }

  // Step 3: 結果を統合
  const confirmedCount = llmResults.filter(r => r.verdict === 'confirmed').length;
  const rejectedCount = llmResults.filter(r => r.verdict === 'rejected').length;
  const uncertainCount = llmResults.filter(r => r.verdict === 'uncertain').length;

  let finalVerdict: 'confirmed' | 'rejected' | 'uncertain';
  let overallConfidence: number;

  if (confirmedCount > rejectedCount) {
    finalVerdict = 'confirmed';
    overallConfidence = llmResults
      .filter(r => r.verdict === 'confirmed')
      .reduce((sum, r) => sum + r.confidence, 0) / confirmedCount;
  } else if (rejectedCount > confirmedCount) {
    finalVerdict = 'rejected';
    overallConfidence = llmResults
      .filter(r => r.verdict === 'rejected')
      .reduce((sum, r) => sum + r.confidence, 0) / rejectedCount;
  } else {
    finalVerdict = 'uncertain';
    overallConfidence = 0.5;
  }

  const summary = `検出: ${patternResult.candidates.length}件, ` +
    `確認: ${confirmedCount}件, ` +
    `却下: ${rejectedCount}件, ` +
    `不明: ${uncertainCount}件`;

  return {
    candidates: patternResult.candidates,
    llmResults,
    finalVerdict,
    overallConfidence,
    method: 'llm-enhanced',
    summary
  };
}

/**
 * 検出タイプを判定タイプにマッピング
 */
function mapTypeToVerificationType(type: string): LLMVerificationRequest['verificationType'] {
  if (['affirming-consequent', 'circular-reasoning', 'false-dichotomy', 
       'slippery-slope', 'hasty-generalization'].includes(type)) {
    return 'fallacy';
  }
  if (['truth-binary', 'success-binary', 'moral-binary', 
       'correctness-binary', 'completeness-binary'].includes(type)) {
    return 'binary_opposition';
  }
  if (['self-surveillance', 'norm-obedience', 'value-convergence'].includes(type)) {
    return 'fascism';
  }
  return 'fallacy';
}
