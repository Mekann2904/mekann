import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDashboardConfig } from "./config.js";
import { MEKANN_DASHBOARD_DEFAULTS } from "../../config.js";
import { getGlobalMekannSettingsPath, getWorkspaceMekannSettingsPath, invalidateSettingsCache } from "../../settings/store.js";

async function withTempHome<T>(fn: (home: string, cwd: string) => Promise<T>): Promise<T> {
	const home = await mkdtemp(join(tmpdir(), "mekann-dash-home-"));
	const cwd = await mkdtemp(join(tmpdir(), "mekann-dash-cwd-"));
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

describe("resolveDashboardConfig (issue #166)", () => {
	it("returns the documented defaults when no settings file exists", async () => {
		await withTempHome(async (home, cwd) => {
			const cfg = resolveDashboardConfig(cwd, home);
			expect(cfg.kittyChunkChars).toBe(MEKANN_DASHBOARD_DEFAULTS.kittyChunkChars);
			expect(cfg.widthMin).toBe(MEKANN_DASHBOARD_DEFAULTS.widthMin);
			expect(cfg.widthMax).toBe(MEKANN_DASHBOARD_DEFAULTS.widthMax);
			expect(cfg.levelColorFourth).toBe(MEKANN_DASHBOARD_DEFAULTS.levelColorFourth);
		});
	});

	it("honors a global mekann.json override", async () => {
		await withTempHome(async (home, cwd) => {
			await writeFile(
				getGlobalMekannSettingsPath(home),
				JSON.stringify({ version: 1, features: { dashboard: { kittyChunkChars: 8192, widthMax: 200, levelColorFourth: "#abcdef" } } }),
			);
			const cfg = resolveDashboardConfig(cwd, home);
			expect(cfg.kittyChunkChars).toBe(8192);
			expect(cfg.widthMax).toBe(200);
			expect(cfg.levelColorFourth).toBe("#abcdef");
			// Untouched keys keep their defaults.
			expect(cfg.widthMin).toBe(MEKANN_DASHBOARD_DEFAULTS.widthMin);
		});
	});
});
