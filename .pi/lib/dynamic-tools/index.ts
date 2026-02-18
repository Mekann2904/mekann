/**
 * @abdd.meta
 * path: .pi/lib/dynamic-tools/index.ts
 * role: 動的ツールモジュールのエクスポート統合ポイント
 * why: Live-SWE-agent統合向けに型定義・レジストリ関数・安全性解析を単一APIとして公開するため
 * related: types.ts, registry.ts, safety.ts, quality.ts
 * public_api: DynamicToolDefinition, DynamicToolResult, registerDynamicTool, listDynamicTools, analyzeCodeSafety, DynamicToolRegistry
 * invariants: 再エクスポート元モジュールの型シグネチャと完全に一致すること、循環依存を含まないこと
 * side_effects: なし（純粋な再エクスポートのみ）
 * failure_modes: 参照先モジュールが存在しない場合にインポートエラーが発生する
 * @abdd.explain
 * overview: 動的ツール生成・実行システムの統合エクスポートモジュール
 * what_it_does:
 *   - types.tsから型定義と設定定数を再エクスポート
 *   - registry.tsからツール登録・管理関数とDynamicToolRegistryクラスを再エクスポート
 *   - safety.tsからコード安全性解析関数を再エクスポート
 * why_it_exists:
 *   - 利用者が個別モジュールを知らずに単一importで全機能にアクセスできるようにするため
 *   - モジュール間の依存関係を隠蔽しAPIを一元管理するため
 * scope:
 *   in: types.ts, registry.ts, safety.ts, quality.ts, audit.ts, reflection.ts
 *   out: 外部システム統合、ランタイム実行ロジック、UI層
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
