import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const MEKANN = path.join(ROOT, "mekann");

const EXPECTED_TOOLS_BY_MODULE: Record<string, string[]> = {
	"safety/sandbox/index.ts": ["request_elevation"],
	"autonomy/goal/index.ts": ["get_goal", "create_goal", "update_goal"],
	"autonomy/subagent/index.ts": [
		"spawn_agent", "send_message", "followup_task", "wait_agent", "list_agents",
		"list_agent_results", "show_agent_result", "apply_agent_results", "reject_agent_result",
		"retry_agent_result", "close_agent",
	],
	"autonomy/autoresearch/index.ts": [
		"autoresearch_evaluate_query", "autoresearch_init", "autoresearch_run", "autoresearch_log",
		"autoresearch_plan", "autoresearch_approve", "autoresearch_candidate_escrow",
		"autoresearch_list_candidates", "autoresearch_show_candidate", "autoresearch_reject_candidate",
		"autoresearch_apply_candidate", "autoresearch_suggest_subagents",
		"autoresearch_apply_candidate_isolated", "autoresearch_run_contract",
	],
};

const EXPECTED_COMMANDS_BY_MODULE: Record<string, string[]> = {
	"safety/plan-mode/index.ts": ["plan"],
	"safety/sandbox/index.ts": ["sandbox"],
	"autonomy/goal/index.ts": ["goal"],
	"autonomy/subagent/index.ts": ["agents", "wait-agent", "focus-agent", "close-agent"],
	"autonomy/autoresearch/index.ts": ["autoresearch"],
	"utils/zip-repo/index.ts": ["zip"],
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

describe("mekann integrated extension", () => {
	it("root package exposes only the integrated mekann extension", () => {
		const pkg = JSON.parse(read("package.json"));
		expect(pkg.pi.extensions).toEqual(["./mekann"]);
		expect(pkg.pi.skills).toContain("./mekann/skills");
	});

	it("has suite entrypoints", () => {
		for (const rel of ["index.ts", "core/index.ts", "safety/index.ts", "autonomy/index.ts", "utils/index.ts"]) {
			expect(fs.existsSync(path.join(MEKANN, rel))).toBe(true);
		}
	});

	it("loads suites in the intended top-level order", () => {
		const source = read("mekann/index.ts");
		const calls = [...source.matchAll(/await (core|safety|autonomy|utils)\(pi\);/g)].map((m) => m[1]);
		expect(calls).toEqual(["core", "safety", "autonomy", "utils"]);
	});

	it("loads sandbox before plan-mode inside safety", () => {
		const source = read("mekann/safety/index.ts");
		expect(source.indexOf("sandbox(pi);")).toBeLessThan(source.indexOf("planMode(pi);"));
	});

	it("keeps autonomy modules in goal, subagent, autoresearch order", () => {
		const source = read("mekann/autonomy/index.ts");
		const calls = [...source.matchAll(/await (goal|subagent|autoresearch)\(pi\);/g)].map((m) => m[1]);
		expect(calls).toEqual(["goal", "subagent", "autoresearch"]);
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

	it("uses policy-core constants for plan-mode coordination outside tests", () => {
		const goal = read("mekann/autonomy/goal/index.ts");
		expect(goal).toContain("PLAN_MODE_STATUS_EVENT");
		expect(goal).not.toContain("pi.events.on(\"mekann:plan-mode:status\"");
	});
});
