import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerMekannToolInventory, shadowState, recordDiagnostic, getToolSurfaceShadowSnapshot } from "./toolSurface.js";
import type { ToolSurfaceAPI } from "./toolSurface.js";

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

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	return `${(bytes / 1024).toFixed(1)} KiB`;
}

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
