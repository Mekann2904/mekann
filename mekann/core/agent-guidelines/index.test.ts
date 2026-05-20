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
		expect(listPromptProviders().map((p) => p.id)).toContain("agent-guidelines");
		const [fragment] = await collectPromptFragments({ cwd: "/tmp" });
		expect(fragment).toMatchObject({ source: "agent-guidelines", kind: "coding_guidelines", stability: "stable", scope: "global" });
		expect(fragment.content).toContain("Additional coding-agent guidelines");
	});
});
