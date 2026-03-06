/*
 * .pi/lib/agent/model-adapters.ts
 * モデルごとのプロンプト傾向を吸収するアダプタを定義する。
 * provider-limits とは分離して、行動最適化だけを扱うために存在する。
 * 関連ファイル: .pi/extensions/subagents/task-execution.ts, .pi/extensions/loop.ts, .pi/lib/provider-limits.ts
 */

/**
 * @abdd.meta
 * path: .pi/lib/agent/model-adapters.ts
 * role: モデル別のプロンプト最適化設定を解決する
 * why: モデル差分を各拡張の if 文に分散させず adapter 層へ集約するため
 * related: .pi/extensions/subagents/task-execution.ts, .pi/extensions/loop.ts, .pi/lib/provider-limits.ts
 * public_api: ModelPromptAdapter, resolveModelPromptAdapter
 * invariants: 不明なモデルでも default adapter を返す、provider は小文字比較する
 * side_effects: なし
 * failure_modes: provider や model が空でも default adapter にフォールバックする
 * @abdd.explain
 * overview: OpenAI, Anthropic, Google 系モデルに対して prompt 密度や通知配置の差分を返す
 * what_it_does:
 *   - モデルごとの adapter 定義を保持する
 *   - provider/model 文字列から最適な adapter を解決する
 *   - internal prompt と user-facing prompt の構造方針を返す
 * why_it_exists:
 *   - 直近バイアスやフォーマットの好みの違いを一箇所で管理するため
 *   - provider-limits の責務を容量制御に限定するため
 * scope:
 *   in: provider, model
 *   out: ModelPromptAdapter
 */

/**
 * prompt 密度。
 * @summary prompt 密度
 */
export type AdapterInstructionDensity = "compact" | "balanced" | "verbose";

/**
 * 通知の配置方式。
 * @summary 通知配置
 */
export type AdapterNoticePlacement = "tail" | "inline";

/**
 * モデル向け prompt adapter。
 * @summary モデル adapter
 */
export interface ModelPromptAdapter {
  id: string;
  instructionDensity: AdapterInstructionDensity;
  noticePlacement: AdapterNoticePlacement;
  internalContextHandoffLines: number;
  prefersBullets: boolean;
  prefersExplicitHeaders: boolean;
  prefersShortRuntimeNotices: boolean;
  prefersStrictOutputTail: boolean;
}

const DEFAULT_ADAPTER: ModelPromptAdapter = {
  id: "default",
  instructionDensity: "balanced",
  noticePlacement: "tail",
  internalContextHandoffLines: 12,
  prefersBullets: true,
  prefersExplicitHeaders: true,
  prefersShortRuntimeNotices: true,
  prefersStrictOutputTail: true,
};

const OPENAI_ADAPTER: ModelPromptAdapter = {
  id: "openai",
  instructionDensity: "compact",
  noticePlacement: "tail",
  internalContextHandoffLines: 10,
  prefersBullets: true,
  prefersExplicitHeaders: true,
  prefersShortRuntimeNotices: true,
  prefersStrictOutputTail: true,
};

const ANTHROPIC_ADAPTER: ModelPromptAdapter = {
  id: "anthropic",
  instructionDensity: "balanced",
  noticePlacement: "inline",
  internalContextHandoffLines: 14,
  prefersBullets: true,
  prefersExplicitHeaders: true,
  prefersShortRuntimeNotices: false,
  prefersStrictOutputTail: true,
};

const GOOGLE_ADAPTER: ModelPromptAdapter = {
  id: "google",
  instructionDensity: "compact",
  noticePlacement: "tail",
  internalContextHandoffLines: 9,
  prefersBullets: true,
  prefersExplicitHeaders: true,
  prefersShortRuntimeNotices: true,
  prefersStrictOutputTail: true,
};

/**
 * provider から基本 adapter を解決する。
 * @summary provider adapter 解決
 * @param provider provider 名
 * @returns adapter
 */
function resolveProviderAdapter(provider?: string): ModelPromptAdapter {
  const normalized = provider?.trim().toLowerCase() ?? "";
  if (normalized.includes("openai")) return OPENAI_ADAPTER;
  if (normalized.includes("anthropic")) return ANTHROPIC_ADAPTER;
  if (normalized.includes("google") || normalized.includes("gemini")) return GOOGLE_ADAPTER;
  return DEFAULT_ADAPTER;
}

/**
 * model 名を見て微調整する。
 * @summary model 微調整
 * @param adapter 基本 adapter
 * @param model model 名
 * @returns 調整済み adapter
 */
function refineAdapterForModel(
  adapter: ModelPromptAdapter,
  model?: string,
): ModelPromptAdapter {
  const normalized = model?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return adapter;
  }

  if (normalized.includes("sonnet") || normalized.includes("o3")) {
    return {
      ...adapter,
      instructionDensity: "compact",
      prefersShortRuntimeNotices: true,
      internalContextHandoffLines: Math.min(adapter.internalContextHandoffLines, 10),
    };
  }

  if (normalized.includes("opus")) {
    return {
      ...adapter,
      instructionDensity: "balanced",
      internalContextHandoffLines: Math.max(adapter.internalContextHandoffLines, 12),
    };
  }

  if (normalized.includes("gpt-5") || normalized.includes("gpt-4o")) {
    return {
      ...adapter,
      instructionDensity: "compact",
      prefersShortRuntimeNotices: true,
    };
  }

  return adapter;
}

/**
 * provider/model から prompt adapter を解決する。
 * @summary adapter 解決
 * @param provider provider 名
 * @param model model 名
 * @returns adapter
 */
export function resolveModelPromptAdapter(
  provider?: string,
  model?: string,
): ModelPromptAdapter {
  return refineAdapterForModel(resolveProviderAdapter(provider), model);
}
