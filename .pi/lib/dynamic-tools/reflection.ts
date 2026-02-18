/**
 * @abdd.meta
 * path: .pi/lib/dynamic-tools/reflection.ts
 * role: 動的ツール生成システムにおける実行後のリフレクションと新規ツール生成判定
 * why: ツール実行結果を分析し、繰り返しパターンや効率化の機会を検出して新規ツール生成を提案するため
 * related: types.js, registry.js, generator.ts, orchestrator.ts
 * public_api: detectRepetitivePattern, shouldCreateNewTool
 * invariants:
 *   - detectRepetitivePatternはcontextがnullでない場合のみ呼び出される
 *   - shouldCreateNewToolは必ずToolReflectionResult型を返す
 *   - failureCountが負の値であってはならない
 * side_effects:
 *   - loadAllToolDefinitions, recommendToolsForTaskの呼び出しによるファイルシステムアクセス（shouldCreateNewTool内）
 * failure_modes:
 *   - context.lastToolResultが空文字またはundefinedの場合、パターン検出はnullを返す
 *   - bashコマンドパターンが検出されない場合、空配列を返す
 * @abdd.explain
 * overview: ツール実行後の反省機能を提供し、操作パターンを分析して新規ツール生成の必要性を判定するモジュール
 * what_it_does:
 *   - 実行コンテキストから繰り返し操作パターンを検出する
 *   - 同一ツールの重複使用や類似Bashコマンドパターンを抽出する
 *   - 検出されたパターンに基づいて新規ツール作成の可否を判定する
 *   - 改善提案とプロトタイプツール定義を生成する
 * why_it_exists:
 *   - 手動での繰り返し操作を自動的に検出し、動的ツール生成のトリガーとするため
 *   - 効率的なワークフロー実現のため、操作パターンのツール化を自動提案するため
 * scope:
 *   in: ToolReflectionContext（lastToolName, lastToolResult, currentTask, failureCount等）
 *   out: ToolReflectionResult（shouldCreateTool, proposedTool, improvementSuggestions, reflectionReason）
 */

/**
 * 動的ツール生成システム - リフレクション
 * ツール実行後の反省と新規ツール生成の判定
 */

import {
  type ToolReflectionResult,
  type ToolReflectionContext,
  type DynamicToolMode,
  type DynamicToolDefinition,
  getDynamicToolsPaths,
  type DynamicToolsPaths,
} from "./types.js";
import {
  loadAllToolDefinitions,
  recommendToolsForTask,
} from "./registry.js";

// ============================================================================
// 繰り返しパターン検出
// ============================================================================

 /**
  * 繰り返し操作のパターンを検出する
  * @param context - ツールの実行コンテキスト
  * @returns 検出結果（pattern, occurrences等）を含むオブジェクト、または検出されなかった場合はnull
  */
export function detectRepetitivePattern(
  context: ToolReflectionContext
): { detected: boolean; pattern: string; occurrences: number } | null {
  const { lastToolName, lastToolResult, currentTask } = context;

  // 同じツールを繰り返し使用している場合
  if (lastToolName && currentTask.includes(lastToolName)) {
    return {
      detected: true,
      pattern: `repeated_tool_use:${lastToolName}`,
      occurrences: 2,
    };
  }

  // 似たようなコマンドの繰り返しを検出
  const bashPatterns = extractBashPatterns(lastToolResult);
  if (bashPatterns.length > 0) {
    return {
      detected: true,
      pattern: `bash_pattern:${bashPatterns[0]}`,
      occurrences: 1,
    };
  }

  return null;
}

/**
 * Bashコマンドパターンを抽出
 */
function extractBashPatterns(output: string): string[] {
  const patterns: string[] = [];

  // 一般的なコマンドパターンを検出
  const commandPatterns = [
    /git\s+\w+/g,
    /npm\s+\w+/g,
    /yarn\s+\w+/g,
    /docker\s+\w+/g,
    /kubectl\s+\w+/g,
    /find\s+.+/g,
    /grep\s+.+/g,
    /sed\s+.+/g,
    /awk\s+.+/g,
  ];

  for (const pattern of commandPatterns) {
    const matches = output.match(pattern);
    if (matches) {
      patterns.push(...matches);
    }
  }

  return patterns;
}

// ============================================================================
// ツール生成判定
// ============================================================================

 /**
  * 新しいツール作成可否を判定
  * @param context - ツール反射のコンテキスト情報
  * @returns ツール生成の判定結果
  */
export function shouldCreateNewTool(
  context: ToolReflectionContext
): ToolReflectionResult {
  const {
    lastToolName,
    lastToolResult,
    currentTask,
    failureCount,
  } = context;

  const improvementSuggestions: string[] = [];
  let shouldCreateTool = false;
  let proposedTool: ToolReflectionResult["proposedTool"] = undefined;
  let reflectionReason = "";

  // 1. 繰り返しパターンの検出
  const patternMatch = detectRepetitivePattern(context);
  if (patternMatch && patternMatch.occurrences >= 2) {
    shouldCreateTool = true;
    reflectionReason = "繰り返し操作が検出されました";
    improvementSuggestions.push(
      "この操作パターンをツール化することで効率化できます"
    );

    // 提案ツールを生成
    const toolName = generateToolNameFromPattern(patternMatch.pattern);
    proposedTool = {
      name: toolName,
      description: `${patternMatch.pattern} 操作を自動化するツール`,
      mode: "bash" as DynamicToolMode,
      code: extractCodeFromResult(lastToolResult),
      reason: `このパターンが${patternMatch.occurrences}回検出されました`,
    };
  }

  // 2. 失敗回数に基づく判定
  if (failureCount >= 3) {
    shouldCreateTool = true;
    reflectionReason = reflectionReason || "複数回の失敗が検出されました";
    improvementSuggestions.push(
      "より特化したツールを作成することで成功率が向上する可能性があります"
    );

    if (!proposedTool) {
      const toolName = generateToolNameFromTask(currentTask);
      proposedTool = {
        name: toolName,
        description: `${currentTask.slice(0, 50)}... のためのツール`,
        mode: "bash" as DynamicToolMode,
        code: "# このツールのコードを定義してください",
        reason: "繰り返し失敗するタスクを自動化",
      };
    }
  }

  // 3. 既存ツールでカバーできないか確認
  const paths = getDynamicToolsPaths();
  const existingTools = loadAllToolDefinitions(paths);
  const recommendedTools = recommendToolsForTask(currentTask, paths);

  if (recommendedTools.length === 0 && lastToolResult && lastToolResult.length > 100) {
    // 既存ツールがなく、出力が大きい場合
    improvementSuggestions.push(
      "既存のツールでは対応できない可能性があります"
    );
  }

  // 4. 複雑な操作チェーンの検出
  const hasComplexChain = detectComplexChain(lastToolResult);
  if (hasComplexChain) {
    improvementSuggestions.push(
      "複数の操作を組み合わせた単一ツールの作成を検討してください"
    );
  }

  // 5. エラーパターンの分析
  if (lastToolResult.includes("error") || lastToolResult.includes("Error")) {
    improvementSuggestions.push(
      "エラー処理を含む堅牢なツールの作成を検討してください"
    );
  }

  // リフレクションが必要かどうかの判定
  const needsReflection =
    shouldCreateTool ||
    improvementSuggestions.length > 0 ||
    failureCount > 0;

  return {
    needsReflection,
    shouldCreateTool,
    proposedTool,
    improvementSuggestions,
    reflectionReason: reflectionReason || (needsReflection ? "改善の機会が検出されました" : ""),
  };
}

/**
 * パターンからツール名を生成
 */
function generateToolNameFromPattern(pattern: string): string {
  // パターン文字列からツール名を生成
  const cleaned = pattern
    .replace(/[:\s]+/g, "_")
    .replace(/[^a-z0-9_]/gi, "")
    .toLowerCase()
    .slice(0, 32);

  return `auto_${cleaned}`;
}

/**
 * タスクからツール名を生成
 */
function generateToolNameFromTask(task: string): string {
  // タスクからキーワードを抽出
  const keywords = task
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 3);

  if (keywords.length === 0) {
    return `auto_tool_${Date.now().toString(36)}`;
  }

  return `auto_${keywords.join("_")}`;
}

/**
 * 実行結果からコードを抽出
 */
function extractCodeFromResult(result: string): string {
  // コードブロックを探す
  const codeBlockMatch = result.match(/```(?:bash|sh)?\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // コマンドラインを探す
  const commandMatch = result.match(/^\$\s*(.+)$/m);
  if (commandMatch) {
    return commandMatch[1].trim();
  }

  return "# コードを抽出できませんでした";
}

/**
 * 複雑な操作チェーンを検出
 */
function detectComplexChain(result: string): boolean {
  // パイプの数をカウント
  const pipeCount = (result.match(/\|/g) || []).length;

  // && でつながれたコマンドをカウント
  const chainCount = (result.match(/&&/g) || []).length;

  return pipeCount >= 3 || chainCount >= 2;
}

// ============================================================================
// リフレクションプロンプト生成
// ============================================================================

 /**
  * リフレクション用のプロンプトを生成
  * @param context リフレクションのコンテキスト情報
  * @param reflectionResult リフレクションの実行結果
  * @returns 生成されたプロンプト文字列
  */
export function buildReflectionPrompt(
  context: ToolReflectionContext,
  reflectionResult: ToolReflectionResult
): string {
  const sections: string[] = [
    `# ツール実行後のリフレクション`,
    ``,
    `## コンテキスト`,
    `- 現在のタスク: ${context.currentTask}`,
    `- 最後に使用したツール: ${context.lastToolName || "なし"}`,
    `- 失敗回数: ${context.failureCount}`,
  ];

  if (context.patternMatch) {
    sections.push(`- 検出されたパターン: ${context.patternMatch.pattern} (${context.patternMatch.occurrences}回)`);
  }

  sections.push(``);
  sections.push(`## 分析結果`);

  if (reflectionResult.shouldCreateTool && reflectionResult.proposedTool) {
    sections.push(``);
    sections.push(`### 新しいツールの作成を推奨`);
    sections.push(``);
    sections.push(`**理由**: ${reflectionResult.proposedTool.reason}`);
    sections.push(``);
    sections.push(`**提案されたツール**:`);
    sections.push(`- 名前: ${reflectionResult.proposedTool.name}`);
    sections.push(`- 説明: ${reflectionResult.proposedTool.description}`);
    sections.push(`- モード: ${reflectionResult.proposedTool.mode}`);
    sections.push(`- コード:`);
    sections.push(`\`\`\``);
    sections.push(reflectionResult.proposedTool.code);
    sections.push(`\`\`\``);
  }

  if (reflectionResult.improvementSuggestions.length > 0) {
    sections.push(``);
    sections.push(`### 改善提案`);
    for (const suggestion of reflectionResult.improvementSuggestions) {
      sections.push(`- ${suggestion}`);
    }
  }

  sections.push(``);
  sections.push(`## 次のアクション`);
  sections.push(``);

  if (reflectionResult.shouldCreateTool) {
    sections.push(`新しいツールを作成する場合は、以下のコマンドを使用してください:`);
    sections.push(`\`\`\``);
    sections.push(`create_tool: 名前="${reflectionResult.proposedTool?.name}" 説明="${reflectionResult.proposedTool?.description}"`);
    sections.push(`\`\`\``);
  } else if (reflectionResult.needsReflection) {
    sections.push(`上記の改善提案を検討し、必要に応じてアクションを実行してください。`);
  } else {
    sections.push(`現時点で特別なアクションは必要ありません。`);
  }

  return sections.join("\n");
}

// ============================================================================
// 自動ツール生成（提案のみ）
// ============================================================================

 /**
  * タスクに基づきツールを提案
  * @param task 実行するタスクの説明
  * @param lastToolResult 前回のツール実行結果（任意）
  * @returns 提案されたツール情報、またはnull
  */
export function proposeToolFromTask(
  task: string,
  lastToolResult?: string
): ToolReflectionResult["proposedTool"] | null {
  // タスクの種類を判定
  const taskLower = task.toLowerCase();

  // Git関連
  if (taskLower.includes("git") && taskLower.includes("commit")) {
    return {
      name: "auto_git_commit",
      description: "Gitの変更をステージングしてコミットするツール",
      mode: "bash",
      code: "git add . && git commit -m \"$MESSAGE\"",
      reason: "Gitコミット操作が検出されました",
    };
  }

  // ファイル検索
  if (taskLower.includes("find") || taskLower.includes("search") || taskLower.includes("検索")) {
    return {
      name: "auto_search_files",
      description: "ファイルを検索するツール",
      mode: "bash",
      code: "find . -type f -name \"$PATTERN\" 2>/dev/null",
      reason: "ファイル検索操作が検出されました",
    };
  }

  // コード置換
  if (taskLower.includes("replace") || taskLower.includes("置換") || taskLower.includes("sed")) {
    return {
      name: "auto_replace_text",
      description: "テキストを置換するツール",
      mode: "bash",
      code: "sed -i '' \"s/$OLD/$NEW/g\" \"$FILE\"",
      reason: "テキスト置換操作が検出されました",
    };
  }

  // 最後のツール結果から推測
  if (lastToolResult) {
    const bashCommands = extractBashPatterns(lastToolResult);
    if (bashCommands.length > 0) {
      const primaryCommand = bashCommands[0];
      return {
        name: generateToolNameFromPattern(`bash_${primaryCommand.split(/\s+/)[0]}`),
        description: `${primaryCommand} を実行するツール`,
        mode: "bash",
        code: primaryCommand,
        reason: "Bashコマンドパターンから推測",
      };
    }
  }

  return null;
}

 /**
  * リフレクション実行の要否を判定
  * @param context リフレクション判定用のコンテキスト情報
  * @returns リフレクションを実行すべきかどうか
  */
export function shouldTriggerReflection(
  context: Partial<ToolReflectionContext>
): boolean {
  // 条件: 失敗がある、またはツールが使用されている
  if ((context.failureCount ?? 0) > 0) {
    return true;
  }

  if (context.lastToolName && context.lastToolResult) {
    return true;
  }

  if (context.patternMatch?.detected) {
    return true;
  }

  return false;
}
