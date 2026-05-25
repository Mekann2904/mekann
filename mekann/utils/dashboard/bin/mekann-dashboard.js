#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, "../cli.ts");
const result = spawnSync("bun", [cli, ...process.argv.slice(2)], { stdio: "inherit" });
if (result.error) {
	console.error(`[mekann-dashboard] failed to launch Bun/OpenTUI dashboard: ${result.error.message}`);
	console.error("OpenTUI is currently Bun-based. Install Bun or run the dashboard in an environment with bun on PATH.");
	process.exit(1);
}
process.exit(typeof result.status === "number" ? result.status : 1);
