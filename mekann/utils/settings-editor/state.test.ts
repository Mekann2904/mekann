import { describe, expect, it } from "vitest";
import type { EffectiveSetting } from "../../settings/types.js";
import { draftScopeError, initialSettingsEditorState, stageDraft } from "./state.js";

function workspaceOnlySetting(): EffectiveSetting {
	return {
		feature: "pr-workflow",
		key: "autoCheckDetectedPrs",
		schema: {
			key: "autoCheckDetectedPrs",
			type: "boolean",
			defaultValue: false,
			description: "test",
			category: "Automation",
			scopes: ["workspace"],
			restartRequired: false,
			validate: () => [],
		},
		defaultValue: false,
		effectiveValue: false,
		source: "default",
		diagnostics: [],
	};
}

describe("settings editor scope policy", () => {
	it("stages a workspace-only setting in workspace scope even when global is selected", () => {
		const next = stageDraft(initialSettingsEditorState(), workspaceOnlySetting(), "true");
		expect(next.scope).toBe("workspace");
		expect(next.drafts["pr-workflow.autoCheckDetectedPrs"]?.scope).toBe("workspace");
	});

	it("rejects an unsupported global scope at the save boundary", () => {
		expect(draftScopeError(workspaceOnlySetting(), "global")).toBe("pr-workflow.autoCheckDetectedPrs: global scope では設定できません");
		expect(draftScopeError(workspaceOnlySetting(), "workspace")).toBeNull();
	});
});
