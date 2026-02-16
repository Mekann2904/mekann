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
 * 技術的制約:
 * - TypeScript + Node.js標準モジュールのみ
 * - 同一プロセス内でフル権限実行（サンドボックスなし）
 * - allowlist-based検証パターン
 *
 * 統合モジュール:
 * - lib/dynamic-tools: ツール登録・管理・安全性解析
 * - lib/verification-workflow: Inspector/Challenger検証パターン
 * - lib/agent-common: 共通設定と正規化関数
 */

import type { ExtensionAPI, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import {
  getRegistry,
  analyzeCodeSafety,
  quickSafetyCheck,
  assessCodeQuality,
  recordExecutionMetrics,
  recordQualityScore,
  type DynamicToolDefinition,
  type ToolExecutionResult,
  type SafetyAnalysisResult,
  type QualityAssessment,
} from "../lib/dynamic-tools/index.js";
import {
  isHighStakesTask,
  shouldTriggerVerification,
  type VerificationContext,
} from "../lib/verification-workflow.js";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

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

    // タイムアウト付きで実行
    const result = await Promise.race([
      executeCode(wrappedCode),
      new Promise<ToolExecutionResult>((_, reject) =>
        setTimeout(() => reject(new Error("実行タイムアウト")), timeoutMs)
      ),
    ]);

    return {
      ...result,
      executionTimeMs: Date.now() - startTime,
    };
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
 * 注意: この実装は同一プロセス内で実行
 */
async function executeCode(code: string): Promise<ToolExecutionResult> {
  try {
    // vmモジュールを使用してコードを実行
    const vm = await import("node:vm");
    const context = vm.createContext({
      console,
      require,
      process,
      Buffer,
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
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
  const registry = getRegistry();

  // 名前の検証
  if (!input.name || input.name.trim().length === 0) {
    return "エラー: ツール名は必須です";
  }

  if (!/^[a-z][a-z0-9_-]*$/i.test(input.name)) {
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
    return `エラー: ${result.error}`;
  }

  // 結果をフォーマット
  const warnings = result.warnings || [];
  const warningText = warnings.length > 0
    ? `\n警告:\n${warnings.map(w => `- ${w}`).join("\n")}`
    : "";

  return `
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
}

/**
 * run_dynamic_tool: 動的ツールを実行
 */
async function handleRunDynamicTool(
  input: RunDynamicToolInput
): Promise<string> {
  const registry = getRegistry();

  // ツールを検索
  let tool: DynamicToolDefinition | undefined;
  
  if (input.tool_id) {
    tool = registry.getById(input.tool_id);
  } else if (input.tool_name) {
    tool = registry.findByName(input.tool_name);
  }

  if (!tool) {
    return `エラー: ツールが見つかりません (${input.tool_id || input.tool_name})`;
  }

  // 必須パラメータのチェック
  const requiredParams = tool.parameters.filter(p => p.required).map(p => p.name);
  const missingParams = requiredParams.filter(
    p => !(p in input.parameters)
  );

  if (missingParams.length > 0) {
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
    return `
ツール「${tool.name}」の実行に失敗しました。

実行時間: ${result.executionTimeMs}ms
エラー: ${result.error}
`;
  }

  // 結果を整形
  let resultText = "";
  if (typeof result.result === "string") {
    resultText = result.result;
  } else if (result.result !== undefined) {
    resultText = JSON.stringify(result.result, null, 2);
  }

  return `
ツール「${tool.name}」の実行が完了しました。

実行時間: ${result.executionTimeMs}ms

結果:
${resultText}
`;
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
  const registry = getRegistry();

  if (!input.confirm) {
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
    return `エラー: ${result.error}`;
  }

  return `ツール「${toolName}」(${toolId})を削除しました。`;
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
// Extension Registration
// ============================================================================

export default function registerDynamicToolsExtension(pi: ExtensionAPI): void {
  // create_tool: 動的ツール生成
  pi.registerTool({
    name: "create_tool",
    description: "動的ツールを生成します。TypeScriptコードを指定して新しいツールを作成します。",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "ツール名（英字で始まり、英数字、アンダースコア、ハイフンのみ使用可能）",
        },
        description: {
          type: "string",
          description: "ツールの説明",
        },
        code: {
          type: "string",
          description: "ツールのTypeScript/JavaScriptコード。execute(params)関数をエクスポートする必要があります。",
        },
        parameters: {
          type: "object",
          description: "パラメータの定義",
          additionalProperties: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["string", "number", "boolean", "object", "array"],
              },
              description: { type: "string" },
              default: {},
              enum: {
                type: "array",
                items: { type: "string" },
              },
              required: { type: "boolean" },
            },
          },
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "ツールのタグ（カテゴリ分類用）",
        },
        generated_from: {
          type: "string",
          description: "ツールの生成元（タスク説明など）",
        },
      },
      required: ["name", "description", "code"],
    },
    handler: async (input: CreateToolInput) => {
      return await handleCreateTool(input);
    },
  });

  // run_dynamic_tool: 動的ツール実行
  pi.registerTool({
    name: "run_dynamic_tool",
    description: "登録済みの動的ツールを実行します。tool_idまたはtool_nameでツールを指定します。",
    inputSchema: {
      type: "object",
      properties: {
        tool_id: {
          type: "string",
          description: "ツールID",
        },
        tool_name: {
          type: "string",
          description: "ツール名（tool_idの代わりに使用可能）",
        },
        parameters: {
          type: "object",
          description: "ツールに渡すパラメータ",
        },
        timeout_ms: {
          type: "number",
          description: "タイムアウト時間（ミリ秒、デフォルト: 30000）",
        },
      },
      required: ["parameters"],
    },
    handler: async (input: RunDynamicToolInput) => {
      if (!input.tool_id && !input.tool_name) {
        return "エラー: tool_idまたはtool_nameを指定してください";
      }
      return await handleRunDynamicTool(input);
    },
  });

  // list_dynamic_tools: ツール一覧
  pi.registerTool({
    name: "list_dynamic_tools",
    description: "登録済みの動的ツール一覧を表示します。フィルタリングオプションを利用可能です。",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "名前でフィルタ（部分一致）",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "タグでフィルタ",
        },
        min_safety_score: {
          type: "number",
          description: "安全性スコアの最小値（0.0-1.0）",
        },
        limit: {
          type: "number",
          description: "最大表示件数（デフォルト: 20）",
        },
      },
    },
    handler: async (input: ListDynamicToolsInput) => {
      return await handleListDynamicTools(input);
    },
  });

  // delete_dynamic_tool: ツール削除
  pi.registerTool({
    name: "delete_dynamic_tool",
    description: "登録済みの動的ツールを削除します。confirm: true で削除を確定します。",
    inputSchema: {
      type: "object",
      properties: {
        tool_id: {
          type: "string",
          description: "ツールID",
        },
        tool_name: {
          type: "string",
          description: "ツール名（tool_idの代わりに使用可能）",
        },
        confirm: {
          type: "boolean",
          description: "削除の確認（trueで削除実行）",
        },
      },
    },
    handler: async (input: DeleteDynamicToolInput) => {
      if (!input.tool_id && !input.tool_name) {
        return "エラー: tool_idまたはtool_nameを指定してください";
      }
      return await handleDeleteDynamicTool(input);
    },
  });

  // tool_reflection: 反省とツール生成判定
  pi.registerTool({
    name: "tool_reflection",
    description: "タスク実行後に反省を行い、ツール生成が推奨されるかを判定します。",
    inputSchema: {
      type: "object",
      properties: {
        task_description: {
          type: "string",
          description: "実行中のタスクの説明",
        },
        last_tool_result: {
          type: "string",
          description: "直前のツール実行結果",
        },
        failed_attempts: {
          type: "number",
          description: "失敗した試行回数",
        },
      },
      required: ["task_description", "last_tool_result"],
    },
    handler: async (input: ToolReflectionInput) => {
      return await handleToolReflection(input);
    },
  });

  // Step Reflection Hook
  // tool_resultイベント後の反省プロンプト注入
  pi.on("tool_result", async (event: ToolResultEvent, ctx) => {
    // 動的ツール実行後は反省をスキップ
    if (event.toolName.startsWith("dynamic_") || event.toolName === "run_dynamic_tool") {
      return;
    }

    // テキストコンテンツを抽出
    const resultText = event.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map(c => c.text)
      .join("\n");

    // 失敗した場合は反省を推奨
    if (event.isError || 
        resultText.toLowerCase().includes("エラー") || 
        resultText.toLowerCase().includes("失敗")) {
      // コンテキストが利用可能な場合のみメッセージを送信
      if (ctx?.ui?.notify) {
        ctx.ui.notify("[Step Reflection] ツール実行エラーを検出。tool_reflectionで確認してください。", "info");
      }
    }
  });

  // セッション開始時に初期化メッセージを表示
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("[Dynamic Tools] 動的ツール生成システムが有効になりました", "info");
  });
}
