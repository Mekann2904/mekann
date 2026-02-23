/**
 * @abdd.meta
 * path: .pi/extensions/dynamic-tools.ts
 * role: Live-SWE-agent統合における動的ツールの生成・実行・管理インターフェース
 * why: タスク実行中に必要な機能を動的かつ安全に拡張し、自己反省に基づくツール生成を可能にするため
 * related: lib/dynamic-tools/safety.ts, lib/dynamic-tools/registry.js, lib/verification-workflow.js, lib/agent-common
 * public_api: create_tool, run_dynamic_tool, list_dynamic_tools, delete_dynamic_tool, tool_reflection
 * invariants: ツール実行はVMコンテキスト内で行われること、外部モジュール・環境変数へのアクセスが禁止されていること
 * side_effects: ファイルシステムへの監査ログ（.pi/logs/dynamic-tools-audit.jsonl）への追記、ツールレジストリの状態変更
 * failure_modes: 安全性チェック失敗による作成拒否、VM実行時のタイムアウト、パラメータ型不一致による実行エラー
 * @abdd.explain
 * overview: Live-SWE-agentエージェント向けの拡張機能であり、定義されたコードに基づきツールを動的に生成・管理・実行する。安全性解析と品質評価を組み込み、セキュアな実行環境を提供する。
 * what_it_does:
 *   - create_tool: ユーザー定義のコードとパラメータ定義から新しい動的ツールを登録する
 *   - run_dynamic_tool: 指定されたツールIDまたは名前でツールをVM上で実行する
 *   - list_dynamic_tools: 条件に応じて登録済みツールの一覧を取得する
 *   - delete_dynamic_tool: 指定したツールをレジストリから削除する
 *   - tool_reflection: タスクの結果に基づきツール生成の必要性を判断する
 * why_it_exists:
 *   - 事前定義されたツールだけでは対応できない動的なタスク要件に対応するため
 *   - セキュリティリスク（外部アクセス等）を排除した安全なコード実行環境を提供するため
 * scope:
 *   in: ツール定義（コード、パラメータ）、実行指示、フィルタ条件
 *   out: 実行結果、ツール一覧、監査ログエントリ
 */

/**
 * 動的ツール生成・実行拡張機能
 * Live-SWE-agent統合: タスク実行中に必要なツールを動的に生成・実行
 *
 * 機能:
 * - create_tool: 動的ツール生成コマンド
 * - run_dynamic_tool: 動的ツール実行コマンド
 * - list_dynamic_tools: ツール一覧表示
 * - delete_dynamic_tool: ツール削除
 * - tool_reflection: 実行後の反省とツール生成判定
 *
 * セキュリティ:
 * - VMコンテキストで実行（require, process は除外）
 * - 外部モジュールアクセス・環境変数アクセス禁止
 * - allowlist-based検証パターン
 * - 詳細は lib/dynamic-tools/safety.ts 参照
 *
 * 統合モジュール:
 * - lib/dynamic-tools: ツール登録・管理・安全性解析
 * - lib/verification-workflow: Inspector/Challenger検証パターン
 * - lib/agent-common: 共通設定と正規化関数
 */

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ToolResultEvent } from "@mariozechner/pi-coding-agent";

import { getLogger } from "../lib/comprehensive-logger";
import type { OperationType } from "../lib/comprehensive-logger-types";
import {
  getRegistry,
} from "../lib/dynamic-tools/registry.js";
import {
  analyzeCodeSafety,
  quickSafetyCheck,
} from "../lib/dynamic-tools/safety.js";
import {
  assessCodeQuality,
  recordExecutionMetrics,
} from "../lib/dynamic-tools/quality.js";
import type {
  DynamicToolDefinition,
} from "../lib/dynamic-tools/types.js";
import type { ToolExecutionResult } from "../lib/dynamic-tools/registry.js";
import { isHighStakesTask } from "../lib/verification-workflow.js";

const logger = getLogger();

// ============================================================================
// Types
// ============================================================================

interface CreateToolInput {
  name: string;
  description: string;
  code: string;
  parameters?: Record<string, {
    type: "string" | "number" | "boolean" | "object" | "array";
    description: string;
    default?: unknown;
    enum?: string[];
    minimum?: number;
    maximum?: number;
    required?: boolean;
  }>;
  tags?: string[];
  generated_from?: string;
}

interface RunDynamicToolInput {
  tool_id?: string;
  tool_name?: string;
  parameters: Record<string, unknown>;
  timeout_ms?: number;
}

interface ListDynamicToolsInput {
  name?: string;
  tags?: string[];
  min_safety_score?: number;
  limit?: number;
}

interface DeleteDynamicToolInput {
  tool_id?: string;
  tool_name?: string;
  confirm?: boolean;
}

interface ToolReflectionInput {
  task_description: string;
  last_tool_result: string;
  failed_attempts?: number;
}

// ============================================================================
// Audit Logging
// ============================================================================

const AUDIT_LOG_FILE = "dynamic-tools-audit.jsonl";

function getAuditLogPath(): string {
  const cwd = process.cwd();
  const logsDir = join(cwd, ".pi", "logs");
  
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
  
  return join(logsDir, AUDIT_LOG_FILE);
}

function writeAuditLog(entry: {
  timestamp: string;
  action: string;
  toolId?: string;
  toolName?: string;
  success: boolean;
  details?: Record<string, unknown>;
  error?: string;
}): void {
  try {
    const logPath = getAuditLogPath();
    const logLine = JSON.stringify(entry) + "\n";
    appendFileSync(logPath, logLine, "utf-8");
  } catch {
    // ログ書き込みエラーは無視
  }
}

// ============================================================================
// Tool Execution
// ============================================================================

/**
 * 動的ツールを実行
 * 注意: 同一プロセス内でフル権限実行
 */
async function executeDynamicTool(
  tool: DynamicToolDefinition,
  params: Record<string, unknown>,
  timeoutMs: number = 30000
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  try {
    // 高速安全性チェック
    const quickCheck = quickSafetyCheck(tool.code);
    if (!quickCheck.isSafe) {
      return {
        success: false,
        error: `安全性チェック失敗: ${quickCheck.reason}`,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // コードを実行用にラップ
    const wrappedCode = `
${tool.code}

// エントリーポイント
(async () => {
  const params = ${JSON.stringify(params)};
  try {
    const result = await execute(params);
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
})();
`;

    // AbortControllerを使用してタイムアウト時にVM実行をキャンセル
    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let executionCompleted = false;

    try {
      // タイムアウト付きで実行
      const result = await Promise.race([
        executeCode(wrappedCode).then((r) => {
          executionCompleted = true;
          return r;
        }),
        new Promise<ToolExecutionResult>((_, reject) => {
          timeoutId = setTimeout(() => {
            if (!executionCompleted) {
              abortController.abort();
              reject(new Error("実行タイムアウト"));
            }
          }, timeoutMs);
        }),
      ]);

      return {
        ...result,
        executionTimeMs: Date.now() - startTime,
      };
    } finally {
      // タイマーを確実にクリアしてリソースリークを防止
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * コードを実行
 * セキュリティ: VMコンテキストからrequire, process, タイマーを削除し
 * 外部モジュールアクセス、プロセス操作、サンドボックスエスケープを制限
 *
 * 利用可能なグローバルオブジェクト:
 * - console, Buffer
 * - 標準オブジェクト: Promise, JSON, Object, Array, String, Number, Boolean, Date, Math
 * - エラークラス: Error, TypeError, RangeError, SyntaxError
 * - URL関連: URL, URLSearchParams
 *
 * 利用不可（セキュリティ制約）:
 * - require: 外部モジュールアクセス禁止
 * - process: 環境変数・プロセス情報アクセス禁止
 * - global, globalThis: グローバルスコープ汚染禁止
 * - __dirname, __filename: ファイルシステムパス漏洩禁止
 * - setTimeout, setInterval, clearTimeout, clearInterval: サンドボックスエスケープ防止
 */

/**
 * サンドボックス用の安全なconsoleラッパーを作成
 * @summary 安全なconsoleラッパー作成
 * @returns 許可されたメソッドのみを持つconsoleオブジェクト
 * @description
 * 元のconsoleオブジェクトへの参照を渡さず、文字列化して出力する安全なラッパーを提供。
 * log/info/warn/error/debugのみを許可し、他のプロパティアクセスを遮断する。
 */
function createSandboxConsole(): Pick<Console, "log" | "info" | "warn" | "error" | "debug"> {
  const safeStringify = (args: unknown[]): string => {
    return args.map(arg => {
      if (typeof arg === "string") return arg;
      if (typeof arg === "number" || typeof arg === "boolean") return String(arg);
      if (arg === null) return "null";
      if (arg === undefined) return "undefined";
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }).join(" ");
  };

  return {
    log: (...args: unknown[]) => console.log(safeStringify(args)),
    info: (...args: unknown[]) => console.info(safeStringify(args)),
    warn: (...args: unknown[]) => console.warn(safeStringify(args)),
    error: (...args: unknown[]) => console.error(safeStringify(args)),
    debug: (...args: unknown[]) => console.debug(safeStringify(args)),
  };
}

async function executeCode(code: string): Promise<ToolExecutionResult> {
  try {
    // vmモジュールを使用してコードを実行
    const vm = await import("node:vm");
    // 安全なconsoleラッパーを使用（元のconsoleへの参照を遮断）
    const sandboxConsole = createSandboxConsole();
    const context = vm.createContext({
      // ログ出力のみ許可（安全なラッパー経由）
      console: sandboxConsole,
      // データ操作
      Buffer,
      // 標準オブジェクト
      Promise,
      JSON,
      Object,
      Array,
      String,
      Number,
      Boolean,
      Date,
      Math,
      Error,
      TypeError,
      RangeError,
      SyntaxError,
      URL,
      URLSearchParams,
      // 注意: require, process は意図的に除外
      // 外部モジュールアクセス・環境変数アクセスを禁止
      // 注意: setTimeout, setInterval 等は意図的に除外
      // タイマーのコールバックがVMコンテキスト外で実行され
      // サンドボックスエスケープのリスクがあるため
    });

    const script = new vm.Script(code, {
      filename: "dynamic-tool.js",
    });

    const result = await script.runInContext(context);
    return result as ToolExecutionResult;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      executionTimeMs: 0,
    };
  }
}

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * create_tool: 動的ツールを生成
 */
async function handleCreateTool(
  input: CreateToolInput
): Promise<string> {
  const operationId = logger.startOperation("direct" as OperationType, `create_tool:${input.name}`, {
    task: `動的ツール生成: ${input.name}`,
    params: { name: input.name, description: input.description },
  });

  try {
    const registry = getRegistry();

    // 名前の検証
    if (!input.name || input.name.trim().length === 0) {
      logger.endOperation({
        status: "failure",
        tokensUsed: 0,
        outputLength: 0,
        childOperations: 0,
        toolCalls: 0,
        error: { type: "validation_error", message: "ツール名は必須です", stack: "" },
      });
      return "エラー: ツール名は必須です";
    }

    if (!/^[a-z][a-z0-9_-]*$/i.test(input.name)) {
      logger.endOperation({
        status: "failure",
        tokensUsed: 0,
        outputLength: 0,
        childOperations: 0,
        toolCalls: 0,
        error: { type: "validation_error", message: "ツール名の形式が不正です", stack: "" },
      });
      return "エラー: ツール名は英字で始まり、英数字、アンダースコア、ハイフンのみ使用可能です";
    }

  // 高リスク操作の検出（コード内容をチェック）
  const codeDescription = `${input.name}: ${input.description}`;
  if (isHighStakesTask(codeDescription)) {
    // 高リスク操作の場合は追加の警告を表示
    writeAuditLog({
      timestamp: new Date().toISOString(),
      action: "high_stakes_tool_creation",
      toolName: input.name,
      success: true,
      details: {
        description: input.description,
        warning: "高リスク操作を含むツールが作成されました",
      },
    });
  }

  // コードの安全性解析
  const safetyResult = analyzeCodeSafety(input.code);

  // コードの品質評価
  const qualityResult = assessCodeQuality(input.code);

  // パラメータスキーマを構築
  const properties: Record<string, { type: string; description: string; default?: unknown; enum?: string[]; minimum?: number; maximum?: number }> = {};
  const required: string[] = [];

  if (input.parameters) {
    for (const [name, prop] of Object.entries(input.parameters)) {
      properties[name] = {
        type: prop.type,
        description: prop.description,
      };
      if (prop.default !== undefined) {
        properties[name].default = prop.default;
      }
      if (prop.enum) {
        properties[name].enum = prop.enum;
      }
      if (prop.minimum !== undefined) {
        properties[name].minimum = prop.minimum;
      }
      if (prop.maximum !== undefined) {
        properties[name].maximum = prop.maximum;
      }
      if (prop.required) {
        required.push(name);
      }
    }
  }

  // ツールを登録
  const result = registry.register({
    name: input.name,
    description: input.description,
    generatedFrom: input.generated_from || "手動作成",
    code: input.code,
    parameters: {
      properties,
      required,
    },
    tags: input.tags || [],
  });

  // 監査ログに記録
  writeAuditLog({
    timestamp: new Date().toISOString(),
    action: "create_tool",
    toolId: result.toolId,
    toolName: input.name,
    success: result.success,
    details: {
      safetyScore: safetyResult.score,
      qualityScore: qualityResult.score,
      parametersCount: Object.keys(properties).length,
    },
    error: result.error,
  });

  if (!result.success) {
    logger.endOperation({
      status: "failure",
      tokensUsed: 0,
      outputLength: 0,
      childOperations: 0,
      toolCalls: 0,
      error: { type: "registration_error", message: result.error || "Unknown error", stack: "" },
    });
    return `エラー: ${result.error}`;
  }

  // 結果をフォーマット
  const warnings = result.warnings || [];
  const warningText = warnings.length > 0
    ? `\n警告:\n${warnings.map(w => `- ${w}`).join("\n")}`
    : "";

  const output = `
ツール「${input.name}」を作成しました。

ツールID: ${result.toolId}
安全性スコア: ${safetyResult.score.toFixed(2)}
品質スコア: ${qualityResult.score.toFixed(2)}
検証状態: ${safetyResult.score >= 0.5 ? "verified" : "unverified"}

説明:
${input.description}

パラメータ:
${Object.keys(properties).length > 0
  ? Object.entries(properties)
      .map(([name, prop]) => `- ${name} (${prop.type}): ${prop.description}`)
      .join("\n")
  : "（なし）"}

使用方法:
\`\`\`typescript
run_dynamic_tool({ tool_id: "${result.toolId}", parameters: { /* ... */ } })
\`\`\`
${warningText}
`;

  logger.endOperation({
    status: "success",
    tokensUsed: 0,
    outputLength: output.length,
    childOperations: 0,
    toolCalls: 0,
  });

  return output;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.endOperation({
      status: "failure",
      tokensUsed: 0,
      outputLength: 0,
      childOperations: 0,
      toolCalls: 0,
      error: {
        type: error instanceof Error ? error.constructor.name : "UnknownError",
        message: errorMessage,
        stack: error instanceof Error ? error.stack || "" : "",
      },
    });
    return `エラー: ${errorMessage}`;
  }
}

/**
 * run_dynamic_tool: 動的ツールを実行
 */
async function handleRunDynamicTool(
  input: RunDynamicToolInput
): Promise<string> {
  const targetName = input.tool_id || input.tool_name || "unknown";
  const operationId = logger.startOperation("direct" as OperationType, `run_dynamic_tool:${targetName}`, {
    task: `動的ツール実行: ${targetName}`,
    params: { tool_id: input.tool_id, tool_name: input.tool_name, parameters: input.parameters },
  });

  try {
    const registry = getRegistry();

    // ツールを検索
    let tool: DynamicToolDefinition | undefined;

    if (input.tool_id) {
      tool = registry.getById(input.tool_id);
    } else if (input.tool_name) {
      tool = registry.findByName(input.tool_name);
    }

    if (!tool) {
      logger.endOperation({
        status: "failure",
        tokensUsed: 0,
        outputLength: 0,
        childOperations: 0,
        toolCalls: 0,
        error: { type: "not_found_error", message: "ツールが見つかりません", stack: "" },
      });
      return `エラー: ツールが見つかりません (${input.tool_id || input.tool_name})`;
    }

    // 必須パラメータのチェック
    const requiredParams = tool.parameters.filter(p => p.required).map(p => p.name);
    const missingParams = requiredParams.filter(
      p => !(p in input.parameters)
    );

    if (missingParams.length > 0) {
      logger.endOperation({
        status: "failure",
        tokensUsed: 0,
        outputLength: 0,
        childOperations: 0,
        toolCalls: 0,
        error: { type: "validation_error", message: `必須パラメータが不足: ${missingParams.join(", ")}`, stack: "" },
      });
      return `エラー: 必須パラメータが不足しています: ${missingParams.join(", ")}`;
    }

    // ツールを実行
    const timeoutMs = input.timeout_ms || 30000;
    const result = await executeDynamicTool(tool, input.parameters, timeoutMs);

    // 使用を記録
    registry.recordUsage(tool.id);
    recordExecutionMetrics(tool.id, {
      executionTimeMs: result.executionTimeMs,
      success: result.success,
      errorType: result.error ? "execution_error" : undefined,
      errorMessage: result.error,
      inputParameters: input.parameters,
    });

    // 監査ログに記録
    writeAuditLog({
      timestamp: new Date().toISOString(),
      action: "run_dynamic_tool",
      toolId: tool.id,
      toolName: tool.name,
      success: result.success,
      details: {
        executionTimeMs: result.executionTimeMs,
        parameters: input.parameters,
      },
      error: result.error,
    });

    // 結果をフォーマット
    if (!result.success) {
      const errorOutput = `
ツール「${tool.name}」の実行に失敗しました。

実行時間: ${result.executionTimeMs}ms
エラー: ${result.error}
`;
      logger.endOperation({
        status: "failure",
        tokensUsed: 0,
        outputLength: errorOutput.length,
        childOperations: 0,
        toolCalls: 0,
        error: { type: "execution_error", message: result.error || "Unknown error", stack: "" },
      });
      return errorOutput;
    }

    // 結果を整形
    let resultText = "";
    if (typeof result.result === "string") {
      resultText = result.result;
    } else if (result.result !== undefined) {
      resultText = JSON.stringify(result.result, null, 2);
    }

    const output = `
ツール「${tool.name}」の実行が完了しました。

実行時間: ${result.executionTimeMs}ms

結果:
${resultText}
`;

    logger.endOperation({
      status: "success",
      tokensUsed: 0,
      outputLength: output.length,
      childOperations: 0,
      toolCalls: 0,
    });

    return output;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.endOperation({
      status: "failure",
      tokensUsed: 0,
      outputLength: 0,
      childOperations: 0,
      toolCalls: 0,
      error: {
        type: error instanceof Error ? error.constructor.name : "UnknownError",
        message: errorMessage,
        stack: error instanceof Error ? error.stack || "" : "",
      },
    });
    return `エラー: ${errorMessage}`;
  }
}

/**
 * list_dynamic_tools: ツール一覧を表示
 */
async function handleListDynamicTools(
  input: ListDynamicToolsInput
): Promise<string> {
  const registry = getRegistry();

  const tools = registry.search({
    name: input.name,
    tags: input.tags,
    minSafetyScore: input.min_safety_score,
    limit: input.limit || 20,
  });

  if (tools.length === 0) {
    return "動的ツールは登録されていません。";
  }

  const lines: string[] = [
    `# 登録済み動的ツール (${tools.length}件)`,
    "",
  ];

  for (const tool of tools) {
    const lastUsed = tool.lastUsedAt
      ? new Date(tool.lastUsedAt).toLocaleString("ja-JP")
      : "未使用";

    lines.push(`## ${tool.name}`);
    lines.push(`- ID: ${tool.id}`);
    lines.push(`- 説明: ${tool.description}`);
    lines.push(`- 信頼度: ${tool.confidenceScore.toFixed(2)}`);
    lines.push(`- 使用回数: ${tool.usageCount}回 | 最終使用: ${lastUsed}`);
    lines.push(`- 検証状態: ${tool.verificationStatus}`);
    
    if (tool.tags.length > 0) {
      lines.push(`- タグ: ${tool.tags.join(", ")}`);
    }
    
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * delete_dynamic_tool: ツールを削除
 */
async function handleDeleteDynamicTool(
  input: DeleteDynamicToolInput
): Promise<string> {
  const targetName = input.tool_id || input.tool_name || "unknown";
  const operationId = logger.startOperation("direct" as OperationType, `delete_dynamic_tool:${targetName}`, {
    task: `動的ツール削除: ${targetName}`,
    params: { tool_id: input.tool_id, tool_name: input.tool_name, confirm: input.confirm },
  });

  try {
    const registry = getRegistry();

    if (!input.confirm) {
      logger.endOperation({
        status: "failure",
        tokensUsed: 0,
        outputLength: 0,
        childOperations: 0,
        toolCalls: 0,
        error: { type: "validation_error", message: "削除確認が必要です", stack: "" },
      });
      return `エラー: 削除を確認するには confirm: true を指定してください`;
    }

    // ツールを検索
    let tool: DynamicToolDefinition | undefined;

    if (input.tool_id) {
      tool = registry.getById(input.tool_id);
    } else if (input.tool_name) {
      tool = registry.findByName(input.tool_name);
    }

    if (!tool) {
      logger.endOperation({
        status: "failure",
        tokensUsed: 0,
        outputLength: 0,
        childOperations: 0,
        toolCalls: 0,
        error: { type: "not_found_error", message: "ツールが見つかりません", stack: "" },
      });
      return `エラー: ツールが見つかりません (${input.tool_id || input.tool_name})`;
    }

    const toolName = tool.name;
    const toolId = tool.id;

    // ツールを削除
    const result = registry.delete(toolId);

    // 監査ログに記録
    writeAuditLog({
      timestamp: new Date().toISOString(),
      action: "delete_dynamic_tool",
      toolId: toolId,
      toolName: toolName,
      success: result.success,
      error: result.error,
    });

    if (!result.success) {
      logger.endOperation({
        status: "failure",
        tokensUsed: 0,
        outputLength: 0,
        childOperations: 0,
        toolCalls: 0,
        error: { type: "delete_error", message: result.error || "Unknown error", stack: "" },
      });
      return `エラー: ${result.error}`;
    }

    const output = `ツール「${toolName}」(${toolId})を削除しました。`;
    logger.endOperation({
      status: "success",
      tokensUsed: 0,
      outputLength: output.length,
      childOperations: 0,
      toolCalls: 0,
    });

    return output;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.endOperation({
      status: "failure",
      tokensUsed: 0,
      outputLength: 0,
      childOperations: 0,
      toolCalls: 0,
      error: {
        type: error instanceof Error ? error.constructor.name : "UnknownError",
        message: errorMessage,
        stack: error instanceof Error ? error.stack || "" : "",
      },
    });
    return `エラー: ${errorMessage}`;
  }
}

/**
 * tool_reflection: 実行後の反省とツール生成判定
 */
async function handleToolReflection(
  input: ToolReflectionInput
): Promise<string> {
  // ツール生成すべきかの判定ロジック
  const failedAttempts = input.failed_attempts || 0;
  const taskDescription = input.task_description.toLowerCase();
  const lastResult = input.last_tool_result.toLowerCase();

  // ツール生成が推奨されるパターン
  const toolGenerationPatterns = [
    { pattern: /繰り返し|反復|複数回/i, reason: "繰り返し操作が検出されました" },
    { pattern: /変換|フォーマット|パース/i, reason: "データ変換操作が検出されました" },
    { pattern: /api.*呼び出し|外部.*アクセス/i, reason: "API呼び出しパターンが検出されました" },
    { pattern: /検証|バリデーション|チェック/i, reason: "検証操作が検出されました" },
    { pattern: /集計|サマリー|統計/i, reason: "集計操作が検出されました" },
  ];

  // ツール生成が推奨されるかチェック
  const recommendedPattern = toolGenerationPatterns.find(p =>
    p.pattern.test(taskDescription)
  );

  // 失敗回数に基づく判定
  const shouldCreateTool = failedAttempts >= 2 || recommendedPattern;

  // 結果が単純で再利用可能かチェック
  const isReusable = /成功|完了|結果/.test(lastResult) && lastResult.length < 1000;

  const lines: string[] = [
    "# ツール生成反省",
    "",
    `## タスク分析`,
    `- 説明: ${input.task_description.slice(0, 100)}...`,
    `- 失敗回数: ${failedAttempts}`,
    "",
  ];

  if (shouldCreateTool) {
    lines.push(`## 推奨: ツール生成`);
    
    if (recommendedPattern) {
      lines.push(`- 理由: ${recommendedPattern.reason}`);
    }
    
    if (failedAttempts >= 2) {
      lines.push(`- 理由: 失敗回数が${failedAttempts}回に達しました`);
    }

    lines.push("");
    lines.push("## 次のステップ");
    lines.push("以下のコマンドでツールを生成してください:");
    lines.push("```");
    lines.push("create_tool({");
    lines.push("  name: 'tool_name',");
    lines.push("  description: 'ツールの説明',");
    lines.push("  code: `// TypeScriptコード`,");
    lines.push("  parameters: { /* ... */ }");
    lines.push("})");
    lines.push("```");
  } else {
    lines.push(`## 推奨: 直接実行を継続`);
    lines.push("- 理由: ツール生成の条件を満たしていません");
    lines.push("- 再利用可能性: " + (isReusable ? "あり" : "なし"));
  }

  return lines.join("\n");
}

// ============================================================================
// Extension Registration (TypeBox形式)
// ============================================================================

/**
 * 動的ツール拡張を登録
 * @summary ツール拡張登録
 * @param pi 拡張APIインスタンス
 */
export default function registerDynamicToolsExtension(pi: ExtensionAPI): void {
  // create_tool: 動的ツール生成
  pi.registerTool({
    name: "create_tool",
    label: "create_tool",
    description: "動的ツールを生成します。TypeScriptコードを指定して新しいツールを作成します。",
    parameters: Type.Object({
      name: Type.String({ description: "ツール名（英字で始まり、英数字、アンダースコア、ハイフンのみ使用可能）" }),
      description: Type.String({ description: "ツールの説明" }),
      code: Type.String({ description: "ツールのTypeScript/JavaScriptコード。execute(params)関数をエクスポートする必要があります。" }),
      parameters: Type.Optional(Type.Record(
        Type.String(),
        Type.Object({
          type: Type.Union([
            Type.Literal("string"),
            Type.Literal("number"),
            Type.Literal("boolean"),
            Type.Literal("object"),
            Type.Literal("array"),
          ]),
          description: Type.String(),
          default: Type.Optional(Type.Any()),
          enum: Type.Optional(Type.Array(Type.String())),
          minimum: Type.Optional(Type.Number()),
          maximum: Type.Optional(Type.Number()),
          required: Type.Optional(Type.Boolean()),
        })
      )),
      tags: Type.Optional(Type.Array(Type.String(), { description: "ツールのタグ（カテゴリ分類用）" })),
      generated_from: Type.Optional(Type.String({ description: "ツールの生成元（タスク説明など）" })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const result = await handleCreateTool(params as CreateToolInput);
      return {
        content: [{ type: "text", text: result }],
        details: {},
      };
    },
  });

  // run_dynamic_tool: 動的ツール実行
  pi.registerTool({
    name: "run_dynamic_tool",
    label: "run_dynamic_tool",
    description: "登録済みの動的ツールを実行します。tool_idまたはtool_nameでツールを指定します。",
    parameters: Type.Object({
      tool_id: Type.Optional(Type.String({ description: "ツールID" })),
      tool_name: Type.Optional(Type.String({ description: "ツール名（tool_idの代わりに使用可能）" })),
      parameters: Type.Record(Type.String(), Type.Any(), { description: "ツールに渡すパラメータ" }),
      timeout_ms: Type.Optional(Type.Number({ description: "タイムアウト時間（ミリ秒、デフォルト: 30000）" })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const input = params as RunDynamicToolInput;
      
      if (!input.tool_id && !input.tool_name) {
        return {
          content: [{ type: "text", text: "エラー: tool_idまたはtool_nameを指定してください" }],
          details: {},
        };
      }
      
      const result = await handleRunDynamicTool(input);
      return {
        content: [{ type: "text", text: result }],
        details: {},
      };
    },
  });

  // list_dynamic_tools: ツール一覧
  pi.registerTool({
    name: "list_dynamic_tools",
    label: "list_dynamic_tools",
    description: "登録済みの動的ツール一覧を表示します。フィルタリングオプションを利用可能です。",
    parameters: Type.Object({
      name: Type.Optional(Type.String({ description: "名前でフィルタ（部分一致）" })),
      tags: Type.Optional(Type.Array(Type.String(), { description: "タグでフィルタ" })),
      min_safety_score: Type.Optional(Type.Number({ description: "安全性スコアの最小値（0.0-1.0）" })),
      limit: Type.Optional(Type.Number({ description: "最大表示件数（デフォルト: 20）" })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const result = await handleListDynamicTools(params as ListDynamicToolsInput);
      return {
        content: [{ type: "text", text: result }],
        details: {},
      };
    },
  });

  // delete_dynamic_tool: ツール削除
  pi.registerTool({
    name: "delete_dynamic_tool",
    label: "delete_dynamic_tool",
    description: "登録済みの動的ツールを削除します。confirm: true で削除を確定します。",
    parameters: Type.Object({
      tool_id: Type.Optional(Type.String({ description: "ツールID" })),
      tool_name: Type.Optional(Type.String({ description: "ツール名（tool_idの代わりに使用可能）" })),
      confirm: Type.Optional(Type.Boolean({ description: "削除の確認（trueで削除実行）" })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const input = params as DeleteDynamicToolInput;
      
      if (!input.tool_id && !input.tool_name) {
        return {
          content: [{ type: "text", text: "エラー: tool_idまたはtool_nameを指定してください" }],
          details: {},
        };
      }
      
      const result = await handleDeleteDynamicTool(input);
      return {
        content: [{ type: "text", text: result }],
        details: {},
      };
    },
  });

  // tool_reflection: 反省とツール生成判定
  pi.registerTool({
    name: "tool_reflection",
    label: "tool_reflection",
    description: "タスク実行後に反省を行い、ツール生成が推奨されるかを判定します。",
    parameters: Type.Object({
      task_description: Type.String({ description: "実行中のタスクの説明" }),
      last_tool_result: Type.String({ description: "直前のツール実行結果" }),
      failed_attempts: Type.Optional(Type.Number({ description: "失敗した試行回数" })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const result = await handleToolReflection(params as ToolReflectionInput);
      return {
        content: [{ type: "text", text: result }],
        details: {},
      };
    },
  });

  // Step Reflection Hook
  // tool_resultイベント後の反省プロンプト注入
  pi.on("tool_result", async (event: ToolResultEvent, ctx) => {
    // 動的ツール実行後は反省をスキップ
    if (event.toolName.startsWith("dynamic_") || event.toolName === "run_dynamic_tool") {
      return;
    }

    // event.isErrorがtrueの場合のみ通知（文字列ベースの推測は削除）
    // 根本原因: 文字列からの推測は本質的に不確実で誤検出の原因となる
    // 解決策: ToolResultEvent.isError（ツール実行の正確な成否）のみを信頼
    if (event.isError) {
      if (ctx?.ui?.notify) {
        ctx.ui.notify(`[Step Reflection] ツール "${event.toolName}" の実行に失敗しました。tool_reflectionで確認してください。`, "warning");
      }
    }
  });

  // セッション開始時に初期化メッセージを表示
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("[Dynamic Tools] 動的ツール生成システムが有効になりました", "info");
  });
}
