/**
 * Review fixer settings loader.
 *
 * Reads the review-fixer-owned settings (enabled, maxFixRetries) from the
 * `review-fixer` feature, but resolves the **model + thinking** from the
 * `modes` feature's Work Pi profile (`review_fix`). Centralizing model config
 * under Collaboration Modes keeps every Work Pi's model in one place instead
 * of scattered across feature-specific tabs.
 */

import { featureRawConfig } from "../../settings/enabled.js";
import type { ReviewFixerSettings } from "./types.js";

const DEFAULT_SETTINGS: Pick<ReviewFixerSettings, "reasoningEffort" | "maxFixRetries"> = {
  reasoningEffort: "high",
  maxFixRetries: 3,
};

export function loadReviewFixerSettings(): ReviewFixerSettings {
  const raw = featureRawConfig("review-fixer");
  // Model + thinking live under the `modes` Work Pi profile `review_fix`.
  const modes = featureRawConfig("modes");
  const models = (modes.models ?? {}) as Record<string, unknown>;
  const thinking = (modes.thinking ?? {}) as Record<string, unknown>;

  return {
    enabled: raw.enabled === true,
    model: isValidModel(models.review_fix) ? models.review_fix : undefined,
    reasoningEffort: isValidEffort(thinking.review_fix) ? thinking.review_fix : DEFAULT_SETTINGS.reasoningEffort,
    maxFixRetries: typeof raw.maxFixRetries === "number" && Number.isInteger(raw.maxFixRetries) && raw.maxFixRetries >= 1 && raw.maxFixRetries <= 10
      ? raw.maxFixRetries
      : DEFAULT_SETTINGS.maxFixRetries,
  };
}

function isValidModel(value: unknown): value is { provider: string; modelId: string } {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).provider === "string" && typeof (value as Record<string, unknown>).modelId === "string" && (value as Record<string, unknown>).provider !== "" && (value as Record<string, unknown>).modelId !== "";
}

function isValidEffort(value: unknown): value is ReviewFixerSettings["reasoningEffort"] {
  return typeof value === "string" && ["off", "minimal", "low", "medium", "high", "xhigh"].includes(value);
}
