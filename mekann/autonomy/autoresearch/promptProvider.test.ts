import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as childProcess from "node:child_process";
import { clearPromptProvidersForTests, collectPromptFragments } from "../../core/prompt-core/index.js";

vi.mock("@earendil-works/pi-coding-agent", () => ({}));
vi.mock("@earendil-works/pi-ai", () => ({ StringEnum: (values: string[]) => values }));
vi.mock("@sinclair/typebox", () => ({
	Type: {
		Object: (props: unknown) => props,
		String: (opts?: unknown) => opts ?? {},
		Number: (opts?: unknown) => opts ?? {},
		Boolean: (opts?: unknown) => opts ?? {},
		Optional: (schema: unknown) => schema,
		Array: (schema: unknown) => schema,
		Literal: (value: unknown) => value,
		Union: (schemas: unknown) => schemas,
		Record: (_key: unknown, value: unknown) => value,
	},
}));
vi.mock("@sinclair/typebox/value", () => ({ Value: { Errors: () => [], Check: () => true } }));

import autoresearchExtension from "./index.js";

function gitInitForTest(cwd: string): void {
	// Test git identity is injected via env vars in vitest.setup.ts (issue #39).
	try {
		childProcess.execFileSync("git", ["init", "-b", "main"], { cwd, stdio: "ignore" });
	} catch {
		childProcess.execFileSync("git", ["init"], { cwd, stdio: "ignore" });
		childProcess.execFileSync("git", ["checkout", "-b", "main"], { cwd, stdio: "ignore" });
	}
}

function createMockPi() {
	const commands: Map<string, { handler: Function; description?: string }> = new Map();
	const eventHandlers: Map<string, Function> = new Map();
	return {
		tools: [] as Array<{ name: string; [k: string]: unknown }>,
		commands,
		eventHandlers,
		sentMessages: [] as Array<{ msg: string; opts: unknown }>,
		registerTool: vi.fn((def: { name: string; [k: string]: unknown }) => { /* not needed */ }),
		registerCommand: vi.fn((name: string, config: { handler: Function; description?: string }) => commands.set(name, config)),
		on: vi.fn((event: string, handler: Function) => eventHandlers.set(event, handler)),
		sendUserMessage: vi.fn(),
		appendEntry: vi.fn(),
		events: { emit: vi.fn(), on: vi.fn() },
	};
}

function createMockCtx(cwd: string) {
	return { cwd, hasUI: true, ui: { notify: vi.fn(), setWidget: vi.fn() } };
}

describe("autoresearch prompt provider", () => {
	let cwd: string;
	let pi: ReturnType<typeof createMockPi>;

	beforeEach(() => {
		clearPromptProvidersForTests();
		cwd = `/tmp/autoresearch-prompt-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		fs.mkdirSync(cwd, { recursive: true });
		gitInitForTest(cwd);
		pi = createMockPi();
		autoresearchExtension(pi as any);
	});

	it("returns inactive guard prompt when inactive", async () => {
		const fragments = await collectPromptFragments({ cwd });
		expect(fragments).toHaveLength(1);
		expect(fragments[0]).toMatchObject({ kind: "autoresearch_policy", stability: "stable", scope: "mode", priority: 400 });
		expect(fragments[0].content).toContain("autoresearch モード(OFF)");
		expect(fragments[0].content).toContain("/autoresearch on");
		expect(fragments[0].content).toContain("通常の依頼として扱う");
		expect(fragments[0].content).toContain("autoresearch_run");
		// Compressed inactive guard (issue #96): safety markers above preserved,
		// but the ~600-char block is cut to a one-liner.
		expect(fragments[0].content.length).toBeLessThan(300);
	});

	it("returns active policy and dynamic context when active", async () => {
		const cmdHandler = pi.commands.get("autoresearch")!.handler;
		await cmdHandler("on", createMockCtx(cwd));
		const fragments = await collectPromptFragments({ cwd, mode: "autoresearch" });
		expect(fragments).toHaveLength(2);
		const policy = fragments.find((f) => f.id === "autoresearch:policy")!;
		const activeContext = fragments.find((f) => f.id === "autoresearch:active-context")!;
		expect(policy.kind).toBe("autoresearch_policy");
		expect(policy).toMatchObject({ stability: "stable", scope: "mode", priority: 400, cacheIntent: "prefer_cache" });
		expect(policy.content).toContain("autoresearch モード(アクティブ)");
		expect(policy.content).not.toContain("### autoresearch 現在状態");
		expect(activeContext).toMatchObject({ kind: "autoresearch_state", stability: "dynamic", scope: "turn", priority: 750, cacheIntent: "avoid_cache" });
		expect(activeContext.content).toContain("### autoresearch 現在状態");
	});

	it("switches to inactive prompt after off", async () => {
		const cmdHandler = pi.commands.get("autoresearch")!.handler;
		await cmdHandler("on", createMockCtx(cwd));
		await cmdHandler("off", createMockCtx(cwd));
		const fragments = await collectPromptFragments({ cwd });
		expect(fragments).toHaveLength(1);
		expect(fragments[0].content).toContain("autoresearch モード(OFF)");
	});
});
