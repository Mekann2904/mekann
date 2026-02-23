/**
 * @abdd.meta
 * path: .pi/lib/dynamic-tools/index.ts
 * role: 動的ツールシステムのパブリックAPIエントリーポイント
 * why: Live-SWE-agent統合用の動的ツール機能を単一のインターフェースから利用可能にするため
 * related: ./types.ts, ./registry.ts, ./safety.ts
 * public_api: 全ての型定義、Registry関数群、Safety解析関数、Qualityメトリクス、Auditログ、Reflection機能
 * invariants: エクスポートされる型と実装はサブモジュールと一致する
 * side_effects: なし（純粋なエクスポート再公開）
 * failure_modes: サブモジュールの読み込み失敗、循環参照エラー
 * @abdd.explain
 * overview: 動的ツールシステムの型定義、登録、安全性解析、品質管理、監査、リフレクション機能を統合して公開するモジュール
 * what_it_does:
 *   - types.ts, registry.ts, safety.ts等のサブモジュールからシンボルを再エクスポートする
 *   - 外部モジュールに対して単一のインポートパス（.pi/lib/dynamic-tools）を提供する
 *   - システム全体で使用される共通型とデフォルト設定を露出させる
 * why_it_exists:
 *   - モジュール構造の物理的な分割と、利用側の論理的なインポート simplicity を両立するため
 *   - APIの安定性を保ちつつ内部実装を隠蔽するため
 * scope:
 *   in: 各サブモジュール（types, registry, safety, quality, audit, reflection）の実装
 *   out: 外部モジュール（Live-SWE-agent等）へのAPI
 */

/**
 * 動的ツールモジュール - エクスポート統合
 * Live-SWE-agent統合用の動的ツール生成・実行システム
 *
 * レイヤー構成:
 * - types.ts: 全型定義
 * - registry.ts: ツール登録・管理（関数ベース）
 * - safety.ts: コード安全性解析
 * - quality.ts: 品質メトリクス収集
 * - audit.ts: 監査ログ
 * - reflection.ts: リフレクション・反省
 */

// ============================================================================
// Types
// ============================================================================

export {
  // パス
  type DynamicToolsPaths,
  getDynamicToolsPaths,

  // ツール定義
  type DynamicToolDefinition,
  type DynamicToolMode,
  type ToolParameterDefinition,
  type VerificationStatus,

  // 実行結果
  type DynamicToolResult,
  type DynamicToolRunOptions,

  // 登録・管理
  type DynamicToolRegistrationRequest,
  type DynamicToolRegistrationResult,
  type DynamicToolListOptions,

  // 安全性検証
  type SafetyVerificationResult,
  type SafetyIssue,
  type SafetyIssueType,
  type AllowedOperations,

  // 品質メトリクス
  type DynamicToolQualityMetrics,
  type QualityMetricsReport,

  // 監査ログ
  type AuditLogEntry,
  type AuditAction,

  // スキル変換
  type ConvertToSkillOptions,
  type ConvertToSkillResult,

  // リフレクション
  type ToolReflectionResult,
  type ToolReflectionContext,

  // 設定
  type DynamicToolsConfig,
  DEFAULT_DYNAMIC_TOOLS_CONFIG,
} from "./types.js";

// ============================================================================
// Registry Functions
// ============================================================================

export {
  // パス管理
  ensureDynamicToolsPaths,

  // ID生成
  generateToolId,
  generateRunId,

  // ストレージ操作
  saveToolDefinition,
  loadToolDefinition,
  loadToolDefinitionByName,
  resolveToolDefinition,
  loadAllToolDefinitions,
  deleteToolDefinition,

  // ツール登録
  registerDynamicTool,
  listDynamicTools,
  deleteDynamicTool,
  updateToolUsage,

  // 検索
  searchDynamicTools,
  recommendToolsForTask,

  // クラス
  DynamicToolRegistry,
  getRegistry,
  resetRegistry,

  // 拡張機能互換型
  type ToolParameterProperty,
  type ToolParameterSchema,
  type ToolExecutionResult,
  type ToolSearchOptions,
  type RegisterToolOptions,
  type RegisterToolResult,
} from "./registry.js";

// ============================================================================
// Safety Analysis
// ============================================================================

export {
  analyzeCodeSafety,
  quickSafetyCheck,
  checkAllowlistCompliance,
  DEFAULT_READONLY_ALLOWLIST,
  STANDARD_ALLOWLIST,
  FULL_ACCESS_ALLOWLIST,
  type SafetyAnalysisResult,
  type SafetyAnalysisIssue,
  type SafetyAnalysisIssueType,
} from "./safety.js";

// 注意: SafetyIssue, SafetyIssueType は types.ts と safety.ts の両方で定義されています
// types.tsの定義は汎用的、safety.tsのSafetyAnalysis*は解析専用

// ============================================================================
// Quality Assessment
// ============================================================================

export {
  assessCodeQuality,
  recordExecutionMetrics,
  getUsageStatistics,
  getAllUsageStatistics,
  resetUsageStatistics,
  recordQualityScore,
  analyzeQualityTrend,
  type QualityAssessment,
  type CategoryScores,
  type QualityIssue,
  type ExecutionMetrics,
  type ToolUsageStatistics,
} from "./quality.js";

// ============================================================================
// Audit Logging
// ============================================================================

export {
  logAudit,
  readAuditLog,
  getToolHistory,
  getAuditStatistics,
  formatAuditLogEntry,
  generateAuditReport,
  archiveOldLogs,
} from "./audit.js";

// ============================================================================
// Reflection
// ============================================================================

export {
  detectRepetitivePattern,
  shouldCreateNewTool,
  buildReflectionPrompt,
  proposeToolFromTask,
  shouldTriggerReflection,
} from "./reflection.js";
