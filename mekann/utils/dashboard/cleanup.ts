import { rmSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Common prefix for all dashboard temporary directories (avatar, graph, …). */
const DASHBOARD_TMP_PREFIX = "mekann-dashboard-";

/**
 * TTL: dashboard temp directories older than this are considered stale
 * (left behind by a SIGKILL'd or crashed process) and swept at startup.
 */
const STALE_TMPDIR_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const cleanupPaths = new Set<string>();
let installed = false;

export function registerCleanupPath(path: string): void {
	cleanupPaths.add(path);
}

/**
 * Sweep dashboard temporary directories left behind by previous (crashed or
 * SIGKILL'd) processes. Only directories under tmpdir matching
 * `mekann-dashboard-*` whose mtime is older than `ttlMs` are removed, so an
 * actively-running sibling process never has its working dir pulled out.
 * Best-effort: filesystem errors are swallowed. See issue #165 (IC-235).
 */
export function sweepStaleDashboardTempDirs(options?: {
	ttlMs?: number;
	now?: number;
	tmpRoot?: string;
}): void {
	const ttlMs = options?.ttlMs ?? STALE_TMPDIR_TTL_MS;
	const now = options?.now ?? Date.now();
	const tmpRoot = options?.tmpRoot ?? tmpdir();
	let names: string[];
	try {
		names = readdirSync(tmpRoot);
	} catch {
		return;
	}
	for (const name of names) {
		if (!name.startsWith(DASHBOARD_TMP_PREFIX)) continue;
		const full = join(tmpRoot, name);
		try {
			const st = statSync(full);
			if (!st.isDirectory()) continue;
			if (now - st.mtimeMs < ttlMs) continue;
		} catch {
			continue;
		}
		try {
			rmSync(full, { recursive: true, force: true });
		} catch {
			// Best-effort only.
		}
	}
}

export function installDashboardCleanup(): void {
	if (installed) return;
	installed = true;
	// Reclaim tmpdirs abandoned by prior crashed/SIGKILL'd dashboard processes.
	sweepStaleDashboardTempDirs();
	process.once("exit", cleanupDashboardResourcesSync);
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.once(signal, () => {
			cleanupDashboardResourcesSync();
			process.exit(signal === "SIGINT" ? 130 : 143);
		});
	}
}

export function cleanupDashboardResourcesSync(): void {
	clearDashboardTerminalArtifactsSync();
	for (const path of cleanupPaths) {
		try {
			rmSync(path, { recursive: true, force: true });
		} catch {
			// Best-effort cleanup only.
		}
	}
	cleanupPaths.clear();
}

export function clearDashboardTerminalArtifactsSync(): void {
	clearKittyImages();
	clearTerminalScreen();
}

function clearKittyImages(): void {
	if (process.env.VITEST) return;
	if (!process.env.KITTY_WINDOW_ID && !process.env.TERM?.toLowerCase().includes("kitty")) return;
	try {
		process.stdout.write("\x1b_Ga=d,d=A\x1b\\");
	} catch {
		// Best-effort cleanup only.
	}
}

function clearTerminalScreen(): void {
	if (process.env.VITEST) return;
	try {
		process.stdout.write("\x1b[2J\x1b[H");
	} catch {
		// Best-effort cleanup only.
	}
}
