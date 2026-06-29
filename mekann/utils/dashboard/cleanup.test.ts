import { mkdtempSync, writeFileSync, existsSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	cleanupDashboardResourcesSync,
	registerCleanupPath,
	sweepStaleDashboardTempDirs,
} from "./cleanup.js";

describe("dashboard cleanup", () => {
	it("removes registered temporary directories", () => {
		const dir = mkdtempSync(join(tmpdir(), "mekann-dashboard-cleanup-test-"));
		writeFileSync(join(dir, "file.txt"), "x");
		registerCleanupPath(dir);
		cleanupDashboardResourcesSync();
		expect(existsSync(dir)).toBe(false);
	});
});

describe("sweepStaleDashboardTempDirs (issue #165, IC-235)", () => {
	it("removes dashboard tmpdirs older than the TTL", () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), "mekann-sweep-root-"));
		const stale = join(tmpRoot, "mekann-dashboard-avatar-stale");
		mkdirSync(stale);
		writeFileSync(join(stale, "avatar.png"), "x");
		// Make it look 2 days old.
		const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
		utimesSync(stale, twoDaysAgo, twoDaysAgo);

		sweepStaleDashboardTempDirs({ tmpRoot, now: Date.now(), ttlMs: 24 * 60 * 60 * 1000 });

		expect(existsSync(stale)).toBe(false);
	});

	it("keeps recent dashboard tmpdirs (active sibling processes)", () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), "mekann-sweep-root-"));
		const fresh = join(tmpRoot, "mekann-dashboard-graph-fresh");
		mkdirSync(fresh);
		writeFileSync(join(fresh, "contributions.svg"), "x");

		sweepStaleDashboardTempDirs({ tmpRoot, now: Date.now(), ttlMs: 24 * 60 * 60 * 1000 });

		expect(existsSync(fresh)).toBe(true);
	});

	it("ignores non-dashboard tmpdir entries", () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), "mekann-sweep-root-"));
		const unrelated = join(tmpRoot, "other-prefix-old");
		mkdirSync(unrelated);
		const ancient = new Date(0);
		utimesSync(unrelated, ancient, ancient);

		sweepStaleDashboardTempDirs({ tmpRoot, now: Date.now(), ttlMs: 24 * 60 * 60 * 1000 });

		expect(existsSync(unrelated)).toBe(true);
	});

	it("handles missing tmpRoot without throwing", () => {
		expect(() =>
			sweepStaleDashboardTempDirs({ tmpRoot: "/nonexistent-mekann-sweep-root", now: Date.now() }),
		).not.toThrow();
	});
});
