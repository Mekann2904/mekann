/**
 * Review fixer settings loader.
 *
 * Reads settings from Mekann settings file via the settings infrastructure.
 */

import { featureRawConfig } from "../../settings/enabled.js";
import type { ReviewFixerSettings } from "./types.js";

const DEFAULT_SETTINGS: ReviewFixerSettings = {
  model: undefined,
  reasoningEffort: "high",
  maxFixRetries: 3,
};

export function loadReviewFixerSettings(): ReviewFixerSettings {
  const raw = featureRawConfig("review-fixer");

  const effort = isValidEffort(raw.reasoningEffort) ? raw.reasoningEffort as ReviewFixerSettings["reasoningEffort"] : DEFAULT_SETTINGS.reasoningEffort;

  return {
    model: isValidModel(raw.model) ? raw.model as { provider: string; modelId: string } : undefined,
    reasoningEffort: effort,
    maxFixRetries: typeof raw.maxFixRetries === "number" && Number.isInteger(raw.maxFixRetries) && raw.maxFixRetries >= 1 && raw.maxFixRetries <= 10
      ? raw.maxFixRetries
      : DEFAULT_SETTINGS.maxFixRetries,
  };
}

function isValidModel(value: unknown): value is { provider: string; modelId: string } {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).provider === "string" && typeof (value as Record<string, unknown>).modelId === "string";
}

function isValidEffort(value: unknown): boolean {
  return typeof value === "string" && ["off", "minimal", "low", "medium", "high", "xhigh"].includes(value);
}
