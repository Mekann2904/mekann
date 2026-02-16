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
