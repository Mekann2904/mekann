import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveContextControlConfig } from "./config.js";
import { MEKANN_CONTEXT_CONTROL_DEFAULTS } from "../../config.js";
import { getGlobalMekannSettingsPath, getWorkspaceMekannSettingsPath, invalidateSettingsCache } from "../../settings/store.js";

async function withTempHome<T>(fn: (home: string, cwd: string) => Promise<T>): Promise<T> {
	const home = await mkdtemp(join(tmpdir(), "mekann-ctxctl-home-"));
	const cwd = await mkdtemp(join(tmpdir(), "mekann-ctxctl-cwd-"));
	try {
		await mkdir(join(home, ".pi", "agent"), { recursive: true });
		await mkdir(join(cwd, ".pi"), { recursive: true });
		return await fn(home, cwd);
	} finally {
		invalidateSettingsCache(getGlobalMekannSettingsPath(home));
		invalidateSettingsCache(getWorkspaceMekannSettingsPath(cwd));
		await rm(home, { recursive: true, force: true });
		await rm(cwd, { recursive: true, force: true });
	}
}

describe("resolveContextControlConfig", () => {
	it("returns the documented defaults when no settings file exists", async () => {
		await withTempHome(async (home, cwd) => {
			const cfg = resolveContextControlConfig(cwd, home);
			expect(cfg.pressureCriticalPct).toBe(MEKANN_CONTEXT_CONTROL_DEFAULTS.pressureCriticalPct);
			expect(cfg.messageSummarizeBytes).toBe(MEKANN_CONTEXT_CONTROL_DEFAULTS.messageSummarizeBytes);
			expect(cfg.penaltyPressureCritical).toBe(MEKANN_CONTEXT_CONTROL_DEFAULTS.penaltyPressureCritical);
			expect(cfg.riskCriticalScore).toBe(MEKANN_CONTEXT_CONTROL_DEFAULTS.riskCriticalScore);
		});
	});

	it("honors a global mekann.json override", async () => {
		await withTempHome(async (home, cwd) => {
			await writeFile(
				getGlobalMekannSettingsPath(home),
				JSON.stringify({ version: 1, features: { "context-control": { pressureCriticalPct: 50, messageSummarizeBytes: 4096 } } }),
			);
			const cfg = resolveContextControlConfig(cwd, home);
			expect(cfg.pressureCriticalPct).toBe(50);
			expect(cfg.messageSummarizeBytes).toBe(4096);
			// Untouched keys keep their defaults.
			expect(cfg.pressureHighPct).toBe(MEKANN_CONTEXT_CONTROL_DEFAULTS.pressureHighPct);
		});
	});

	it("workspace override beats global override", async () => {
		await withTempHome(async (home, cwd) => {
			await writeFile(getGlobalMekannSettingsPath(home), JSON.stringify({ version: 1, features: { "context-control": { pressureCriticalPct: 60 } } }));
			await writeFile(getWorkspaceMekannSettingsPath(cwd), JSON.stringify({ version: 1, features: { "context-control": { pressureCriticalPct: 40 } } }));
			const cfg = resolveContextControlConfig(cwd, home);
			expect(cfg.pressureCriticalPct).toBe(40);
		});
	});

	it("falls back to default for non-numeric override values", async () => {
		await withTempHome(async (home, cwd) => {
			await writeFile(getGlobalMekannSettingsPath(home), JSON.stringify({ version: 1, features: { "context-control": { pressureCriticalPct: "oops" } } }));
			const cfg = resolveContextControlConfig(cwd, home);
			expect(cfg.pressureCriticalPct).toBe(MEKANN_CONTEXT_CONTROL_DEFAULTS.pressureCriticalPct);
		});
	});
});
