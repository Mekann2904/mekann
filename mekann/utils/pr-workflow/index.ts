import { execFile } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function execFileText(command: string, args: string[], options: { cwd: string }): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(command, args, options, (error, stdout) => {
			if (error) reject(error);
			else resolve(String(stdout));
		});
	});
}
const PR_URL_RE = /https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/g;

type PrStatus = {
	url: string;
	mergeStateStatus?: string | null;
	mergeable?: string | boolean | null;
	baseRefName?: string | null;
	headRefName?: string | null;
};

function formatStatus(status: PrStatus): string {
	const state = status.mergeStateStatus ?? "UNKNOWN";
	const mergeable = status.mergeable ?? "UNKNOWN";
	const refs = status.baseRefName && status.headRefName ? ` (${status.headRefName} → ${status.baseRefName})` : "";
	return `${status.url}${refs}: mergeStateStatus=${state}, mergeable=${mergeable}`;
}

function isBlocked(status: PrStatus): boolean {
	const state = String(status.mergeStateStatus ?? "").toUpperCase();
	return ["BLOCKED", "BEHIND", "CONFLICTING", "DIRTY", "UNKNOWN", "UNSTABLE"].includes(state);
}

async function checkPr(target: string | undefined, cwd: string): Promise<PrStatus> {
	const args = ["pr", "view"];
	if (target?.trim()) args.push(target.trim());
	args.push("--json", "mergeStateStatus,mergeable,url,baseRefName,headRefName");
	const stdout = await execFileText("gh", args, { cwd });
	return JSON.parse(stdout) as PrStatus;
}

function extractPrUrls(messages: unknown): string[] {
	const text = JSON.stringify(messages ?? "");
	return [...new Set(text.match(PR_URL_RE) ?? [])];
}

export default function prWorkflowExtension(pi: ExtensionAPI): void {
	const autoCheckedUrls = new Set<string>();

	pi.registerCommand("pr-check", {
		description: "Check GitHub PR mergeability for the current branch or a PR URL/number",
		handler: async (args, ctx) => {
			try {
				const status = await checkPr(args, ctx.cwd);
				ctx.ui.notify(`PR check: ${formatStatus(status)}`, isBlocked(status) ? "warning" : "info");
			} catch (error) {
				ctx.ui.notify(`PR check failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
		},
	});

	pi.on("agent_end", async (event, ctx) => {
		const urls = extractPrUrls((event as { messages?: unknown }).messages);
		for (const url of urls) {
			if (autoCheckedUrls.has(url)) continue;
			try {
				const status = await checkPr(url, ctx.cwd);
				autoCheckedUrls.add(url);
				ctx.ui.notify(`PR check: ${formatStatus(status)}`, isBlocked(status) ? "warning" : "info");
				if (isBlocked(status)) {
					pi.sendUserMessage(`Mekann PR workflow detected a blocked or inconclusive PR merge state for ${status.url}: ${formatStatus(status)}. Please investigate and perform only safe follow-up work. Do not merge, close, approve, force-push, change the PR base, or run destructive git operations without explicit user permission.`, { deliverAs: "followUp" });
				}
			} catch (error) {
				ctx.ui.notify(`PR check failed for ${url}: ${error instanceof Error ? error.message : String(error)}`, "warning");
			}
		}
	});
}
