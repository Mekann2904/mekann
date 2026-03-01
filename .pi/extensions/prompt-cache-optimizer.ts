/**
 * @abdd.meta
 * path: .pi/extensions/prompt-cache-optimizer.ts
 * role: プロンプトキャッシング最適化拡張機能（自動キャッシングプロバイダー用）
 * why: 論文「Don't Break the Cache」の推奨事項に基づき、LLMプロバイダーの自動キャッシングを最大化するため
 * related: .pi/lib/prompt-templates.ts, .pi/APPEND_SYSTEM.md
 * public_api: PromptCacheOptimizerConfig, CacheMetrics
 * invariants:
 *   - システムプロンプトは変更しない（監視のみ）
 *   - 動的要素が検出された場合は警告する
 * side_effects:
 *   - キャッシュメトリクスの記録
 *   - デバッグログの出力
 * failure_modes:
 *   - メトリクス保存の失敗（無視される）
 * @abdd.explain
 * overview: プロンプトの動的要素を検出し、キャッシュ効率を監視する
 * what_it_does:
 *   - システムプロンプト内の動的要素（日付、時刻等）を検出する
 *   - キャッシュヒット率を監視・記録する
 *   - 最適化の推奨事項を提示する
 * why_it_exists:
 *   - API コスト削減と TTFT 改善を実現するため
 *   - 自動キャッシングプロバイダー（z.ai, OpenAI, Google）向けの最適化
 * scope:
 *   in: システムプロンプト、APIレスポンス
 *   out: メトリクス、警告、推奨事項
 */

/**
 * Prompt Cache Optimizer Extension
 *
 * 論文「Don't Break the Cache: An Evaluation of Prompt Caching for Long-Horizon Agentic Tasks」
 * https://arxiv.org/html/2601.06007v2
 *
 * 【重要】自動キャッシングプロバイダー（z.ai, OpenAI, Google）では、
 * UUIDなどのキャッシュ境界マーカーを挿入すると**逆効果**になります。
 *
 * 正しいアプローチ:
 * - システムプロンプトを安定させる（動的要素を含めない）
 * - 動的要素は会話履歴側に配置する
 * - プロンプト構造を変更しない（監視のみ）
 *
 * 対応プロバイダー（自動キャッシング）:
 * - z.ai (GLM-5): コンテンツ類似性に基づく自動キャッシング
 * - OpenAI (GPT-4o, GPT-5): プレフィックス一致で自動キャッシング
 * - Google (Gemini): 暗黙的キャッシング
 *
 * 効果:
 * - API コスト 41-80% 削減
 * - TTFT 13-31% 改善
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

/**
 * キャッシュ最適化の設定
 */
export interface PromptCacheOptimizerConfig {
  /** 最適化を有効にするか */
  enabled: boolean;
  /** 動的要素の検出を有効にするか */
  detectDynamicElements: boolean;
  /** 動的要素検出時に警告するか */
  warnOnDynamicElements: boolean;
  /** メトリクス収集を有効にするか */
  collectMetrics: boolean;
  /** デバッグログを有効にするか */
  debug: boolean;
}

/**
 * キャッシュメトリクス
 */
export interface CacheMetrics {
  /** セッションID */
  sessionId: string;
  /** タイムスタンプ */
  timestamp: number;
  /** プロバイダー名 */
  provider: string;
  /** モデル名 */
  model: string;
  /** 入力トークン数 */
  promptTokens: number;
  /** キャッシュヒットトークン数 */
  cachedTokens: number;
  /** 生成トークン数 */
  completionTokens: number;
  /** 推定コスト削減率（%） */
  estimatedSavingsPercent: number;
}

/**
 * 動的要素の検出結果
 */
export interface DynamicElementDetection {
  /** 検出された要素のリスト */
  elements: string[];
  /** 要素の種類 */
  types: string[];
  /** 推奨される対処法 */
  recommendation: string;
}

/**
 * セッション統計
 */
export interface SessionStats {
  /** 総リクエスト数 */
  totalRequests: number;
  /** 総入力トークン数 */
  totalPromptTokens: number;
  /** 総キャッシュヒットトークン数 */
  totalCachedTokens: number;
  /** 総生成トークン数 */
  totalCompletionTokens: number;
  /** 平均キャッシュヒット率（%） */
  averageCacheHitRate: number;
  /** 推定総コスト削減（%） */
  estimatedTotalSavings: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: PromptCacheOptimizerConfig = {
  enabled: true,
  detectDynamicElements: true,
  warnOnDynamicElements: true,
  collectMetrics: true,
  debug: false,
};

// 自動キャッシングをサポートするプロバイダー
const AUTO_CACHE_PROVIDERS = ["zai", "openai", "google"];

// メトリクス保存ディレクトリ
const METRICS_DIR = ".pi/cache-optimizer";

// 動的要素のパターン
const DYNAMIC_PATTERNS: { pattern: RegExp; type: string; recommendation: string }[] = [
  {
    pattern: /\d{4}[-\/]\d{2}[-\/]\d{2}/g,
    type: "date",
    recommendation: "Remove dates from system prompt or use placeholder",
  },
  {
    pattern: /\d{2}:\d{2}:\d{2}/g,
    type: "time",
    recommendation: "Remove timestamps from system prompt",
  },
  {
    pattern: /current\s+(date|time|timestamp)/gi,
    type: "current-datetime",
    recommendation: "Use dynamic injection at conversation level instead",
  },
  {
    pattern: /session\s*id/gi,
    type: "session-id",
    recommendation: "Move session IDs to conversation history",
  },
  {
    pattern: /user\s*id/gi,
    type: "user-id",
    recommendation: "Move user-specific data to conversation history",
  },
  {
    pattern: /today|now|current/gi,
    type: "temporal-reference",
    recommendation: "Replace with static instructions or inject dynamically",
  },
];

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 設定を読み込む
 */
function loadConfig(): PromptCacheOptimizerConfig {
  return {
    ...DEFAULT_CONFIG,
    enabled: process.env.PROMPT_CACHE_OPTIMIZER_ENABLED !== "false",
    debug: process.env.PROMPT_CACHE_OPTIMIZER_DEBUG === "true",
    warnOnDynamicElements: process.env.PROMPT_CACHE_OPTIMIZER_WARN !== "false",
  };
}

/**
 * 自動キャッシング対応プロバイダーかどうか
 */
function isAutoCacheProvider(provider: string): boolean {
  return AUTO_CACHE_PROVIDERS.includes(provider.toLowerCase());
}

/**
 * システムプロンプトから動的要素を検出
 */
function detectDynamicElements(systemPrompt: string): DynamicElementDetection {
  const elements: string[] = [];
  const types: string[] = [];
  const recommendations: string[] = [];

  for (const { pattern, type, recommendation } of DYNAMIC_PATTERNS) {
    const matches = systemPrompt.match(pattern);
    if (matches && matches.length > 0) {
      elements.push(...matches);
      types.push(type);
      if (!recommendations.includes(recommendation)) {
        recommendations.push(recommendation);
      }
    }
  }

  return {
    elements: [...new Set(elements)],
    types: [...new Set(types)],
    recommendation: recommendations.join("; "),
  };
}

/**
 * メトリクスを保存
 */
function saveMetrics(metrics: CacheMetrics): void {
  try {
    const metricsDir = join(process.cwd(), METRICS_DIR);
    if (!existsSync(metricsDir)) {
      mkdirSync(metricsDir, { recursive: true });
    }

    const date = new Date().toISOString().split("T")[0];
    const filename = `metrics-${date}.jsonl`;
    const filepath = join(metricsDir, filename);

    const line = JSON.stringify(metrics) + "\n";
    writeFileSync(filepath, line, { flag: "a" });
  } catch {
    // メトリクス保存の失敗は無視
  }
}

/**
 * セッション統計を計算
 */
function calculateSessionStats(metricsList: CacheMetrics[]): SessionStats {
  if (metricsList.length === 0) {
    return {
      totalRequests: 0,
      totalPromptTokens: 0,
      totalCachedTokens: 0,
      totalCompletionTokens: 0,
      averageCacheHitRate: 0,
      estimatedTotalSavings: 0,
    };
  }

  const totalPromptTokens = metricsList.reduce((sum, m) => sum + m.promptTokens, 0);
  const totalCachedTokens = metricsList.reduce((sum, m) => sum + m.cachedTokens, 0);
  const totalCompletionTokens = metricsList.reduce((sum, m) => sum + m.completionTokens, 0);

  const averageCacheHitRate =
    totalPromptTokens > 0 ? (totalCachedTokens / totalPromptTokens) * 100 : 0;

  // z.ai は キャッシュヒット 50%割引
  const estimatedTotalSavings =
    totalPromptTokens > 0 ? (totalCachedTokens / totalPromptTokens) * 50 : 0;

  return {
    totalRequests: metricsList.length,
    totalPromptTokens,
    totalCachedTokens,
    totalCompletionTokens,
    averageCacheHitRate,
    estimatedTotalSavings,
  };
}

/**
 * 過去のメトリクスを読み込む
 */
function loadHistoricalMetrics(days: number = 7): CacheMetrics[] {
  const metrics: CacheMetrics[] = [];
  const metricsDir = join(process.cwd(), METRICS_DIR);

  if (!existsSync(metricsDir)) {
    return metrics;
  }

  // 簡易実装: 今日のファイルのみ読み込む
  const today = new Date().toISOString().split("T")[0];
  const filepath = join(metricsDir, `metrics-${today}.jsonl`);

  if (!existsSync(filepath)) {
    return metrics;
  }

  try {
    const content = readFileSync(filepath, "utf-8");
    const lines = content.trim().split("\n");
    for (const line of lines) {
      if (line.trim()) {
        metrics.push(JSON.parse(line));
      }
    }
  } catch {
    // 読み込みエラーは無視
  }

  return metrics;
}

// ============================================================================
// Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
  const config = loadConfig();
  const sessionMetrics: CacheMetrics[] = [];
  let lastSystemPromptHash: string = "";
  let dynamicWarningShown = false;

  if (!config.enabled) {
    return;
  }

  // エージェント開始前にシステムプロンプトを監視
  pi.on("before_agent_start", async (event, ctx) => {
    // システムプロンプトのハッシュを計算（変更検出用）
    const hash = require("node:crypto")
      .createHash("sha256")
      .update(event.systemPrompt)
      .digest("hex")
      .slice(0, 16);

    const isStable = hash === lastSystemPromptHash;
    lastSystemPromptHash = hash;

    if (config.detectDynamicElements && !dynamicWarningShown) {
      const detection = detectDynamicElements(event.systemPrompt);

      if (detection.elements.length > 0 && config.warnOnDynamicElements) {
        dynamicWarningShown = true;

        ctx.ui.notify(
          `[Cache Optimizer] Detected ${detection.elements.length} dynamic elements in system prompt: ` +
            `${detection.types.join(", ")}. This may reduce cache hit rate.`,
          "warn"
        );

        if (config.debug) {
          ctx.ui.notify(
            `[Cache Optimizer] Recommendation: ${detection.recommendation}`,
            "info"
          );
        }
      }
    }

    if (config.debug && isStable) {
      ctx.ui.notify("[Cache Optimizer] System prompt is stable (good for caching)", "info");
    }
  });

  // メトリクス収集（message_end イベントで）
  pi.on("message_end", async (event, ctx) => {
    if (!config.collectMetrics) {
      return;
    }

    // アシスタントメッセージのみ処理
    if (event.message.role !== "assistant") {
      return;
    }

    // 使用量情報があれば記録
    const usage = event.message.usage;
    if (!usage) {
      return;
    }

    // 現在のモデル情報を取得
    const contextUsage = ctx.getContextUsage();
    if (!contextUsage) {
      return;
    }

    // キャッシュヒットトークン数を取得
    // z.ai: usage.prompt_tokens_details.cached_tokens
    // OpenAI: usage.prompt_tokens_details.cached_tokens
    const cachedTokens = (usage as any).prompt_tokens_details?.cached_tokens || 0;

    const metrics: CacheMetrics = {
      sessionId: randomUUID(),
      timestamp: Date.now(),
      provider: contextUsage.model?.provider || "unknown",
      model: contextUsage.model?.id || "unknown",
      promptTokens: usage.prompt_tokens || 0,
      cachedTokens,
      completionTokens: usage.completion_tokens || 0,
      estimatedSavingsPercent:
        usage.prompt_tokens > 0 ? (cachedTokens / usage.prompt_tokens) * 50 : 0,
    };

    sessionMetrics.push(metrics);
    saveMetrics(metrics);

    if (config.debug && cachedTokens > 0) {
      ctx.ui.notify(
        `[Cache Optimizer] Cache hit: ${cachedTokens} tokens (~${metrics.estimatedSavingsPercent.toFixed(1)}% savings)`,
        "info"
      );
    }
  });

  // セッション終了時に統計を表示
  pi.on("session_shutdown", async (_event, ctx) => {
    if (sessionMetrics.length > 0 && config.collectMetrics) {
      const stats = calculateSessionStats(sessionMetrics);

      ctx.ui.notify(
        `[Cache Optimizer] Session stats: ${stats.totalRequests} requests, ` +
          `${stats.averageCacheHitRate.toFixed(1)}% cache hit rate, ` +
          `~${stats.estimatedTotalSavings.toFixed(1)}% cost savings`,
        "info"
      );
    }
  });

  // コマンド: キャッシュ統計を表示
  pi.registerCommand("cache-stats", {
    description: "Show prompt cache optimizer statistics",
    handler: async (_args, ctx) => {
      const allMetrics = [...sessionMetrics, ...loadHistoricalMetrics()];
      const stats = calculateSessionStats(allMetrics);

      const lines = [
        "Prompt Cache Optimizer Statistics",
        "==================================",
        `Total Requests: ${stats.totalRequests}`,
        `Total Prompt Tokens: ${stats.totalPromptTokens.toLocaleString()}`,
        `Total Cached Tokens: ${stats.totalCachedTokens.toLocaleString()}`,
        `Total Completion Tokens: ${stats.totalCompletionTokens.toLocaleString()}`,
        `Average Cache Hit Rate: ${stats.averageCacheHitRate.toFixed(2)}%`,
        `Estimated Cost Savings: ~${stats.estimatedTotalSavings.toFixed(2)}%`,
        "",
        "Based on: arXiv:2601.06007v2",
        "Strategy: System Prompt Stabilization",
        "",
        "Supported Providers (Auto-caching):",
        ...AUTO_CACHE_PROVIDERS.map((p) => `  - ${p}`),
      ];

      for (const line of lines) {
        ctx.ui.notify(line, "info");
      }
    },
  });

  // コマンド: キャッシュ最適化の設定を表示
  pi.registerCommand("cache-config", {
    description: "Show prompt cache optimizer configuration",
    handler: async (_args, ctx) => {
      const lines = [
        "Prompt Cache Optimizer Configuration",
        "=====================================",
        `Enabled: ${config.enabled}`,
        `Detect Dynamic Elements: ${config.detectDynamicElements}`,
        `Warn on Dynamic Elements: ${config.warnOnDynamicElements}`,
        `Collect Metrics: ${config.collectMetrics}`,
        `Debug Mode: ${config.debug}`,
        "",
        "Environment Variables:",
        "  PROMPT_CACHE_OPTIMIZER_ENABLED=false  - Disable",
        "  PROMPT_CACHE_OPTIMIZER_DEBUG=true      - Enable debug",
        "  PROMPT_CACHE_OPTIMIZER_WARN=false      - Disable warnings",
      ];

      for (const line of lines) {
        ctx.ui.notify(line, "info");
      }
    },
  });

  // コマンド: 動的要素チェック
  pi.registerCommand("cache-check", {
    description: "Check current system prompt for cache-breaking elements",
    handler: async (_args, ctx) => {
      const systemPrompt = ctx.getSystemPrompt();
      if (!systemPrompt) {
        ctx.ui.notify("No system prompt available", "warn");
        return;
      }

      const detection = detectDynamicElements(systemPrompt);

      if (detection.elements.length === 0) {
        ctx.ui.notify("[Cache Optimizer] No dynamic elements detected. Good for caching!", "info");
      } else {
        ctx.ui.notify(
          `[Cache Optimizer] Found ${detection.elements.length} dynamic elements:`,
          "warn"
        );
        for (const type of detection.types) {
          ctx.ui.notify(`  - ${type}`, "warn");
        }
        ctx.ui.notify(`Recommendation: ${detection.recommendation}`, "info");
      }

      // プロンプトサイズ情報
      const tokenEstimate = Math.ceil(systemPrompt.length / 4);
      ctx.ui.notify(`System prompt size: ~${tokenEstimate} tokens`, "info");
    },
  });
}
