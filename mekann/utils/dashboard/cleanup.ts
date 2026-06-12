import { rmSync } from "node:fs";

const cleanupPaths = new Set<string>();
let installed = false;

export function registerCleanupPath(path: string): void {
	cleanupPaths.add(path);
}

export function installDashboardCleanup(): void {
	if (installed) return;
	installed = true;
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
