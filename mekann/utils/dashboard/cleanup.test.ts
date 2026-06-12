import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanupDashboardResourcesSync, registerCleanupPath } from "./cleanup.js";

describe("dashboard cleanup", () => {
	it("removes registered temporary directories", () => {
		const dir = mkdtempSync(join(tmpdir(), "mekann-dashboard-cleanup-test-"));
		writeFileSync(join(dir, "file.txt"), "x");
		registerCleanupPath(dir);
		cleanupDashboardResourcesSync();
		expect(existsSync(dir)).toBe(false);
	});
});
