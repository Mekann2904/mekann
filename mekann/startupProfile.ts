import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const profilePath = process.env.MEKANN_STARTUP_PROFILE;

export async function profileStartupStep<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
	if (!profilePath) return await fn();
	const start = performance.now();
	try {
		return await fn();
	} finally {
		const end = performance.now();
		appendFileSync(profilePath, JSON.stringify({
			type: "mekann-startup-step",
			name,
			durationMs: Number((end - start).toFixed(3)),
			pid: process.pid,
			cwd: process.cwd(),
			timestamp: new Date().toISOString(),
		}) + "\n", "utf8");
	}
}
