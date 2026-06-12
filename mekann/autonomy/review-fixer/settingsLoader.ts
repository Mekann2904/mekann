/**
 * Review fixer settings loader.
 *
 * Reads settings from Mekann settings file via the settings infrastructure.
 */

import { featureRawConfig } from "../../settings/enabled.js";
import type { ReviewFixerSettings } from "./types.js";

const DEFAULT_SETTINGS: ReviewFixerSettings = {
  enabled: false,
  model: undefined,
  reasoningEffort: "high",
  maxFixRetries: 3,
};

export function loadReviewFixerSettings(): ReviewFixerSettings {
  const raw = featureRawConfig("review-fixer");

  return {
    enabled: raw.enabled === true,
    model: raw.model && typeof raw.model === "object" ? raw.model as { provider: string; modelId: string } : undefined,
    reasoningEffort: isValidEffort(raw.reasoningEffort) ? raw.reasoningEffort as any : DEFAULT_SETTINGS.reasoningEffort,
    maxFixRetries: typeof raw.maxFixRetries === "number" && Number.isInteger(raw.maxFixRetries) && raw.maxFixRetries >= 1 && raw.maxFixRetries <= 10
      ? raw.maxFixRetries
      : DEFAULT_SETTINGS.maxFixRetries,
  };
}

function isValidEffort(value: unknown): boolean {
  return typeof value === "string" && ["off", "minimal", "low", "medium", "high", "xhigh"].includes(value);
}
