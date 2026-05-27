import { describe, it, expect, vi, beforeEach } from "vitest";
import { clearPromptProvidersForTests, collectPromptFragments } from "../../core/prompt-core/index.js";

vi.mock("@earendil-works/pi-coding-agent", () => ({}));
vi.mock("@earendil-works/pi-tui", () => ({ Key: { super: (k: string) => `super+${k}` } }));

function createMockApi() {
	const hooks: Record<string, Function> = {};
	const commands: Record<string, { handler: Function }> = {};
	const tools: Record<string, any> = {};
	let flags: Record<string, unknown> = {};
	let activeTools = ["read", "bash", "edit", "write"];
	const emitted: Array<{ event: string; data: unknown }> = [];
	return {
		registerFlag: vi.fn(),
		registerTool: vi.fn((tool: any) => { tools[tool.name] = tool; }),
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
		get _tools() { return tools; },
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

	it("provides plan, main, and read-only prompt fragments", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		await mock._commands["plan"].handler("", createMockCtx());
		let fragments = await collectPromptFragments({ cwd: "/tmp/project" });
		expect(fragments.some((f) => f.id === "plan-mode:mode-policy" && f.content.includes("grill-with-docs"))).toBe(true);
		expect(fragments.some((f) => f.id === "plan-mode:mode-policy" && f.content.includes("proceed_to_main"))).toBe(true);
		expect(fragments.some((f) => f.id === "plan-mode:mode-policy" && f.content.includes("Do not implement while Plan mode is still active"))).toBe(true);
		expect(fragments.some((f) => f.id === "plan-mode:mode-policy" && f.content.includes("Ask the user whether they want to proceed with implementation"))).toBe(true);

		await mock._commands["plan"].handler("", createMockCtx());
		fragments = await collectPromptFragments({ cwd: "/tmp/project" });
		expect(fragments.some((f) => f.id === "plan-mode:main-mode-implementation" && f.content.includes("Main mode is the primary implementation mode"))).toBe(true);
		expect(fragments.some((f) => f.id === "plan-mode:main-mode-implementation" && f.content.includes("return_to_plan"))).toBe(true);
		expect(fragments.some((f) => f.id === "plan-mode:main-mode-implementation" && f.content.includes("continue directly with TDD"))).toBe(true);
		expect(mock.sendUserMessage).not.toHaveBeenCalled();

		await mock._commands["read-only"].handler("", createMockCtx());
		fragments = await collectPromptFragments({ cwd: "/tmp/project" });
		expect(fragments.some((f) => f.id === "plan-mode:read-only-policy" && f.content.includes("Read-only mode"))).toBe(true);
	});

	it("does not auto-exit or auto-start implementation from plan output", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		await mock._commands["plan"].handler("", createMockCtx());

		const fragments = await collectPromptFragments({ cwd: "/tmp/project" });
		expect(fragments.some((f) => f.id === "plan-mode:mode-policy")).toBe(true);
		expect(mock.sendUserMessage).not.toHaveBeenCalled();
	});

	it("proceed_to_main transitions from plan to main", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		const result = await mock._tools.proceed_to_main.execute("t1", {
			reason: "User approved implementation in natural language.",
			implementationIntent: "Implement the completed plan.",
			suggestedSkill: "tdd",
		}, undefined, undefined, createMockCtx());

		expect(result.details).toMatchObject({ ok: true, from: "plan", to: "main", suggestedSkill: "tdd" });
		const fragments = await collectPromptFragments({ cwd: "/tmp/project" });
		expect(fragments.some((f) => f.id === "plan-mode:main-mode-implementation")).toBe(true);
		expect(fragments.some((f) => f.id === "plan-mode:mode-policy")).toBe(false);
		expect(mock.appendEntry).toHaveBeenCalledWith("plan-mode-transition", expect.objectContaining({ tool: "proceed_to_main", from: "plan", to: "main" }));
	});

	it("return_to_plan transitions from main to plan", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const result = await mock._tools.return_to_plan.execute("t1", {
			reason: "Implementation revealed an architecture risk.",
			planningNeed: "architecture_risk",
			suggestedSkill: "improve-codebase-architecture",
			summary: "Current seam is not testable.",
		}, undefined, undefined, createMockCtx());

		expect(result.details).toMatchObject({ ok: true, from: "main", to: "plan", planningNeed: "architecture_risk", suggestedSkill: "improve-codebase-architecture" });
		const fragments = await collectPromptFragments({ cwd: "/tmp/project" });
		expect(fragments.some((f) => f.id === "plan-mode:mode-policy")).toBe(true);
		expect(fragments.some((f) => f.id === "plan-mode:main-mode-implementation")).toBe(false);
		expect(mock.appendEntry).toHaveBeenCalledWith("plan-mode-transition", expect.objectContaining({ tool: "return_to_plan", from: "main", to: "plan" }));
	});

	it("guards mode transition tools in the wrong mode", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const proceed = await mock._tools.proceed_to_main.execute("t1", { reason: "x", implementationIntent: "y" }, undefined, undefined, createMockCtx());
		expect(proceed.details).toMatchObject({ ok: false, error: "not_in_plan_mode", mode: "main" });

		await mock._commands["plan"].handler("", createMockCtx());
		const ret = await mock._tools.return_to_plan.execute("t2", { reason: "x", planningNeed: "spec_gap", suggestedSkill: "to-prd" }, undefined, undefined, createMockCtx());
		expect(ret.details).toMatchObject({ ok: false, error: "not_in_main_mode", mode: "plan" });
	});
});
