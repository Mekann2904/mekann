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

/** Polling config. Defaults are tuned for typical CI runtimes; all overridable via `MEKANN_PR_WORKFLOW_*` env. */
type PollConfig = {
	maxPolls: number;
	initialIntervalMs: number;
	maxIntervalMs: number;
	backoffFactor: number;
};

function readEnvNumber(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined || raw === "") return fallback;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed < 1) return fallback;
	return parsed;
}

function loadPollConfig(): PollConfig {
	return {
		maxPolls: Math.floor(readEnvNumber("MEKANN_PR_WORKFLOW_MAX_POLLS", 20)),
		initialIntervalMs: Math.floor(readEnvNumber("MEKANN_PR_WORKFLOW_INITIAL_INTERVAL_MS", 15_000)),
		maxIntervalMs: Math.floor(readEnvNumber("MEKANN_PR_WORKFLOW_MAX_INTERVAL_MS", 60_000)),
		backoffFactor: readEnvNumber("MEKANN_PR_WORKFLOW_BACKOFF", 1.4),
	};
}

/** A status check rollup entry as returned by `gh pr view --json statusCheckRollup`.
 *  Two shapes occur: `CheckRun` (with `status`/`conclusion`) and `StatusContext` (with `state`). */
type RollupEntry = {
	__typename?: string | null;
	status?: string | null;
	conclusion?: string | null;
	state?: string | null;
};

type PrStatus = {
	url: string;
	mergeStateStatus?: string | null;
	mergeable?: string | boolean | null;
	baseRefName?: string | null;
	headRefName?: string | null;
	statusCheckRollup?: RollupEntry[] | null;
};

/** True when a rollup entry represents an in-flight check (not yet COMPLETED).
 *  Keyed off structural fields rather than `__typename` so both CheckRun and StatusContext shapes narrow cleanly. */
export function isCheckRunning(entry: RollupEntry): boolean {
	if (typeof entry.status === "string") {
		const status = entry.status.toUpperCase();
		return status === "QUEUED" || status === "IN_PROGRESS";
	}
	if (typeof entry.state === "string") {
		const state = entry.state.toUpperCase();
		return state === "PENDING";
	}
	return false;
}

/** Final classification used by both the command and the agent_end poll. */
export type Verdict = "pending" | "clean" | "mergeableUnstable" | "blocked";

/**
 * Classify a PR snapshot.
 *
 * `pending`: checks are still running or GitHub is still computing (UNKNOWN). Do not notify as blocked.
 * `clean`: fully mergeable.
 * `mergeableUnstable`: mergeable but a non-required check failed — still mergeable, so not blocked.
 * `blocked`: truly blocked (conflict/behind/dirty/review gate).
 */
export function classifyStatus(status: PrStatus): Verdict {
	const state = String(status.mergeStateStatus ?? "").toUpperCase();
	const mergeable = normalizeMergeable(status.mergeable);

	const checks = status.statusCheckRollup ?? [];
	const anyRunning = checks.length > 0 && checks.some(isCheckRunning);

	// Still computing or checks in flight: wait before judging.
	if (state === "UNKNOWN" || anyRunning || mergeable === null) {
		return "pending";
	}

	// Hard-blocked merge states, authoritative regardless of the separate mergeable flag.
	if (state === "BLOCKED" || state === "BEHIND" || state === "DIRTY") {
		return "blocked";
	}

	if (mergeable === false) {
		return "blocked";
	}

	// mergeable === true
	if (state === "UNSTABLE") return "mergeableUnstable";
	return "clean";
}

function normalizeMergeable(mergeable: string | boolean | null | undefined): boolean | null {
	if (mergeable === true || mergeable === "MERGEABLE") return true;
	if (mergeable === false || mergeable === "CONFLICTING") return false;
	return null;
}

/** Compute the next poll interval with capped exponential backoff. Pure for testability. */
export function nextInterval(prev: number, factor: number, max: number): number {
	const next = prev * factor;
	return next > max ? max : Math.round(next);
}

function formatStatus(status: PrStatus): string {
	const state = status.mergeStateStatus ?? "UNKNOWN";
	const mergeable = status.mergeable ?? "UNKNOWN";
	const refs = status.baseRefName && status.headRefName ? ` (${status.headRefName} → ${status.baseRefName})` : "";
	return `${status.url}${refs}: mergeStateStatus=${state}, mergeable=${mergeable}`;
}

function verdictSeverity(verdict: Verdict): "info" | "warning" {
	return verdict === "blocked" ? "warning" : "info";
}

/** Active poll timers, tracked so they can be cancelled on shutdown. */
const activeTimers = new Set<ReturnType<typeof setTimeout>>();

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			activeTimers.delete(timer);
			resolve();
		}, ms);
		activeTimers.add(timer);
	});
}

function cancelAllPolls(): void {
	for (const timer of activeTimers) clearTimeout(timer);
	activeTimers.clear();
}

async function checkPr(target: string | undefined, cwd: string): Promise<PrStatus> {
	const args = ["pr", "view"];
	if (target?.trim()) args.push(target.trim());
	args.push("--json", "mergeStateStatus,mergeable,url,baseRefName,headRefName,statusCheckRollup");
	const stdout = await execFileText("gh", args, { cwd });
	return JSON.parse(stdout) as PrStatus;
}

function textFromMessage(message: unknown): string {
	if (typeof message === "string") return message;
	if (!message || typeof message !== "object") return "";
	const record = message as Record<string, unknown>;
	if (typeof record.content === "string") return record.content;
	if (Array.isArray(record.content)) return record.content.map(textFromMessage).join("\n");
	if (typeof record.text === "string") return record.text;
	return "";
}

function extractPrUrlsFromMessages(messages: unknown): string[] {
	const text = Array.isArray(messages) ? messages.map(textFromMessage).join("\n") : textFromMessage(messages);
	const fallback = text || JSON.stringify(messages ?? "");
	return [...new Set(fallback.match(PR_URL_RE) ?? [])];
}

/**
 * Run a best-effort background poll until checks settle (or the attempt budget is exhausted),
 * then notify exactly once with the final verdict. Never throws; never blocks agent_end.
 */
async function runSettlePoll(url: string, cwd: string, ui: { notify: (m: string, t?: "info" | "warning" | "error") => void }, pi: ExtensionAPI): Promise<void> {
	const config = loadPollConfig();
	let interval = config.initialIntervalMs;
	const waitAndBackoff = async (): Promise<void> => {
		await sleep(interval);
		interval = nextInterval(interval, config.backoffFactor, config.maxIntervalMs);
	};

	for (let attempt = 0; attempt < config.maxPolls; attempt++) {
		let status: PrStatus;
		try {
			status = await checkPr(url, cwd);
		} catch {
			// Transient gh/network failure: wait and retry rather than misclassifying.
			if (attempt < config.maxPolls - 1) {
				await waitAndBackoff();
				continue;
			}
			ui.notify(`PR check failed for ${url} after ${config.maxPolls} attempts. Re-run /pr-check later.`, "warning");
			return;
		}

		const verdict = classifyStatus(status);
		if (verdict === "pending") {
			await waitAndBackoff();
			continue;
		}

		ui.notify(`PR check: ${formatStatus(status)}`, verdictSeverity(verdict));
		if (verdict === "blocked") {
			pi.sendUserMessage(
				`Mekann PR workflow detected a blocked PR merge state for ${status.url}: ${formatStatus(status)}. Please investigate and perform only safe follow-up work. Do not merge, close, approve, force-push, change the PR base, or run destructive git operations without explicit user permission.`,
				{ deliverAs: "followUp" },
			);
		}
		return;
	}

	// Budget exhausted while still pending: checks are taking longer than the configured ceiling.
	ui.notify(`PR check: ${url} checks still running after ${config.maxPolls} polls. Re-run /pr-check later.`, "info");
}

export default function prWorkflowExtension(pi: ExtensionAPI): void {
	// URLs that have already reached a settled (non-pending) verdict this session.
	const settledUrls = new Set<string>();
	// URLs with a background poll currently in flight, to avoid duplicate polling.
	const pollingUrls = new Set<string>();

	pi.registerCommand("pr-check", {
		description: "Check GitHub PR mergeability for the current branch or a PR URL/number",
		handler: async (args, ctx) => {
			try {
				const status = await checkPr(args, ctx.cwd);
				const verdict = classifyStatus(status);
				if (verdict === "pending") {
					ctx.ui.notify(`PR check: ${formatStatus(status)} — checks still running. Re-run /pr-check later.`, "info");
				} else {
					ctx.ui.notify(`PR check: ${formatStatus(status)}`, verdictSeverity(verdict));
				}
			} catch (error) {
				ctx.ui.notify(`PR check failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
		},
	});

	pi.on("agent_end", async (event, ctx) => {
		const urls = extractPrUrlsFromMessages((event as { messages?: unknown }).messages);
		for (const url of urls) {
			if (settledUrls.has(url) || pollingUrls.has(url)) continue;
			pollingUrls.add(url);
			// Fire-and-forget: never block agent_end on a network poll.
			runSettlePoll(url, ctx.cwd, ctx.ui, pi)
				.catch(() => {
					/* best-effort; swallow to avoid unhandled rejections */
				})
				.finally(() => {
					pollingUrls.delete(url);
					settledUrls.add(url);
				});
		}
	});

	// On shutdown, cancel any in-flight background polls so the process can exit promptly.
	pi.on("session_shutdown", () => {
		cancelAllPolls();
	});
}
