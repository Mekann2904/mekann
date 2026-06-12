import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearPromptProvidersForTests, collectPromptFragments, listPromptProviders } from "../prompt-core/index.js";
vi.mock("@earendil-works/pi-coding-agent", () => ({}));

function countTopLevelBullets(content: string): number {
	return content.split(/\r?\n/).filter((line) => /^-\s+/.test(line)).length;
}

describe("agent-guidelines", () => {
	beforeEach(() => clearPromptProvidersForTests());
	it("registers a stable coding guidelines provider without before_agent_start append", async () => {
		const { default: extension } = await import("./index.js");
		const pi = { on: vi.fn() };
		extension(pi as any);
		expect(pi.on).not.toHaveBeenCalledWith("before_agent_start", expect.anything());
		const providerIds = listPromptProviders().map((p) => p.id);
		expect(providerIds).toContain("agent-guidelines");
		expect(providerIds).toContain("pr-workflow");
		const fragments = await collectPromptFragments({ cwd: "/tmp" });
		const fragment = fragments.find((f) => f.source === "agent-guidelines");
		expect(fragment).toMatchObject({ source: "agent-guidelines", kind: "coding_guidelines", stability: "stable", scope: "global" });
		expect(fragment?.content).toContain("Additional coding-agent guidelines");
		const prWorkflowFragment = fragments.find((f) => f.source === "pr-workflow");
		expect(prWorkflowFragment?.content).toContain("PR workflow routing policy");
		expect(prWorkflowFragment?.content).toContain("/pr-check");
	});

	it("keeps stable global always-on prompt controls within the documented budget", async () => {
		const { default: extension } = await import("./index.js");
		extension({ on: vi.fn() } as any);
		const fragments = await collectPromptFragments({ cwd: "/tmp" });
		const alwaysOnControls = fragments
			.filter((f) => f.stability === "stable" && f.scope === "global")
			.reduce((sum, f) => sum + countTopLevelBullets(f.content), 0);
		expect(alwaysOnControls).toBeLessThanOrEqual(50);
	});
});
