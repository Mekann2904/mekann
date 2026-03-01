/**
 * @abdd.meta
 * path: .pi/extensions/awo-optimizer.ts
 * role: AWO (Agent Workflow Optimization) 自動統合拡張機能
 * why: 実行パターンを分析し、メタツール候補を自動提案するため
 * related: .pi/lib/awo/index.ts, .pi/lib/awo/trace-collector.ts
 * public_api: なし（拡張機能として自動実行）
 * invariants: メタツールは自動登録しない（ユーザー承認必須）
 * side_effects: トレースファイルの読み書き、メタツール候補の生成
 * failure_modes: トレース読み込み失敗時はスキップ
 * @abdd.explain
 * overview: AWOをpiに統合し、週次でメタツール候補を提案する
 * what_it_does:
 *   - ツール呼び出しトレースを自動収集
 *   - セッション開始時に前回の分析結果を確認
 *   - 定期的にメタツール候補を生成・提案
 * why_it_exists:
 *   - LLM呼び出しコストを削減するため
 *   - 繰り返しパターンを自動検出するため
 * scope:
 *   in: ツール呼び出しイベント、トレースファイル
 *   out: メタツール候補、統計情報
 */

/**
 * AWO Optimizer Extension
 *
 * 論文「Optimizing Agentic Workflows using Meta-tools」に基づく
 * https://arxiv.org/abs/2501.08882
 *
 * 機能:
 * - ツール呼び出しトレースの自動収集
 * - 繰り返しパターンの検出
 * - メタツール候補の生成と提案
 *
 * 効果:
 * - LLM呼び出し最大11.9%削減
 * - タスク成功率向上（最大+4.2%ポイント）
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  getGlobalTraceCollector,
  type TraceCollector,
} from "../lib/awo/trace-collector.js";
import {
  getGlobalAWO,
  type AWOOrchestrator,
} from "../lib/awo/index.js";

// ============================================================================
// Configuration
// ============================================================================

interface AWOOptimizerConfig {
  /** トレース収集を有効にする */
  enabled: boolean;
  /** セッション開始時に統計を表示 */
  showStatsOnStart: boolean;
  /** メタツール候補の提案を有効にする */
  proposeMetaTools: boolean;
  /** 分析頻度（セッション数） */
  analysisFrequency: number;
}

const DEFAULT_CONFIG: AWOOptimizerConfig = {
  enabled: true,
  showStatsOnStart: true,
  proposeMetaTools: true,
  analysisFrequency: 7, // 7セッションごとに分析
};

// ============================================================================
// State
// ============================================================================

let config: AWOOptimizerConfig;
let traceCollector: TraceCollector | null = null;
let awo: AWOOrchestrator | null = null;
let sessionCount = 0;
let currentTraceId: string | null = null;

// ============================================================================
// Extension Registration
// ============================================================================

export default function registerAWOOptimizerExtension(pi: ExtensionAPI): void {
  config = { ...DEFAULT_CONFIG };

  // 環境変数で設定を上書き
  if (process.env.AWO_OPTIMIZER_ENABLED === "false") {
    config.enabled = false;
  }
  if (process.env.AWO_PROPOSE_META_TOOLS === "false") {
    config.proposeMetaTools = false;
  }

  if (!config.enabled) {
    return;
  }

  // グローバルインスタンスを初期化
  traceCollector = getGlobalTraceCollector();
  awo = getGlobalAWO();

  // セッション開始時: 統計表示と分析
  pi.on("session_start", async (_event, ctx) => {
    sessionCount++;

    // 新しいトレースを開始
    if (traceCollector) {
      currentTraceId = traceCollector.startTrace(
        `session-${Date.now()}`,
        "Interactive session",
        "workflow"
      );
    }

    if (config.showStatsOnStart) {
      const { traces, registry } = awo!.getStats();
      if (traces.totalTraces > 0) {
        ctx.ui.notify(
          `[AWO] トレース統計: ${traces.totalTraces}件, ` +
            `登録済みメタツール: ${registry.totalTools}件`,
          "info"
        );
      }
    }

    // 定期的にメタツール候補を分析・提案
    if (config.proposeMetaTools && sessionCount % config.analysisFrequency === 0) {
      const candidates = awo!.analyzeCandidates();
      if (candidates.length > 0) {
        ctx.ui.notify(
          `[AWO] ${candidates.length}件のメタツール候補が見つかりました。` +
            `詳細は \`pi meta-tools list\` で確認できます。`,
          "info"
        );
      }
    }
  });

  // ツール呼び出し時: トレース収集
  pi.on("tool_call", async (event, _ctx) => {
    if (!traceCollector || !currentTraceId) return;

    // イベントタイプに応じて処理
    const eventAny = event as any;
    const toolName: string = eventAny.tool || "unknown";
    const params: Record<string, unknown> = eventAny.params || {};

    traceCollector.recordToolCall(currentTraceId, {
      toolName,
      arguments: params,
      result: undefined,
      success: true,
    });
  });

  // セッション終了時: トレース保存
  pi.on("session_shutdown", async (_event, _ctx) => {
    if (!traceCollector || !currentTraceId) return;

    // 現在のセッションをファイナライズ
    traceCollector.finalizeTrace(currentTraceId, true);
    currentTraceId = null;
  });

  // コマンド: メタツール候補一覧
  pi.registerCommand("meta-tools-list", {
    description: "Show meta-tool candidates extracted from traces",
    handler: async (_args, ctx) => {
      const candidates = awo!.analyzeCandidates();

      if (candidates.length === 0) {
        ctx.ui.notify("[AWO] メタツール候補はありません", "info");
        return;
      }

      ctx.ui.notify(`[AWO] メタツール候補 (${candidates.length}件):`, "info");
      for (const c of candidates.slice(0, 5)) {
        const toolNames = c.toolSequence.map((t) => t.toolName).join(" → ");
        ctx.ui.notify(
          `  - ${toolNames} (頻度: ${c.frequency}, 削減推定: ${c.savingsEstimate})`,
          "info"
        );
      }
    },
  });

  // コマンド: 統計表示
  pi.registerCommand("awo-stats", {
    description: "Show AWO statistics",
    handler: async (_args, ctx) => {
      const { traces, registry } = awo!.getStats();

      ctx.ui.notify("[AWO] 統計情報:", "info");
      ctx.ui.notify(`  - 総トレース数: ${traces.totalTraces}`, "info");
      ctx.ui.notify(`  - 総ツール呼び出し: ${traces.totalToolCalls}`, "info");
      ctx.ui.notify(`  - 登録済みメタツール: ${registry.totalTools}`, "info");
    },
  });

  // コマンド: メタツール生成（手動承認）
  pi.registerCommand("meta-tools-generate", {
    description: "Generate meta-tools from candidates (requires approval)",
    handler: async (_args, ctx) => {
      const tools = awo!.generateMetaTools(false); // autoRegister = false

      if (tools.length === 0) {
        ctx.ui.notify("[AWO] 生成可能なメタツールはありません", "info");
        return;
      }

      ctx.ui.notify(`[AWO] ${tools.length}件のメタツールを生成しました:`, "info");
      for (const t of tools) {
        ctx.ui.notify(`  - ${t.name}: ${t.description}`, "info");
      }
    },
  });
}
