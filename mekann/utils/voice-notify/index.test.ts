import { afterEach, describe, expect, it, vi } from "vitest";
import voiceNotifyExtension from "./index.js";
import { clearPromptProvidersForTests, collectPromptFragments, listPromptProviders } from "../../core/prompt-core/index.js";

function mockPi() {
	const hooks = new Map<string, Function>();
	return {
		hooks,
		on: vi.fn((event: string, handler: Function) => hooks.set(event, handler)),
	};
}

afterEach(() => {
	clearPromptProvidersForTests();
});

describe("voice-notify", () => {
	it("registers voice instructions through prompt-core, not before_agent_start", async () => {
		const pi = mockPi();
		voiceNotifyExtension(pi as any);

		expect(pi.on).not.toHaveBeenCalledWith("before_agent_start", expect.anything());
		expect(listPromptProviders().map((p) => p.id)).toContain("voice-notify");

		const [fragment] = await collectPromptFragments({ cwd: "/tmp" });
		expect(fragment).toMatchObject({
			id: "voice-notify:system-prompt",
			source: "voice-notify",
			stability: "stable",
			cacheIntent: "prefer_cache",
		});
		expect(fragment.content).toContain("## Voice notification");
		expect(fragment.content).toContain("Use <voice> proactively");
		expect(fragment.content).not.toContain("sparingly");
	});

	it("registers message and agent hooks for speech playback", () => {
		const pi = mockPi();
		voiceNotifyExtension(pi as any);

		expect(pi.on).toHaveBeenCalledWith("message_end", expect.any(Function));
		expect(pi.on).toHaveBeenCalledWith("agent_end", expect.any(Function));
	});
});
