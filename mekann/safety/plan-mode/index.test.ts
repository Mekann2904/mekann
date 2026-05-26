import { describe, it, expect, vi, beforeEach } from "vitest";
import { clearPromptProvidersForTests, collectPromptFragments } from "../../core/prompt-core/index.js";

vi.mock("@earendil-works/pi-coding-agent", () => ({}));
vi.mock("@earendil-works/pi-tui", () => ({ Key: { super: (k: string) => `super+${k}` } }));

function createMockApi() {
	const hooks: Record<string, Function> = {};
	const commands: Record<string, { handler: Function }> = {};
	let flags: Record<string, unknown> = {};
	let activeTools = ["read", "bash", "edit", "write"];
	const emitted: Array<{ event: string; data: unknown }> = [];
	return {
		registerFlag: vi.fn(),
		registerCommand: vi.fn((name: string, config: { handler: Function }) => { commands[name] = config; }),
		registerShortcut: vi.fn(),
		on: vi.fn((event: string, handler: Function) => { hooks[event] = handler; }),
		getActiveTools: () => activeTools,
		setActiveTools: vi.fn((tools: string[]) => { activeTools = tools; }),
		setModel: vi.fn(() => Promise.resolve(true)),
		getThinkingLevel: () => "medium",
		setThinkingLevel: vi.fn(),
		getFlag: (name: string) => flags[name],
		sendUserMessage: vi.fn(),
		appendEntry: vi.fn(),
		events: { emit: vi.fn((event: string, data: unknown) => emitted.push({ event, data })), on: vi.fn((event: string, handler: Function) => { hooks[`event:${event}`] = handler; }) },
		get _hooks() { return hooks; },
		get _commands() { return commands; },
		set _flags(next: Record<string, unknown>) { flags = next; },
		get _activeTools() { return activeTools; },
		get _emitted() { return emitted; },
	};
}

function createMockCtx() {
	return {
		cwd: "/tmp/project",
		model: { provider: "anthropic", id: "sonnet" },
		modelRegistry: { find: (provider: string, modelId: string) => ({ provider, id: modelId }) },
	};
}

async function loadExtension(mock: ReturnType<typeof createMockApi>) {
	clearPromptProvidersForTests();
	const mod = await import("./index.js");
	mod.default(mock as any);
}

beforeEach(() => clearPromptProvidersForTests());

describe("plan-mode extension", () => {
	it("registers plan and read-only commands", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		expect(mock.registerCommand).toHaveBeenCalledWith("plan", expect.any(Object));
		expect(mock.registerCommand).toHaveBeenCalledWith("read-only", expect.any(Object));
	});

	it("plan mode does not block edit/write and does not push a read-only sandbox profile", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		expect(mock._emitted.some((e) => e.event === "mekann:sandbox:push-profile")).toBe(false);
		expect(await mock._hooks.tool_call({ toolName: "edit", input: { path: "a.ts" } })).toBeUndefined();
		expect(await mock._hooks.tool_call({ toolName: "write", input: { path: "a.ts" } })).toBeUndefined();
	});

	it("read-only mode restricts tools and pushes read_only sandbox profile", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["read-only"].handler("", createMockCtx());

		expect(mock._activeTools).toContain("read");
		expect(mock._activeTools).not.toContain("edit");
		expect(mock._emitted).toContainEqual(expect.objectContaining({
			event: "mekann:sandbox:push-profile",
			data: expect.objectContaining({ owner: "read-only-mode", profile: "read_only" }),
		}));

		const editResult = await mock._hooks.tool_call({ toolName: "edit", input: { path: "a.ts" } });
		expect(editResult.block).toBe(true);

		const bashResult = await mock._hooks.tool_call({ toolName: "bash", input: { command: "npm install" } });
		expect(bashResult.block).toBe(true);
		expect(bashResult.reason).toContain("Read-only mode");

		expect(await mock._hooks.tool_call({ toolName: "read", input: { path: "a.ts" } })).toBeUndefined();
	});

	it("provides plan and read-only prompt fragments", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		await mock._commands["plan"].handler("", createMockCtx());
		let fragments = await collectPromptFragments({ cwd: "/tmp/project" });
		expect(fragments.some((f) => f.id === "plan-mode:mode-policy" && f.content.includes("grill-with-docs"))).toBe(true);

		await mock._commands["plan"].handler("", createMockCtx());
		await mock._commands["read-only"].handler("", createMockCtx());
		fragments = await collectPromptFragments({ cwd: "/tmp/project" });
		expect(fragments.some((f) => f.id === "plan-mode:read-only-policy" && f.content.includes("Read-only mode"))).toBe(true);
	});
});
