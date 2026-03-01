/**
 * @abdd.meta
 * path: .pi/extensions/trajectory-reduction.ts
 * role: Trajectory Reduction機能のpi拡張機能エントリーポイント
 * why: AgentDiet論文に基づく軌跡圧縮機能をpiシステムに統合するため
 * related: .pi/lib/trajectory-reduction/index.ts, .pi/extensions/subagents.ts
 * public_api: trajectory_reduce, trajectory_stats, trajectory_config ツール
 * invariants: 拡張機能はpiのライフサイクルに従う
 * side_effects: ファイルシステムへのログ書き込み、LLM API呼び出し
 * failure_modes: APIエラー、設定エラー
 * @abdd.explain
 * overview: piシステムへの軌跡圧縮機能統合
 * what_it_does:
 *   - trajectory_reduce: 手動圧縮ツール
 *   - trajectory_stats: 統計表示ツール
 *   - trajectory_config: 設定管理ツール
 *   - subagents.tsへの自動統合フック
 * why_it_exists:
 *   - ユーザーが軌跡圧縮機能を操作できるようにするため
 *   - 既存のエージェント実行に自動的に統合するため
 * scope:
 *   in: ExtensionAPI, 設定
 *   out: ツール登録, イベントフック
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  TrajectoryReducer,
  createTrajectoryReducer,
  globalReducerStore,
  globalTrajectoryStore,
  formatStats,
  DEFAULT_TRAJECTORY_REDUCTION_CONFIG,
  type TrajectoryStep,
  type TrajectoryReductionConfig,
  type ReductionStats,
} from "../lib/trajectory-reduction/index.js";
import { messageToStep } from "../lib/trajectory-reduction/serialization.js";

// 設定ファイルパス
function getConfigPath(cwd: string): string {
  return join(cwd, ".pi", "data", "trajectory-reduction-config.json");
}

// 設定ディレクトリを確保
function ensureConfigDir(cwd: string): void {
  const dir = join(cwd, ".pi", "data");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * 拡張機能のデフォルトエクスポート
 */
export default function (pi: ExtensionAPI) {
  // 設定を読み込み
  function loadConfig(cwd: string): TrajectoryReductionConfig {
    try {
      const configPath = getConfigPath(cwd);
      if (existsSync(configPath)) {
        const content = readFileSync(configPath, "utf-8");
        const stored = JSON.parse(content) as Partial<TrajectoryReductionConfig>;
        return { ...DEFAULT_TRAJECTORY_REDUCTION_CONFIG, ...stored };
      }
    } catch (error) {
      console.error("[trajectory-reduction] Failed to load config:", error);
    }
    return { ...DEFAULT_TRAJECTORY_REDUCTION_CONFIG };
  }

  // 設定を保存
  function saveConfig(cwd: string, config: Partial<TrajectoryReductionConfig>): void {
    try {
      ensureConfigDir(cwd);
      const configPath = getConfigPath(cwd);
      const current = loadConfig(cwd);
      const updated = { ...current, ...config };
      writeFileSync(configPath, JSON.stringify(updated, null, 2), "utf-8");
    } catch (error) {
      console.error("[trajectory-reduction] Failed to save config:", error);
    }
  }

  // LLM呼び出し関数（簡易実装）
  async function callLLM(prompt: string, model: string): Promise<string> {
    // 実際の実装では pi のインフラを使用
    // 現在は簡易的なモック実装
    console.log(`[trajectory-reduction] Calling ${model} for reflection...`);

    // テスト出力を検出した場合の圧縮
    if (prompt.includes("PASSED") && prompt.length > 1000) {
      const failedMatch = prompt.match(/FAILED[^\n]*/g);
      if (failedMatch && failedMatch.length > 0) {
        return `WASTE_TYPES: [useless]
CONTENT:
... テスト実行結果（圧縮済み）

失敗したテスト:
${failedMatch.join("\n")}`;
      }
      return `WASTE_TYPES: [useless]
CONTENT:
... テスト実行結果（すべてパス）`;
    }

    // ファイル読み込みの重複を検出
    if (prompt.includes("read") && prompt.includes("cat ")) {
      return `WASTE_TYPES: [redundant]
CONTENT:
... ファイル内容（既読のため圧縮）`;
    }

    // デフォルト
    return `WASTE_TYPES: []
CONTENT:
... (圧縮なし)`;
  }

  // ツール: trajectory_stats
  pi.registerTool({
    name: "trajectory_stats",
    label: "Trajectory Stats",
    description: "現在の軌跡圧縮統計を表示します。実行IDを指定しない場合は全実行の統計を表示します。",
    parameters: Type.Object({
      runId: Type.Optional(Type.String({ description: "実行ID（省略時は全実行）" })),
      format: Type.Optional(Type.String({
        description: "出力フォーマット（markdown または json）",
        enum: ["markdown", "json"],
        default: "markdown",
      })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const format = params.format ?? "markdown";

      if (params.runId) {
        // 特定の実行の統計
        const reducer = globalReducerStore.get(params.runId);
        if (!reducer) {
          return {
            content: [{ type: "text" as const, text: `実行ID "${params.runId}" は見つかりません。` }],
            details: { found: false },
          };
        }

        const stats = reducer.getStats();
        const trajectory = reducer.getTrajectory();

        if (format === "json") {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ runId: params.runId, stats, trajectoryLength: trajectory.length }, null, 2),
            }],
            details: { runId: params.runId, stats, trajectoryLength: trajectory.length },
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: `## 実行 ${params.runId} の統計\n\n${formatStats(stats)}\n\n軌跡長: ${trajectory.length} ステップ`,
          }],
          details: { runId: params.runId, trajectoryLength: trajectory.length },
        };
      }

      // 全実行の統計
      const allStats: { runId: string; stats: ReductionStats }[] = [];
      // Note: プライベートプロパティへのアクセスを回避
      const reducerEntries = Array.from((globalReducerStore as unknown as Map<string, TrajectoryReducer>).entries());

      for (const [runId, reducer] of reducerEntries) {
        allStats.push({ runId, stats: reducer.getStats() });
      }

      if (format === "json") {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(allStats, null, 2),
          }],
          details: { runs: allStats },
        };
      }

      const summary = allStats
        .map(({ runId, stats }) => {
          return `### ${runId}\n${formatStats(stats)}`;
        })
        .join("\n\n");

      return {
        content: [{
          type: "text" as const,
          text: `# 全実行の軌跡圧縮統計\n\n${summary || "統計データがありません。"}`,
        }],
        details: { runCount: allStats.length },
      };
    },
  });

  // ツール: trajectory_config
  pi.registerTool({
    name: "trajectory_config",
    label: "Trajectory Config",
    description: "軌跡圧縮の設定を表示・変更します。",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("show", { description: "現在の設定を表示" }),
        Type.Literal("enable", { description: "圧縮を有効化" }),
        Type.Literal("disable", { description: "圧縮を無効化" }),
        Type.Literal("set", { description: "設定値を変更" }),
      ], { description: "アクション" }),
      key: Type.Optional(Type.String({ description: "設定キー（action=set時）" })),
      value: Type.Optional(Type.String({ description: "設定値（action=set時）" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const config = loadConfig(ctx.cwd);

      switch (params.action) {
        case "show": {
          const lines = [
            "## Trajectory Reduction 設定",
            "",
            "| パラメータ | 値 |",
            "|-----------|-----|",
            `| enabled | ${config.enabled} |`,
            `| reflectionModel | ${config.reflectionModel} |`,
            `| threshold | ${config.threshold} |`,
            `| stepsAfter | ${config.stepsAfter} |`,
            `| stepsBefore | ${config.stepsBefore} |`,
            `| skipShortTasks | ${config.skipShortTasks} |`,
            `| minStepsForReduction | ${config.minStepsForReduction} |`,
            `| logReductions | ${config.logReductions} |`,
            `| skipOnCacheHit | ${config.skipOnCacheHit} |`,
            `| maxContextTokens | ${config.maxContextTokens} |`,
          ];
          return {
            content: [{ type: "text" as const, text: lines.join("\n") }],
            details: { config },
          };
        }

        case "enable": {
          saveConfig(ctx.cwd, { enabled: true });
          return {
            content: [{ type: "text" as const, text: "軌跡圧縮を有効化しました。" }],
            details: { enabled: true },
          };
        }

        case "disable": {
          saveConfig(ctx.cwd, { enabled: false });
          return {
            content: [{ type: "text" as const, text: "軌跡圧縮を無効化しました。" }],
            details: { enabled: false },
          };
        }

        case "set": {
          if (!params.key || params.value === undefined) {
            return {
              content: [{
                type: "text" as const,
                text: "エラー: key と value パラメータが必要です。",
              }],
              details: { error: "missing_params" },
            };
          }

          const key = params.key as keyof TrajectoryReductionConfig;
          let value: string | number | boolean = params.value;

          // 型変換
          if (key === "threshold" || key === "stepsAfter" || key === "stepsBefore" ||
              key === "minStepsForReduction" || key === "maxContextTokens") {
            value = parseInt(params.value, 10);
            if (isNaN(value)) {
              return {
                content: [{
                  type: "text" as const,
                  text: `エラー: ${key} は数値である必要があります。`,
                }],
                details: { error: "invalid_type", key },
              };
            }
          } else if (key === "enabled" || key === "skipShortTasks" ||
                     key === "logReductions" || key === "skipOnCacheHit") {
            value = params.value.toLowerCase() === "true";
          }

          const updates = { [key]: value } as Partial<TrajectoryReductionConfig>;
          saveConfig(ctx.cwd, updates);

          return {
            content: [{
              type: "text" as const,
              text: `設定を更新しました: ${key} = ${value}`,
            }],
            details: { key, value },
          };
        }

        default:
          return {
            content: [{ type: "text" as const, text: "不明なアクションです。" }],
            details: { error: "unknown_action" },
          };
      }
    },
  });

  // ツール: trajectory_reduce
  pi.registerTool({
    name: "trajectory_reduce",
    label: "Trajectory Reduce",
    description: "指定した実行の軌跡を手動で圧縮します。通常は自動実行されるため、デバッグ用途です。",
    parameters: Type.Object({
      runId: Type.String({ description: "実行ID" }),
      step: Type.Optional(Type.Number({ description: "圧縮対象ステップ（省略時は自動判定）" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      let reducer = globalReducerStore.get(params.runId);

      if (!reducer) {
        // 新規作成
        const config = loadConfig(ctx.cwd);
        reducer = createTrajectoryReducer(params.runId, config, callLLM);
      }

      const currentStep = params.step ?? reducer.getTrajectory().length;
      const result = await reducer.afterStepExecution(currentStep);

      if (!result) {
        return {
          content: [{
            type: "text" as const,
            text: `ステップ ${currentStep} は圧縮条件を満たしていません（閾値以下または既に圧縮済み）。`,
          }],
          details: { compressed: false, step: currentStep },
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: `## 圧縮結果\n\n` +
            `- **削減トークン数**: ${result.tokensSaved}\n` +
            `- **削減率**: ${(result.reductionRatio * 100).toFixed(1)}%\n` +
            `- **廃棄タイプ**: ${result.wasteTypes.join(", ")}\n` +
            `- **処理時間**: ${result.processingTimeMs}ms\n\n` +
            `### 圧縮後コンテンツ\n\`\`\`\n${result.content.slice(0, 500)}...\n\`\`\``,
        }],
        details: {
          compressed: true,
          step: currentStep,
          tokensSaved: result.tokensSaved,
          reductionRatio: result.reductionRatio,
          wasteTypes: result.wasteTypes,
        },
      };
    },
  });

  // スラッシュコマンド
  pi.registerCommand("trajectory", {
    description: "軌跡圧縮機能の管理 (stats, config, reduce)",
    handler: async (args, ctx) => {
      const input = (args || "").trim();

      if (!input || input === "help") {
        ctx.ui.notify(
          "/trajectory stats [runId] | /trajectory config show | /trajectory config enable | /trajectory config disable | /trajectory reduce <runId>",
          "info"
        );
        return;
      }

      const [command, ...rest] = input.split(/\s+/);

      if (command === "stats") {
        const runId = rest[0];
        pi.sendMessage({
          customType: "trajectory-stats",
          content: runId ? `実行 ${runId} の統計を取得中...` : "全実行の統計を取得中...",
          display: true,
        });
        return;
      }

      if (command === "config") {
        const subCommand = rest[0];
        if (subCommand === "show" || subCommand === "enable" || subCommand === "disable") {
          pi.sendMessage({
            customType: "trajectory-config",
            content: `設定を${subCommand === "show" ? "表示" : subCommand === "enable" ? "有効化" : "無効化"}中...`,
            display: true,
          });
        } else {
          ctx.ui.notify("Usage: /trajectory config show|enable|disable", "warning");
        }
        return;
      }

      if (command === "reduce") {
        const runId = rest[0];
        if (!runId) {
          ctx.ui.notify("Usage: /trajectory reduce <runId>", "warning");
          return;
        }
        pi.sendMessage({
          customType: "trajectory-reduce",
          content: `実行 ${runId} の軌跡を圧縮中...`,
          display: true,
        });
        return;
      }

      ctx.ui.notify(`Unknown command: ${command}`, "warning");
    },
  });

  // セッション開始時の初期化
  pi.on("session_start", async (_event, ctx) => {
    const config = loadConfig(ctx.cwd);
    ctx.ui.notify(
      `Trajectory Reduction 拡張機能を読み込みました (enabled: ${config.enabled}, model: ${config.reflectionModel})`,
      "info"
    );
  });

  // エクスポート: 他の拡張機能から使用可能
  return {
    /**
     * リデューサーを作成または取得
     */
    getOrCreateReducer(runId: string, cwd: string): TrajectoryReducer {
      let reducer = globalReducerStore.get(runId);
      if (!reducer) {
        const config = loadConfig(cwd);
        reducer = createTrajectoryReducer(runId, config, callLLM);
      }
      return reducer;
    },

    /**
     * 軌跡にステップを追加
     */
    addStep(runId: string, message: { role: string; content: string }, stepNumber: number): void {
      const step = messageToStep(message, stepNumber);
      globalTrajectoryStore.addStep(runId, step);
    },

    /**
     * ステップ実行後に圧縮を試行
     */
    async reduceAfterStep(runId: string, currentStep: number, cwd: string) {
      const reducer = this.getOrCreateReducer(runId, cwd);
      return reducer.afterStepExecution(currentStep);
    },

    /**
     * 現在の設定を取得
     */
    getConfig(cwd: string): TrajectoryReductionConfig {
      return loadConfig(cwd);
    },
  };
}

// 型エクスポート
export type TrajectoryReductionExtension = ReturnType<typeof exports>;
