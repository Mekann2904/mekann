import { describe, it, expect, vi, beforeEach } from "vitest";

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

function createMockPi() {
	const tools: Array<{ name: string; [k: string]: unknown }> = [];
	const commands: Map<string, { handler: Function; description?: string }> = new Map();
	const eventHandlers: Map<string, Function> = new Map();
	return {
		tools,
		commands,
		eventHandlers,
		registerTool: vi.fn((def: { name: string; [k: string]: unknown }) => tools.push(def)),
		registerCommand: vi.fn((name: string, config: { handler: Function; description?: string }) => commands.set(name, config)),
		on: vi.fn((event: string, handler: Function) => eventHandlers.set(event, handler)),
		sendUserMessage: vi.fn(),
		appendEntry: vi.fn(),
		events: { emit: vi.fn(), on: vi.fn() },
	};
}

describe("autoresearch registration", () => {
	let pi: ReturnType<typeof createMockPi>;

	beforeEach(() => {
		pi = createMockPi();
		autoresearchExtension(pi as any);
	});

	it("registers tools with correct names", () => {
		expect(pi.registerTool).toHaveBeenCalledTimes(18);
		expect(pi.tools.map((t) => t.name)).toEqual([
			"autoresearch_evaluate_query",
			"autoresearch_init",
			"autoresearch_run",
			"autoresearch_log",
			"autoresearch_plan",
			"autoresearch_approve",
			"autoresearch_candidate_escrow",
			"autoresearch_list_candidates",
			"autoresearch_show_candidate",
			"autoresearch_reject_candidate",
			"autoresearch_apply_candidate",
			"autoresearch_suggest_subagents",
			"autoresearch_apply_candidate_isolated",
			"autoresearch_scale_next",
			"autoresearch_scale_complete_action",
			"autoresearch_scale_ingest",
			"autoresearch_scale_status",
			"autoresearch_run_contract",
		]);
	});

	it("registers commands", () => {
		expect(pi.registerCommand).toHaveBeenCalledWith("autoresearch", expect.objectContaining({ description: expect.stringContaining("autoresearch") }));
		expect(pi.registerCommand).toHaveBeenCalledWith("autoresearch-scale", expect.objectContaining({ description: expect.stringContaining("test-time scaling") }));
	});

	it("keeps run/log promptGuidelines concise and tool-specific", () => {
		const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
		const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
		const runGuidelines = (runTool.promptGuidelines as string[]).join("\n");
		const logGuidelines = (logTool.promptGuidelines as string[]).join("\n");
		expect(runGuidelines).toContain("timeout_seconds");
		expect(runGuidelines).not.toContain("subagent に実行させない");
		expect(logGuidelines).toContain("runId");
		expect(logGuidelines).not.toContain("subagent に記録");
	});

	it("registers session_start and loop event handlers", () => {
		expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
		expect(pi.on).toHaveBeenCalledWith("agent_start", expect.any(Function));
		expect(pi.on).toHaveBeenCalledWith("agent_end", expect.any(Function));
		expect(pi.on).not.toHaveBeenCalledWith("before_agent_start", expect.any(Function));
	});
});
