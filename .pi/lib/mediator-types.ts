/**
 * @abdd.meta
 * path: .pi/lib/mediator-types.ts
 * role: Mediator層の型定義コレクション
 * why: 論文「Intent Mismatch Causes LLMs to Get Lost in Multi-Turn Conversation」の知見に基づき、ユーザーとエージェント間の意図推論を分離するため
 * related: .pi/lib/intent-mediator.ts, .pi/lib/mediator-history.ts, .pi/lib/mediator-prompt.ts
 * public_api: IntentInferenceResult, MediatorContext, ConfirmedFact, ConversationSummary, ClarificationQuestion, LiCDetectionResult
 * invariants: ConfirmedFactは一意のfactIdを持つ、ConversationSummaryは単調増加するturnCountを持つ
 * side_effects: なし（型定義のみ）
 * failure_modes: なし
 * @abdd.explain
 * overview: Mediator層の型定義を集約したモジュール。論文のEquation (3)とEquation (5)に基づき、意図推論と実行を分離するデータ構造を提供する。
 * what_it_does:
 *   - IntentInferenceResult: ユーザー入力から推論された意図を表現する
 *   - MediatorContext: 現在の会話コンテキストと履歴を保持する
 *   - ConfirmedFact: ユーザーが確認した事実を永続化可能な形式で定義する
 *   - ConversationSummary: マルチターン会話の要約を管理する
 *   - ClarificationQuestion: 曖昧な入力に対する明確化質問を生成する
 *   - LiCDetectionResult: Lost in Context検出の結果を表現する
 * why_it_exists:
 *   - 論文の知見に基づき、意図ミスマッチを防ぐMediator層を実装するため
 *   - Training-freeで動作するインコンテキスト学習を支援するため
 * scope:
 *   in: なし
 *   out: intent-mediator.ts, mediator-history.ts, mediator-prompt.ts
 */

/**
 * Mediator Types Module.
 * Based on paper "Intent Mismatch Causes LLMs to Get Lost in Multi-Turn Conversation" (arXiv:2602.07338v1)
 *
 * Key concepts:
 * - Equation (3): P(R|C_t) = Σ P(R|I_t) * P(I_t|C_t) - Separation of intent inference and execution
 * - Equation (5): Û ~ P(U | C_t, ℋ) - Intent reconstruction from context and history
 * - LiC Detection: Detecting fallback to "average user" prior
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * 意図推論の信頼度レベル
 * @summary 推論信頼度
 */
export type IntentConfidence = "high" | "medium" | "low" | "ambiguous";

/**
 * 意図の明確さ
 * @summary 意図明確度
 */
export type IntentClarity = "explicit" | "implicit" | "ambiguous" | "contradictory";

/**
 * 確認済みの事実
 * @summary 確認済み事実
 * @description ユーザーが明示的に確認した事実。Experience Refinerの成功/失敗ペア(D⁻, D⁺)から抽出されたガイドラインも含む。
 */
export interface ConfirmedFact {
  /** 一意の事実ID */
  factId: string;
  /** 事実の内容 */
  content: string;
  /** 事実のカテゴリ */
  category: FactCategory;
  /** 確認された日時（ISO 8601形式） */
  confirmedAt: string;
  /** この事実が派生した元の会話ターン */
  sourceTurn?: number;
  /** 事実の信頼度（0.0-1.0） */
  confidence: number;
  /** 関連するタグ */
  tags?: string[];
}

/**
 * 事実のカテゴリ
 * @summary 事実カテゴリ
 */
export type FactCategory =
  | "requirement"      // 要件
  | "constraint"       // 制約条件
  | "preference"       // ユーザーの好み
  | "context"          // プロジェクトコンテキスト
  | "success_pattern"  // 成功パターン (D⁺)
  | "failure_pattern"  // 失敗パターン (D⁻)
  | "assumption";      // 前提

/**
 * 会話要約
 * @summary 会話要約
 * @description マルチターン会話の要約。履歴ℋとしてプロンプトに注入される。
 */
export interface ConversationSummary {
  /** 要約のバージョン */
  version: number;
  /** 最終更新日時（ISO 8601形式） */
  lastUpdated: string;
  /** 会話のターン数 */
  turnCount: number;
  /** 要約テキスト */
  summary: string;
  /** 主要な決定事項 */
  keyDecisions: string[];
  /** 未解決の質問 */
  openQuestions: string[];
  /** 現在のタスク目標 */
  currentGoal?: string;
  /** 関連する確認済み事実のIDリスト */
  relatedFactIds: string[];
}

/**
 * 意図推論結果
 * @summary 意図推論結果
 * @description Equation (3)に基づき、ユーザー入力から推論された意図を表現する。
 */
export interface IntentInferenceResult {
  /** 推論された意図の説明 */
  inferredIntent: string;
  /** 意図の明確さ */
  clarity: IntentClarity;
  /** 推論の信頼度 */
  confidence: IntentConfidence;
  /** 数値信頼度スコア（0.0-1.0） */
  confidenceScore: number;
  /** 意図の詳細な内訳 */
  aspects?: IntentAspect[];
  /** 検出された曖昧さのリスト */
  ambiguities?: string[];
  /** 情報ギャップのリスト */
  informationGaps?: string[];
  /** 推論に使用したコンテキストの参照 */
  contextUsed?: string[];
}

/**
 * 意図の側面
 * @summary 意図の側面
 */
export interface IntentAspect {
  /** 側面の名前 */
  name: string;
  /** 側面の値または説明 */
  value: string;
  /** この側面の信頼度 */
  confidence: number;
}

/**
 * 明確化質問
 * @summary 明確化質問
 * @description 曖昧な入力に対してユーザーに提示する質問。Mediatorの役割として機能する。
 */
export interface ClarificationQuestion {
  /** 質問ID */
  questionId: string;
  /** 質問のテキスト */
  question: string;
  /** 質問のタイプ */
  type: QuestionType;
  /** 選択肢（choice型の場合） */
  options?: string[];
  /** この質問が必要な理由 */
  reason: string;
  /** 関連する曖昧さのID */
  relatedAmbiguity?: string;
  /** 優先度（1が最高） */
  priority: number;
}

/**
 * 質問のタイプ
 * @summary 質問タイプ
 */
export type QuestionType =
  | "choice"        // 選択式
  | "yes_no"        // Yes/No
  | "open_ended"    // 自由記述
  | "confirmation"  // 確認
  | "preference";   // 好みの確認

/**
 * LiC（Lost in Context）検出結果
 * @summary LiC検出結果
 * @description モデルが「平均的なユーザー」の事前分布にフォールバックしている兆候を検出する。
 */
export interface LiCDetectionResult {
  /** LiCが検出されたか */
  detected: boolean;
  /** 検出の信頼度（0.0-1.0） */
  confidence: number;
  /** 検出された兆候のリスト */
  indicators: LiCIndicator[];
  /** 推奨される対処法 */
  recommendedAction?: string;
  /** コンテキストの乖離度（0.0-1.0） */
  contextDivergence?: number;
}

/**
 * LiC検出の兆候
 * @summary LiC兆候タイプ
 */
export type LiCIndicator =
  | "generic_response"        // 一般的な回答
  | "context_ignoration"      // 文脈の無視
  | "preference_assumption"   // 好みの前提
  | "scope_creep"             // スコープの逸脱
  | "inconsistent_reference"; // 矛盾する参照

/**
 * Mediatorコンテキスト
 * @summary Mediatorコンテキスト
 * @description Equation (5)に基づき、現在のコンテキストC_tと履歴ℋを保持する。
 */
export interface MediatorContext {
  /** 現在のユーザー入力 */
  currentInput: string;
  /** 会話のターン番号（1始まり） */
  turnNumber: number;
  /** 会話要約（履歴ℋ） */
  conversationSummary?: ConversationSummary;
  /** 確認済み事実のリスト */
  confirmedFacts: ConfirmedFact[];
  /** 直近のNターンの会話履歴 */
  recentHistory: ConversationTurn[];
  /** プロジェクトコンテキスト（オプション） */
  projectContext?: ProjectContext;
}

/**
 * 会話ターン
 * @summary 会話ターン
 */
export interface ConversationTurn {
  /** ターン番号 */
  turn: number;
  /** ユーザー入力 */
  userInput: string;
  /** エージェント応答の要約 */
  agentResponseSummary: string;
  /** タイムスタンプ（ISO 8601形式） */
  timestamp: string;
  /** このターンで確認された事実ID */
  confirmedFactIds?: string[];
}

/**
 * プロジェクトコンテキスト
 * @summary プロジェクトコンテキスト
 */
export interface ProjectContext {
  /** プロジェクト名 */
  projectName?: string;
  /** 作業ディレクトリ */
  workingDirectory?: string;
  /** 現在のブランチ（Git） */
  currentBranch?: string;
  /** 関連ファイルのリスト */
  relevantFiles?: string[];
  /** プロジェクトの説明 */
  description?: string;
}

// ============================================================================
// Mediator Response Types
// ============================================================================

/**
 * Mediatorの処理結果
 * @summary Mediator処理結果
 */
export interface MediatorResponse {
  /** 意図推論結果 */
  intentInference: IntentInferenceResult;
  /** 生成された明確化質問（必要な場合） */
  clarificationQuestions?: ClarificationQuestion[];
  /** LiC検出結果 */
  licDetection?: LiCDetectionResult;
  /** 構造化された指示（意図が明確な場合） */
  structuredInstruction?: StructuredInstruction;
  /** 新たに確認すべき事実 */
  factsToConfirm?: ConfirmedFact[];
  /** 会話要約の更新が必要か */
  summaryNeedsUpdate: boolean;
}

/**
 * 構造化された指示
 * @summary 構造化指示
 * @description 曖昧な入力を明示的な指示に変換した結果。
 */
export interface StructuredInstruction {
  /** 指示の要約 */
  summary: string;
  /** 具体的なアクション項目 */
  actions: ActionItem[];
  /** 制約条件 */
  constraints: string[];
  /** 成功基準 */
  successCriteria: string[];
}

/**
 * アクション項目
 * @summary アクション項目
 */
export interface ActionItem {
  /** アクションの説明 */
  description: string;
  /** 優先度（1が最高） */
  priority: number;
  /** 依存するアクションID */
  dependsOn?: string[];
}

// ============================================================================
// Storage Types
// ============================================================================

/**
 * 確認済み事実のストレージ構造
 * @summary 事実ストレージ
 */
export interface ConfirmedFactsStorage {
  /** ストレージのバージョン */
  version: number;
  /** 最終更新日時 */
  lastUpdated: string;
  /** 確認済み事実のリスト */
  facts: ConfirmedFact[];
}

// ============================================================================
// Constants
// ============================================================================

/** 現在のストレージバージョン */
export const MEDIATOR_STORAGE_VERSION = 1;

/** デフォルトの要約更新間隔（ターン数） */
export const SUMMARY_UPDATE_INTERVAL = 5;

/** 最大の履歴保持ターン数 */
export const MAX_HISTORY_TURNS = 20;

/** LiC検出の信頼度閾値 */
export const LIC_CONFIDENCE_THRESHOLD = 0.7;
