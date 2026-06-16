/**
 * Resolve the model + thinking for an Issue Work Pi from the `modes` feature's
 * Work Pi profile (`issue`). All Work Pi model config is centralized under
 * Collaboration Modes, so the issue launchers read it here instead of carrying
 * their own model setting.
 */

import { featureConfig } from "../../../settings/featureConfig.js";

export interface IssueWorkPiModel {
	model: { provider: string; modelId: string } | undefined;
	thinking: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined;
}

/**
 * Read `modes.models.issue` / `modes.thinking.issue`. Returns undefined values
 * when unset, so callers fall back to pi's default model/thinking.
 *
 * Reads defensively: malformed shapes resolve to undefined rather than throwing,
 * because a launch should never abort over a bad model preference.
 */
export function resolveIssueWorkPiModel(): IssueWorkPiModel {
	const modes = featureConfig("modes") as {
		models?: Record<string, unknown>;
		thinking?: Record<string, unknown>;
	} | undefined;
	const modelRaw = modes?.models?.issue;
	const thinkingRaw = modes?.thinking?.issue;
	const validThinking = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

	return {
		model: isModelRef(modelRaw) ? modelRaw : undefined,
		thinking: typeof thinkingRaw === "string" && (validThinking as readonly string[]).includes(thinkingRaw)
			? (thinkingRaw as IssueWorkPiModel["thinking"])
			: undefined,
	};
}

function isModelRef(value: unknown): value is { provider: string; modelId: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as Record<string, unknown>).provider === "string" &&
		typeof (value as Record<string, unknown>).modelId === "string" &&
		(value as Record<string, unknown>).provider !== "" &&
		(value as Record<string, unknown>).modelId !== ""
	);
}
