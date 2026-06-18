import { execFile } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import voiceNotifyExtension from "./index.js";
import { clearPromptProvidersForTests, collectPromptFragments, listPromptProviders } from "../../core/prompt-core/index.js";

// Controlled mock for node:child_process: capture say() callbacks without firing
// them, so the serial-queue behavior can be asserted deterministically.
const sayCalls: string[][] = [];
const pendingSayCb: Array<(err: Error | null) => void> = [];

vi.mock("node:child_process", () => ({
	execFile: vi.fn((cmd: string, args: string[], cb: (err: Error | null) => void) => {
		sayCalls.push([cmd, ...args]);
		pendingSayCb.push(cb);
		return { unref: () => {} };
	}),
}));

function mockPi() {
	const hooks = new Map<string, Function>();
	return {
		hooks,
		on: vi.fn((event: string, handler: Function) => hooks.set(event, handler)),
	};
}

function assistantMessage(text: string) {
	return { role: "assistant", content: [{ type: "text", text }] };
}

beforeEach(() => {
	sayCalls.length = 0;
	pendingSayCb.length = 0;
	vi.mocked(execFile).mockClear();
});

afterEach(() => {
	clearPromptProvidersForTests();
	delete process.env.VOICE_NOTIFY_ENABLED;
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

	it("registers a message_end hook (not agent_end) for speech playback", () => {
		const pi = mockPi();
		voiceNotifyExtension(pi as any);

		expect(pi.on).toHaveBeenCalledWith("message_end", expect.any(Function));
		expect(pi.on).not.toHaveBeenCalledWith("agent_end", expect.any(Function));
	});

	it("speaks each assistant <voice> on message_end, queued serially so nothing overlaps", async () => {
		const pi = mockPi();
		voiceNotifyExtension(pi as any);
		const handler = pi.hooks.get("message_end") as Function;

		// First completed message speaks immediately.
		await handler({ message: assistantMessage("<voice>one</voice>") });
		expect(sayCalls).toEqual([["say", "one"]]);

		// A second message arrives while the first is still speaking: it must be
		// queued, not played concurrently.
		await handler({ message: assistantMessage("<voice>two</voice>") });
		expect(sayCalls).toEqual([["say", "one"]]);

		// First utterance finishes -> drain the queue, second starts.
		pendingSayCb[0](null);
		expect(sayCalls).toEqual([["say", "one"], ["say", "two"]]);

		// Second finishes -> queue drained, no further speech.
		pendingSayCb[1](null);
		expect(sayCalls).toEqual([["say", "one"], ["say", "two"]]);
	});

	it("concatenates multiple <voice> blocks within a single message", async () => {
		const pi = mockPi();
		voiceNotifyExtension(pi as any);
		const handler = pi.hooks.get("message_end") as Function;

		await handler({ message: assistantMessage("<voice>one</voice> text <voice>two</voice>") });
		expect(sayCalls).toEqual([["say", "one。two"]]);
	});

	it("ignores non-assistant messages and the disabled flag", async () => {
		const pi = mockPi();
		voiceNotifyExtension(pi as any);
		const handler = pi.hooks.get("message_end") as Function;

		await handler({ message: { role: "user", content: [{ type: "text", text: "<voice>nope</voice>" }] } });
		expect(sayCalls).toEqual([]);

		process.env.VOICE_NOTIFY_ENABLED = "false";
		await handler({ message: assistantMessage("<voice>still no</voice>") });
		expect(sayCalls).toEqual([]);
	});
});
