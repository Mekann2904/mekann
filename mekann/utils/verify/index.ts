import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type PackageJson = { scripts?: Record<string, string> };
type VerifySelection = { selected: string[]; missing: string[] };
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

export function selectVerifyScripts(scripts: Record<string, string>, mode: string): VerifySelection {
	if (mode === "full") {
		const requested = ["typecheck:prod", "typecheck", "test"];
		return { selected: requested.filter((name) => scripts[name]), missing: [] };
	}
	if (mode && mode !== "quick") {
		const requested = mode.split(/\s+/).filter(Boolean);
		return { selected: requested.filter((name) => scripts[name]), missing: requested.filter((name) => !scripts[name]) };
	}
	const quick = ["typecheck:prod", "typecheck", "test"].find((name) => scripts[name]);
	return { selected: quick ? [quick] : [], missing: [] };
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
		const selection = selectVerifyScripts(scripts, mode);
		if (selection.selected.length === 0) {
			const missing = selection.missing.length > 0 ? ` Missing scripts: ${selection.missing.join(", ")}.` : "";
			ctx.ui.notify(`No matching verification scripts for mode: ${mode}.${missing}`, "warning");
			return;
		}

		ctx.ui.notify(`Running verification: ${selection.selected.map((s) => `npm run ${s}`).join(", ")}`, "info");
		const results: VerifyResult[] = [];
		for (const script of selection.selected) results.push(await runScript(ctx.cwd, script));
		const missing = selection.missing.length > 0 ? `\nMISSING: ${selection.missing.join(", ")}` : "";
		ctx.ui.notify(`Verification report:\n${formatReport(results)}${missing}`, results.every((r) => r.ok) && selection.missing.length === 0 ? "info" : "error");
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
