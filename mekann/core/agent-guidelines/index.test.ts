import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearPromptProvidersForTests, collectPromptFragments, listPromptProviders } from "../prompt-core/index.js";
vi.mock("@earendil-works/pi-coding-agent", () => ({}));

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
		expect(prWorkflowFragment?.content).toContain("If the PR is not mergeable");
		expect(prWorkflowFragment?.content).toContain("After attempting a fix, re-run the PR merge-state check");
	});
});
