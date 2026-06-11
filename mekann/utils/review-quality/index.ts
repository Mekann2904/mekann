import { execFile } from "node:child_process";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type DiffStats = { files: number; added: number; deleted: number; total: number; signature: string };

const LARGE_CHANGE_LINES = 500;
const LARGE_CHANGE_FILES = 8;

function execGit(args: string[], cwd: string): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile("git", args, { cwd, timeout: 10_000 }, (error, stdout, stderr) => {
			if (error) reject(new Error(String(stderr || error.message)));
			else resolve(String(stdout));
		});
	});
}

export function parseNumstat(output: string): DiffStats {
	let files = 0;
	let added = 0;
	let deleted = 0;
	const signatureParts: string[] = [];
	for (const line of output.split(/\r?\n/)) {
		if (!line.trim()) continue;
		const [a, d, file] = line.split("\t");
		files++;
		const add = Number(a);
		const del = Number(d);
		if (Number.isFinite(add)) added += add;
		if (Number.isFinite(del)) deleted += del;
		signatureParts.push(`${a}:${d}:${file ?? ""}`);
	}
	return { files, added, deleted, total: added + deleted, signature: signatureParts.join("|") };
}

function shouldSuggest(stats: DiffStats): boolean {
	return stats.total >= LARGE_CHANGE_LINES || stats.files >= LARGE_CHANGE_FILES;
}

function formatSuggestion(stats: DiffStats): string {
	return `Large change detected (${stats.files} files, +${stats.added}/-${stats.deleted}). Consider running /skill:thermo-nuclear-code-quality-review or /review-quality for a maintainability pass.`;
}

async function collectStats(ctx: ExtensionContext): Promise<DiffStats> {
	const output = await execGit(["diff", "--numstat", "HEAD"], ctx.cwd);
	return parseNumstat(output);
}

async function handleReviewQuality(ctx: ExtensionContext): Promise<void> {
	try {
		const stats = await collectStats(ctx);
		if (stats.files === 0) { ctx.ui.notify("No diff to review.", "info"); return; }
		ctx.ui.notify(formatSuggestion(stats), shouldSuggest(stats) ? "warning" : "info");
	} catch (error) {
		ctx.ui.notify(`Review quality check failed: ${error instanceof Error ? error.message : String(error)}`, "error");
	}
}

export default function reviewQualityExtension(pi: ExtensionAPI): void {
	let lastSuggestedSignature = "";

	pi.registerCommand("review-quality", {
		description: "Inspect diff size and suggest a strict maintainability review when warranted.",
		handler: async (_args, ctx) => handleReviewQuality(ctx),
	});

	pi.on("agent_end", async (_event, ctx) => {
		try {
			const stats = await collectStats(ctx);
			if (!shouldSuggest(stats) || stats.signature === lastSuggestedSignature) return;
			lastSuggestedSignature = stats.signature;
			ctx.ui.notify(formatSuggestion(stats), "warning");
		} catch {
			// Best-effort UX hint only; never fail an agent turn because git diff is unavailable.
		}
	});
}
