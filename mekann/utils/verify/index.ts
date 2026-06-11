import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type PackageJson = { scripts?: Record<string, string> };
type VerifyResult = { command: string; ok: boolean; output: string };

const DEFAULT_TIMEOUT_MS = 120_000;

function execFileText(command: string, args: string[], cwd: string): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(command, args, { cwd, timeout: DEFAULT_TIMEOUT_MS }, (error, stdout, stderr) => {
			const output = `${stdout ?? ""}${stderr ?? ""}`.trim();
			if (error) reject(Object.assign(error, { output }));
			else resolve(output);
		});
	});
}

async function readScripts(cwd: string): Promise<Record<string, string>> {
	const raw = await readFile(path.join(cwd, "package.json"), "utf8");
	return (JSON.parse(raw) as PackageJson).scripts ?? {};
}

export function selectVerifyScripts(scripts: Record<string, string>, mode: string): string[] {
	if (mode === "full") return ["typecheck", "test"].filter((name) => scripts[name]);
	if (mode && mode !== "quick") return mode.split(/\s+/).filter((name) => scripts[name]);
	const quick = ["typecheck:prod", "typecheck", "test"].find((name) => scripts[name]);
	return quick ? [quick] : [];
}

async function runScript(cwd: string, script: string): Promise<VerifyResult> {
	const command = `npm run ${script}`;
	try {
		const output = await execFileText("npm", ["run", script], cwd);
		return { command, ok: true, output };
	} catch (error) {
		return { command, ok: false, output: String((error as { output?: string }).output ?? (error instanceof Error ? error.message : error)) };
	}
}

function formatReport(results: VerifyResult[]): string {
	if (results.length === 0) return "No verification scripts found.";
	return results.map((result) => `${result.ok ? "PASS" : "FAIL"}: ${result.command}`).join("\n");
}

async function handleVerify(args: string, ctx: ExtensionContext): Promise<void> {
	const mode = (args ?? "").trim() || "quick";
	try {
		const scripts = await readScripts(ctx.cwd);
		const selected = selectVerifyScripts(scripts, mode);
		if (selected.length === 0) {
			ctx.ui.notify(`No matching verification scripts for mode: ${mode}`, "warning");
			return;
		}

		ctx.ui.notify(`Running verification: ${selected.map((s) => `npm run ${s}`).join(", ")}`, "info");
		const results: VerifyResult[] = [];
		for (const script of selected) results.push(await runScript(ctx.cwd, script));
		ctx.ui.notify(`Verification report:\n${formatReport(results)}`, results.every((r) => r.ok) ? "info" : "error");
	} catch (error) {
		ctx.ui.notify(`Verification failed to start: ${error instanceof Error ? error.message : String(error)}`, "error");
	}
}

export default function verifyExtension(pi: ExtensionAPI): void {
	pi.registerCommand("verify", {
		description: "Run repo-local verification scripts and report what ran.",
		handler: async (args, ctx) => handleVerify(args, ctx),
	});
}
