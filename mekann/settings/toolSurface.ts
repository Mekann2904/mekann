import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type ToolSurfaceAPI = {
	getActiveTools?: () => string[];
	setActiveTools?: (toolNames: string[]) => void;
};

export type ToolSurfaceProjectionRecord = {
	feature: string;
	toolNames: string[];
	projectedActive: boolean;
	at: number;
};

export type ToolSurfaceShadowSnapshot = {
	mode: "shadow";
	optimizationAvailable: boolean;
	ownedTools: string[];
	projectedInactiveTools: string[];
	prospectiveSchemaBytes: number;
	missedToolCalls: Record<string, number>;
	diagnostics: string[];
	projections: ToolSurfaceProjectionRecord[];
};

type ShadowState = {
	ownedTools: Set<string>;
	projectedActive: Map<string, boolean>;
	missedToolCalls: Map<string, number>;
	diagnostics: string[];
	projections: ToolSurfaceProjectionRecord[];
	forceAll: boolean;
	activeToolsBeforeForceAll?: string[];
	latestRequestId?: string;
};

/** Mekann-owned tools; Pi and third-party tools are intentionally excluded. */
export const MEKANN_TOOL_INVENTORY = {
	goal: ["get_goal", "create_goal", "update_goal"],
	subagent: ["delegate_agent", "spawn_agent", "message_agent", "wait_agent", "list_agents", "agent_results", "close_agent"],
	autoresearch: ["autoresearch_evaluate_query", "autoresearch_init", "autoresearch_run", "autoresearch_log", "autoresearch_plan", "autoresearch_approve", "autoresearch_candidate_escrow", "autoresearch_list_candidates", "autoresearch_show_candidate", "autoresearch_reject_candidate", "autoresearch_apply_candidate", "autoresearch_suggest_subagents", "autoresearch_apply_candidate_isolated", "autoresearch_run_contract"],
	"output-gate": ["search_tool_outputs"],
	"context-ledger": ["search_context_events", "summarize_session_context"],
	sandbox: ["request_elevation"],
	"review-fixer": ["review_fixer"],
	"issue-workflow": ["issue_workflow"],
	"codex-web-search": ["codex_web_search"],
} as const;

const shadowByApi = new WeakMap<object, ShadowState>();
const schemaBytesByTool = new Map<string, number>();

function shadowState(pi: object): ShadowState {
	let state = shadowByApi.get(pi);
	if (!state) {
		state = {
			ownedTools: new Set(),
			projectedActive: new Map(),
			missedToolCalls: new Map(),
			diagnostics: [],
			projections: [],
			forceAll: false,
		};
		shadowByApi.set(pi, state);
	}
	return state;
}

export function registerMekannToolInventory(pi: ToolSurfaceAPI): void {
	const state = shadowState(pi as object);
	for (const [feature, names] of Object.entries(MEKANN_TOOL_INVENTORY)) {
		for (const name of names) {
			state.ownedTools.add(name);
			if (!state.projectedActive.has(name)) state.projectedActive.set(name, true);
		}
		state.projections.push({ feature, toolNames: [...names], projectedActive: true, at: Date.now() });
	}
}

/** Record schema size for later shadow-mode savings calculation. */
export function recordToolSurfaceSchemaBytes(name: string, schemaBytes: number): void {
	if (!Number.isFinite(schemaBytes) || schemaBytes < 0) return;
	schemaBytesByTool.set(name, schemaBytes);
}

/**
 * Record the Feature-state projection without changing the existing tool surface.
 * Existing feature-local enforcement remains unchanged during the migration.
 */
export function recordToolSurfaceProjection(
	pi: ToolSurfaceAPI,
	feature: string,
	toolNames: readonly string[],
	projectedActive: boolean,
): void {
	const state = shadowState(pi as object);
	for (const name of toolNames) {
		state.ownedTools.add(name);
		state.projectedActive.set(name, projectedActive);
	}
	state.projections.push({ feature, toolNames: [...toolNames], projectedActive, at: Date.now() });
	if (state.projections.length > 200) state.projections.splice(0, state.projections.length - 200);
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	return `${(bytes / 1024).toFixed(1)} KiB`;
}

function recordDiagnostic(state: ShadowState, message: string): void {
	state.diagnostics.push(message);
	if (state.diagnostics.length > 20) state.diagnostics.shift();
}

const SHADOW_LOG_MAX_BYTES = 5 * 1024 * 1024;
const SHADOW_LOG_MAX_ROWS = 2000;

type ShadowQualification = {
	providerRequests: number;
	correlatedUsage: number;
	manualRestores: number;
	missedToolCalls: number;
	diagnostics: number;
	qualified: boolean;
};

async function readShadowQualification(cwd: string): Promise<ShadowQualification> {
	try {
		const raw = await fs.readFile(path.join(cwd, ".pi", "mekann-tool-surface", "shadow.jsonl"), "utf8");
		const rows = raw.split(/\r?\n/).filter(Boolean).flatMap((line) => { try { return [JSON.parse(line) as any]; } catch { return []; } });
		const requests = rows.filter((row) => row.phase === "provider_request");
		const usageIds = new Set(rows.filter((row) => row.phase === "actual_usage").map((row) => row.requestId));
		const missedToolCalls = rows.reduce((sum, row) => sum + Object.values(row.missedToolCalls ?? {}).reduce((n: number, value) => n + Number(value || 0), 0), 0);
		const diagnostics = rows.reduce((sum, row) => sum + Number(row.diagnostics?.length ?? 0), 0);
		const manualRestores = rows.filter((row) => row.phase === "manual_restore_all").length;
		const correlatedUsage = requests.filter((row) => usageIds.has(row.requestId)).length;
		return { providerRequests: requests.length, correlatedUsage, manualRestores, missedToolCalls, diagnostics, qualified: requests.length >= 10 && correlatedUsage >= Math.min(10, requests.length) && manualRestores === 0 && missedToolCalls === 0 && diagnostics === 0 };
	} catch {
		return { providerRequests: 0, correlatedUsage: 0, manualRestores: 0, missedToolCalls: 0, diagnostics: 0, qualified: false };
	}
}

async function appendShadowSnapshot(cwd: string, phase: string, pi: ToolSurfaceAPI, extra: Record<string, unknown> = {}): Promise<void> {
	try {
		const dir = path.join(cwd, ".pi", "mekann-tool-surface");
		await fs.mkdir(dir, { recursive: true });
		const file = path.join(dir, "shadow.jsonl");
		await fs.appendFile(file, `${JSON.stringify({ at: new Date().toISOString(), phase, ...getToolSurfaceShadowSnapshot(pi), ...extra })}\n`, "utf8");
		const stat = await fs.stat(file);
		if (stat.size > SHADOW_LOG_MAX_BYTES) {
			const rows = (await fs.readFile(file, "utf8")).split(/\r?\n/).filter(Boolean);
			if (rows.length > SHADOW_LOG_MAX_ROWS) await fs.writeFile(file, `${rows.slice(-SHADOW_LOG_MAX_ROWS).join("\n")}\n`, "utf8");
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		shadowState(pi as object).diagnostics.push(`Shadow telemetry persistence failed: ${message}`);
	}
}

/** Observe tool use that shadow projection would have hidden. */
export function observeToolSurfaceShadow(pi: ExtensionAPI): void {
	registerMekannToolInventory(pi);
	if (typeof pi.on === "function") {
		pi.on("tool_call", (event) => {
			const name = event?.toolName;
			if (!name) return;
			const state = shadowState(pi as object);
			if (state.projectedActive.get(name) === false) {
				state.missedToolCalls.set(name, (state.missedToolCalls.get(name) ?? 0) + 1);
			}
		});
		pi.on("before_provider_request", async (event, ctx) => {
			const state = shadowState(pi as object);
			const requestId = String((event as any)?.requestId ?? (event as any)?.id ?? `ts-${Date.now()}`);
			state.latestRequestId = requestId;
			await appendShadowSnapshot(ctx.cwd, "provider_request", pi, { requestId });
		});
		pi.on("message_end", async (event, ctx) => {
			const message = (event as any)?.message;
			if (message?.role !== "assistant" || !message?.usage) return;
			const state = shadowState(pi as object);
			const requestId = String((event as any)?.requestId ?? message.requestId ?? state.latestRequestId ?? `ts-${Date.now()}`);
			await appendShadowSnapshot(ctx.cwd, "actual_usage", pi, { requestId, usage: message.usage, messageId: message.id, timestamp: message.timestamp });
		});
	}
	if (typeof pi.registerCommand !== "function") return;
	pi.registerCommand("tool-surface", {
		description: "Show Mekann tool surface shadow-mode status",
		async handler(args, ctx) {
				const action = (args ?? "status").trim() || "status";
				const state = shadowState(pi as object);
				if (action === "all") {
					if (typeof pi.getActiveTools !== "function" || typeof pi.setActiveTools !== "function") {
						recordDiagnostic(state, "Restore-all unavailable: host tool-surface hooks are incomplete");
					} else {
						try {
							const current = pi.getActiveTools();
							pi.setActiveTools([...new Set([...current, ...state.ownedTools])]);
							state.activeToolsBeforeForceAll = current;
							state.forceAll = true;
							await appendShadowSnapshot(ctx.cwd, "manual_restore_all", pi);
						} catch (error) {
							recordDiagnostic(state, `Restore-all failed open: ${error instanceof Error ? error.message : String(error)}`);
						}
					}
				} else if (action === "shadow") {
					state.forceAll = false;
					if (state.activeToolsBeforeForceAll && typeof pi.setActiveTools === "function") {
						try {
							pi.setActiveTools(state.activeToolsBeforeForceAll);
							state.activeToolsBeforeForceAll = undefined;
						} catch (error) {
							recordDiagnostic(state, `Restore-shadow failed open: ${error instanceof Error ? error.message : String(error)}`);
						}
					}
				} else if (action === "report") {
					const report = await readShadowQualification(ctx.cwd);
					ctx.ui.notify([
						`Tool surface qualification: ${report.qualified ? "PASS" : "COLLECTING"}`,
						`Provider requests: ${report.providerRequests}`,
						`Correlated usage: ${report.correlatedUsage}`,
						`Manual restores: ${report.manualRestores}`,
						`Missed-tool evidence: ${report.missedToolCalls}`,
						`Diagnostics: ${report.diagnostics}`,
					].join("\n"), report.qualified ? "info" : "warning");
					return;
				} else if (action !== "status") {
					ctx.ui.notify("Usage: /tool-surface [status|report|all|shadow]", "warning");
					return;
				}
				const snapshot = getToolSurfaceShadowSnapshot(pi);
				const missed = Object.entries(snapshot.missedToolCalls).reduce((sum, [, count]) => sum + count, 0);
				ctx.ui.notify([
					`Mekann tool surface: ${state.forceAll ? "all (session override)" : "shadow"}`,
					`Host optimization: ${snapshot.optimizationAvailable ? "available" : "unavailable (fail-open)"}`,
					`Owned tools observed: ${snapshot.ownedTools.length}`,
					`Projected inactive: ${snapshot.projectedInactiveTools.length}`,
					`Prospective schema savings: ${formatBytes(snapshot.prospectiveSchemaBytes)}`,
					`Missed-tool evidence: ${missed}`,
					`Diagnostics: ${snapshot.diagnostics.length}`,
				].join("\n"), snapshot.diagnostics.length > 0 ? "warning" : "info");
		},
	});
}

export function getToolSurfaceShadowSnapshot(pi: ToolSurfaceAPI): ToolSurfaceShadowSnapshot {
	const state = shadowState(pi as object);
	const projectedInactiveTools = [...state.ownedTools].filter((name) => state.projectedActive.get(name) === false).sort();
	return {
		mode: "shadow",
		optimizationAvailable: typeof pi.getActiveTools === "function" && typeof pi.setActiveTools === "function",
		ownedTools: [...state.ownedTools].sort(),
		projectedInactiveTools,
		prospectiveSchemaBytes: projectedInactiveTools.reduce((sum, name) => sum + (schemaBytesByTool.get(name) ?? 0), 0),
		missedToolCalls: Object.fromEntries([...state.missedToolCalls.entries()].sort(([a], [b]) => a.localeCompare(b))),
		diagnostics: [...state.diagnostics],
		projections: [...state.projections],
	};
}

/**
 * Preserve the existing active-tool behavior while failing open on host errors.
 * New projection policy must be recorded separately through
 * {@link recordToolSurfaceProjection} during shadow rollout.
 */
export function setToolsActive(pi: ToolSurfaceAPI, toolNames: readonly string[], active: boolean): void {
	if (typeof pi.getActiveTools !== "function" || typeof pi.setActiveTools !== "function") return;
	if (shadowState(pi as object).forceAll) return;
	try {
		const wanted = new Set(toolNames);
		const current = pi.getActiveTools();
		const currentSet = new Set(current);
		const next = active
			? [...current, ...toolNames.filter((name) => !currentSet.has(name))]
			: current.filter((name) => !wanted.has(name));
		if (next.length === current.length && next.every((name, index) => name === current[index])) return;
		pi.setActiveTools(next);
	} catch (error) {
		const state = shadowState(pi as object);
		const message = error instanceof Error ? error.message : String(error);
		recordDiagnostic(state, `Tool surface optimization failed open: ${message}`);
	}
}
