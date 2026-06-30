import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import { parseParams } from "./tool-params.js";

const regressionParams = Type.Object({
	objective: Type.String(),
	token_budget: Type.Optional(Type.Integer()),
});

const regressionTool: ToolDefinition<typeof regressionParams> = {
	name: "type_safety_regression",
	label: "type safety regression",
	description: "Compile-only regression checks for schema/handler param alignment.",
	parameters: regressionParams,
	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		const parsed = parseParams(regressionParams, params);
		parsed.objective.toUpperCase();
		// @ts-expect-error schema/handler mismatch: unknown field must remain a type error.
		parsed.missing_field;
		// @ts-expect-error schema/handler mismatch: optional number is not a string.
		const invalidBudget: string = parsed.token_budget;
		return { content: [{ type: "text", text: "ok" }], details: {} };
	},
};

void regressionTool;
