import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const MEKANN = path.join(ROOT, "mekann");

const EXPECTED_TOOLS_BY_MODULE: Record<string, string[]> = {
	"safety/sandbox/index.ts": ["request_elevation"],
	"context/output-gate/index.ts": ["search_tool_outputs"],
	"autonomy/goal/index.ts": ["get_goal", "create_goal", "update_goal"],
	"autonomy/subagent/index.ts": [
		"delegate_agent", "spawn_agent", "message_agent", "wait_agent", "list_agents", "agent_results", "close_agent",
	],
	"autonomy/autoresearch/toolsRegistration.ts": [
		"autoresearch_evaluate_query", "autoresearch_init", "autoresearch_run", "autoresearch_log",
		"autoresearch_plan", "autoresearch_approve", "autoresearch_candidate_escrow",
		"autoresearch_list_candidates", "autoresearch_show_candidate", "autoresearch_reject_candidate",
		"autoresearch_apply_candidate", "autoresearch_suggest_subagents",
		"autoresearch_apply_candidate_isolated", "autoresearch_run_contract",
	],
};

const EXPECTED_COMMANDS_BY_MODULE: Record<string, string[]> = {
	"safety/modes/index.ts": ["read-only", "sub"],
	"safety/sandbox/index.ts": ["sandbox"],
	"autonomy/goal/command.ts": ["goal"],
	"autonomy/subagent/index.ts": ["agents", "wait-agent", "focus-agent", "close-agent"],
	"autonomy/autoresearch/commands.ts": ["autoresearch"],
	"utils/zip-repo/index.ts": ["zip"],
	"utils/codex-limits/index.ts": ["codex-status"],
	"context/output-gate/index.ts": ["output-gate"],
};

const EXPECTED_PROMPT_PROVIDERS_BY_MODULE: Record<string, string[]> = {
	"core/agent-guidelines/index.ts": ["agent-guidelines"],
	"safety/sandbox/index.ts": ["sandbox"],
	"safety/modes/index.ts": ["modes"],
	"autonomy/goal/index.ts": ["goal"],
	"autonomy/subagent/promptProvider.ts": ["subagent"],
	"autonomy/autoresearch/promptProvider.ts": ["autoresearch"],
};

function read(rel: string): string {
	return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function registeredNames(source: string, api: "registerTool" | "registerCommand"): string[] {
	const pattern = api === "registerTool"
		? /registerTool\(\{[\s\S]*?name:\s*["']([^"']+)["']/g
		: /registerCommand\(["']([^"']+)["']/g;
	return [...source.matchAll(pattern)].map((m) => m[1]);
}

function registeredPromptProviderIds(source: string): string[] {
	return [...source.matchAll(/registerPromptProvider\(\{[\s\S]*?id:\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

function sourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.name === "node_modules" || entry.name.endsWith(".test.ts") || entry.name.endsWith(".md")) continue;
		if (entry.isDirectory()) out.push(...sourceFiles(full));
		else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(full);
	}
	return out;
}

describe("mekann integrated extension", () => {
	it("root package exposes only the integrated mekann extension", () => {
		const pkg = JSON.parse(read("package.json"));
		expect(pkg.pi.extensions).toEqual(["./mekann"]);
		expect(pkg.pi.skills).toContain("./mekann/skills");
	});

	it("has suite entrypoints", () => {
		for (const rel of ["index.ts", "core/index.ts", "safety/index.ts", "autonomy/index.ts", "utils/index.ts", "context/index.ts"]) {
			expect(fs.existsSync(path.join(MEKANN, rel))).toBe(true);
		}
	});

	it("loads suites in the intended top-level order after installing context instrumentation", () => {
		const source = read("mekann/index.ts");
		const instrumentationIndex = source.indexOf("observeToolRegistrations(pi)");
		const firstSuiteCallIndex = source.indexOf("await core(pi);");
		expect(instrumentationIndex).toBeGreaterThanOrEqual(0);
		expect(instrumentationIndex).toBeLessThan(firstSuiteCallIndex);
		const calls = [...source.matchAll(/await (core|safety|autonomy|utils|context)\(pi\);/g)].map((m) => m[1]);
		expect(calls).toEqual(["core", "safety", "autonomy", "utils", "context"]);
	});

	it("loads sandbox before modes inside safety", () => {
		const source = read("mekann/safety/index.ts");
		expect(source.indexOf("sandbox(pi);")).toBeLessThan(source.indexOf("modes(pi);"));
	});

	it("keeps autonomy modules in goal, subagent, review-fixer, autoresearch order", () => {
		const source = read("mekann/autonomy/index.ts");
		const calls = [...source.matchAll(/await (goal|subagent|reviewFixer|autoresearch)\(pi\);/g)].map((m) => m[1]);
		expect(calls).toEqual(["goal", "subagent", "reviewFixer", "autoresearch"]);
	});

	it("keeps tool ownership separated across modules", () => {
		const owners = new Map<string, string>();
		for (const [rel, expected] of Object.entries(EXPECTED_TOOLS_BY_MODULE)) {
			const actual = registeredNames(read(`mekann/${rel}`), "registerTool");
			expect(actual).toEqual(expect.arrayContaining(expected));
			for (const name of actual) {
				expect(owners.get(name), `${name} registered by both ${owners.get(name)} and ${rel}`).toBeUndefined();
				owners.set(name, rel);
			}
		}
	});

	it("does not call action methods while goal/autoresearch extensions are loading", async () => {
		const makePi = () => ({
			registerFlag() {},
			getFlag() { return true; },
			appendEntry() {},
			on() {},
			registerCommand() {},
			registerTool() {},
			events: { emit() {} },
			getActiveTools() { throw new Error("action method called during extension loading"); },
			setActiveTools() { throw new Error("action method called during extension loading"); },
		});
		const goal = await import("./autonomy/goal/index.js");
		const autoresearch = await import("./autonomy/autoresearch/index.js");
		const outputGate = await import("./context/output-gate/index.js");
		const contextLedger = await import("./context/ledger/index.js");
		expect(() => goal.default(makePi() as any)).not.toThrow();
		expect(() => autoresearch.default(makePi() as any)).not.toThrow();
		expect(() => outputGate.default(makePi() as any)).not.toThrow();
		expect(() => contextLedger.default(makePi() as any)).not.toThrow();
	});

	it("keeps command ownership separated across modules", () => {
		const owners = new Map<string, string>();
		for (const [rel, expected] of Object.entries(EXPECTED_COMMANDS_BY_MODULE)) {
			const actual = registeredNames(read(`mekann/${rel}`), "registerCommand");
			expect(actual).toEqual(expect.arrayContaining(expected));
			for (const name of actual) {
				expect(owners.get(name), `${name} registered by both ${owners.get(name)} and ${rel}`).toBeUndefined();
				owners.set(name, rel);
			}
		}
	});

	it("uses policy-core constants for modes coordination outside tests", () => {
		const goal = read("mekann/autonomy/goal/index.ts");
		expect(goal).toContain("MODE_STATUS_EVENT");
		expect(goal).not.toContain("pi.events.on(\"mekann:modes:status\"");
	});

	it("keeps prompt-owning modules registered with prompt-core", () => {
		for (const [rel, expected] of Object.entries(EXPECTED_PROMPT_PROVIDERS_BY_MODULE)) {
			const actual = registeredPromptProviderIds(read(`mekann/${rel}`));
			expect(actual).toEqual(expect.arrayContaining(expected));
		}
	});

	it("does not bypass cache-friendly prompt with direct before_agent_start injection", () => {
		const offenders = sourceFiles(MEKANN)
			.map((file) => path.relative(MEKANN, file))
			.filter((rel) => rel !== "core/cache-friendly-prompt/index.ts" && rel !== "core/prompt-core/types.ts" && rel !== "core/model-optimizer/compaction.ts" && rel !== "core/model-optimizer/types.ts" && rel !== "core/model-optimizer/modules.ts" && rel !== "core/model-optimizer/openai/index.ts")
			.filter((rel) => read(`mekann/${rel}`).includes('before_agent_start'));
		expect(offenders).toEqual([]);
	});

	it("requires prompt-like constants and loaded prompt files to go through prompt-core", () => {
		const promptHelperFiles = new Set(["safety/modes/utils.ts"]);
		const offenders = sourceFiles(MEKANN)
			.map((file) => path.relative(MEKANN, file))
			.filter((rel) => rel !== "core/cache-friendly-prompt/index.ts" && rel !== "core/cache-friendly-prompt/report.ts" && !promptHelperFiles.has(rel))
			.filter((rel) => {
				const source = read(`mekann/${rel}`);
				const hasPromptMaterial = /SYSTEM_PROMPT_EXTRA|loadPrompt\(|<proposed_plan>|prompt policy|Prompt fragments/i.test(source);
				return hasPromptMaterial && !source.includes("registerPromptProvider");
			});
		expect(offenders).toEqual([]);
	});
});
