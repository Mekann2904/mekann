/**
 * issue_workflow action implementations.
 *
 * Pure-ish functions that take a `CommandRunner` abstraction over git/gh +
 * temp-file handling, so they are unit-testable without mocking node modules.
 *
 * `validateActionArgs` performs action-specific required-field validation and is
 * invoked from the tool's `prepareArguments` (throws → tool error).
 */

import { parseIssueNumberFromBranch } from "../issue/worktree.js";
import { classifyStatus, type PrStatus, type Verdict } from "../pr-workflow/index.js";
import { ISSUE_WORKFLOW_ACTIONS, type IssueWorkflowAction, type IssueWorkflowParams } from "./schemas.js";

/** Output of a git/gh command. */
export interface ExecOut {
	stdout: string;
	stderr: string;
}

/**
 * Abstraction over git/gh execution and temp-file message passing.
 * The real implementation lives in index.ts; tests provide a mock.
 */
export interface CommandRunner {
	git(args: string[], cwd: string): Promise<ExecOut>;
	gh(args: string[], cwd: string): Promise<ExecOut>;
	withTempFile<T>(content: string, use: (filePath: string) => Promise<T>): Promise<T>;
}

/** Structured tool result returned by executeAction. */
export interface ActionResult {
	text: string;
	details: Record<string, unknown>;
	isError: boolean;
}

/** Mutating actions — only permitted inside an issue worktree (branch issue-<n>). */
export const MUTATING_ACTIONS: ReadonlySet<IssueWorkflowAction> = new Set<IssueWorkflowAction>([
	"commit",
	"push",
	"create_pr",
	"update_pr",
	"ready",
	"comment",
	"issue_comment",
]);

class GitCommandError extends Error {
	constructor(
		public readonly cmd: string,
		public readonly stderr: string,
		public readonly stdout: string,
		public readonly exitCode?: number,
	) {
		super(
			`${cmd} failed${exitCode !== undefined ? ` (exit ${exitCode})` : ""}${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
		);
		this.name = "GitCommandError";
	}
}

async function run(
	runner: CommandRunner,
	kind: "git" | "gh",
	args: string[],
	cwd: string,
): Promise<ExecOut> {
	try {
		return kind === "git" ? await runner.git(args, cwd) : await runner.gh(args, cwd);
	} catch (error) {
		const e = error as { stderr?: string | Buffer; stdout?: string | Buffer; code?: number };
		const stderr = e?.stderr != null ? String(e.stderr) : "";
		const stdout = e?.stdout != null ? String(e.stdout) : "";
		throw new GitCommandError(`${kind} ${args.join(" ")}`, stderr, stdout, e?.code);
	}
}

/**
 * Validate action-specific required arguments.
 * Returns an error message string, or null when valid.
 * Exported for testing and for use in prepareArguments.
 */
const ALLOWED_FIELDS_BY_ACTION: Record<IssueWorkflowAction, readonly (keyof IssueWorkflowParams)[]> = {
	current_branch: ["action"],
	status: ["action"],
	diff: ["action", "cached", "files"],
	view_pr: ["action", "pr"],
	commit: ["action", "message", "files", "amend"],
	push: ["action", "remote", "force_with_lease"],
	create_pr: ["action", "title", "body", "base", "draft"],
	update_pr: ["action", "pr", "title", "body"],
	ready: ["action", "pr"],
	comment: ["action", "pr", "body"],
	issue_comment: ["action", "issue", "body"],
};

function invalidFieldError(params: Partial<IssueWorkflowParams>, action: IssueWorkflowAction): string | null {
	const allowed = new Set<keyof IssueWorkflowParams>(ALLOWED_FIELDS_BY_ACTION[action]);
	const invalid = (Object.keys(params) as (keyof IssueWorkflowParams)[]).filter(
		(key) => params[key] !== undefined && !allowed.has(key),
	);
	if (invalid.length === 0) return null;
	return `action '${action}' does not accept field(s): ${invalid.join(", ")}. Allowed fields: ${ALLOWED_FIELDS_BY_ACTION[action].join(", ")}.`;
}

export function validateActionArgs(params: Partial<IssueWorkflowParams>): string | null {
	const action = params.action;
	if (!action) return "issue_workflow requires an 'action' field.";
	if (!ISSUE_WORKFLOW_ACTIONS.includes(action as IssueWorkflowAction)) {
		return `Unknown issue_workflow action: ${String(action)}`;
	}
	const fieldError = invalidFieldError(params, action as IssueWorkflowAction);
	if (fieldError) return fieldError;
	switch (action) {
		case "commit":
			if (!params.message || !params.message.trim()) return "action 'commit' requires a non-empty 'message'.";
			return null;
		case "create_pr":
			if (!params.title || !params.title.trim()) return "action 'create_pr' requires a non-empty 'title'.";
			if (!params.body || !params.body.trim()) return "action 'create_pr' requires a non-empty 'body'.";
			return null;
		case "update_pr":
			if ((!params.title || !params.title.trim()) && (!params.body || !params.body.trim())) {
				return "action 'update_pr' requires at least one of 'title' or 'body'.";
			}
			return null;
		case "comment":
			if (!params.body || !params.body.trim()) return "action 'comment' requires a non-empty 'body'.";
			return null;
		case "issue_comment":
			if (!params.body || !params.body.trim()) return "action 'issue_comment' requires a non-empty 'body'.";
			return null;
		case "push":
		case "ready":
		case "status":
		case "diff":
		case "view_pr":
		case "current_branch":
			return null;
		default:
			return `Unknown issue_workflow action: ${String(action)}`;
	}
}

async function currentBranch(runner: CommandRunner, cwd: string): Promise<string> {
	const { stdout } = await run(runner, "git", ["branch", "--show-current"], cwd);
	return stdout.trim();
}

function trim(v: string | undefined): string {
	return typeof v === "string" ? v.trim() : "";
}

// ── Read-only actions ────────────────────────────────────────────────

async function doCurrentBranch(runner: CommandRunner, cwd: string): Promise<ActionResult> {
	const branch = await currentBranch(runner, cwd);
	let toplevel = "";
	try {
		toplevel = (await run(runner, "git", ["rev-parse", "--show-toplevel"], cwd)).stdout.trim();
	} catch {
		/* ignore */
	}
	const issueNumber = parseIssueNumberFromBranch(branch);
	const lines = [
		`branch: ${branch || "(detached)"}`,
		`issueNumber: ${issueNumber ?? "(not an issue worktree)"}`,
		`isIssueWorktree: ${issueNumber !== null}`,
	];
	if (toplevel) lines.push(`worktree: ${toplevel}`);
	return {
		text: lines.join("\n"),
		details: { action: "current_branch", branch, issueNumber, isIssueWorktree: issueNumber !== null, toplevel },
		isError: false,
	};
}

async function doStatus(runner: CommandRunner, cwd: string): Promise<ActionResult> {
	const { stdout } = await run(runner, "git", ["status", "--porcelain"], cwd);
	return {
		text: `$ git status --porcelain\n${stdout.trim() || "(no changes)"}`,
		details: { action: "status", porcelain: stdout },
		isError: false,
	};
}

async function doDiff(runner: CommandRunner, cwd: string, params: IssueWorkflowParams): Promise<ActionResult> {
	const args = ["diff"];
	if (params.cached) args.push("--cached");
	const files = params.files ?? [];
	if (files.length > 0) {
		args.push("--");
		args.push(...files);
	}
	const { stdout } = await run(runner, "git", args, cwd);
	return {
		text: `$ git ${args.join(" ")}\n${stdout.trim() || "(no diff)"}`,
		details: { action: "diff", cached: !!params.cached, files: files.length ? files : null, length: stdout.length },
		isError: false,
	};
}

/**
 * ADR-0022: classify PR snapshots via the shared pure `classifyStatus` instead
 * of treating transient `UNKNOWN`/`UNSTABLE` merge states as blocked.
 *   `UNKNOWN` / checks-in-flight => pending (wait, do not notify as blocked)
 *   `mergeable && UNSTABLE`       => mergeableUnstable (still mergeable)
 *   `BLOCKED`/`BEHIND`/`DIRTY`/`CONFLICTING` => blocked (true block)
 * Keep in sync with `mekann/utils/pr-workflow`.
 */
function verdictAnnotation(verdict: Verdict): string {
	switch (verdict) {
		case "blocked":
			return " — BLOCKED/needs attention";
		case "pending":
			return " — checks still running";
		case "mergeableUnstable":
			return " — mergeable (non-required checks unstable)";
		default:
			return ""; // clean
	}
}

function formatPrStatus(status: PrStatus, verdict: Verdict): string {
	const state = status.mergeStateStatus ?? "UNKNOWN";
	const mergeable = status.mergeable ?? "UNKNOWN";
	const refs = status.baseRefName && status.headRefName ? ` (${status.headRefName} → ${status.baseRefName})` : "";
	return `${status.url}${refs}: mergeStateStatus=${state}, mergeable=${mergeable}${verdictAnnotation(verdict)}`;
}

async function doViewPr(runner: CommandRunner, cwd: string, params: IssueWorkflowParams): Promise<ActionResult> {
	const args = ["pr", "view"];
	const target = trim(params.pr);
	if (target) args.push(target);
	args.push("--json", "mergeStateStatus,mergeable,url,baseRefName,headRefName,statusCheckRollup");
	const { stdout } = await run(runner, "gh", args, cwd);
	const status = JSON.parse(stdout) as PrStatus;
	const verdict = classifyStatus(status);
	return {
		text: `$ gh ${args.join(" ")}\n${formatPrStatus(status, verdict)}`,
		details: { action: "view_pr", pr: target || null, verdict, ...status },
		isError: false,
	};
}

// ── Mutating actions ─────────────────────────────────────────────────

function appendOutput(out: string[], stdout: string, stderr: string): void {
	if (stdout.trim()) out.push(stdout.trim());
	if (stderr.trim()) out.push(stderr.trim());
}

async function doCommit(runner: CommandRunner, cwd: string, params: IssueWorkflowParams): Promise<ActionResult> {
	const out: string[] = [];
	const files = params.files ?? [];
	if (files.length > 0) {
		const r = await run(runner, "git", ["add", "--", ...files], cwd);
		out.push("$ git add -- <files>");
		appendOutput(out, r.stdout, r.stderr);
	}
	await runner.withTempFile(params.message as string, async (fp) => {
		const args = ["commit", "-F", fp];
		if (params.amend) args.push("--amend");
		const r = await run(runner, "git", args, cwd);
		out.push(`$ git commit -F <tmpfile>${params.amend ? " --amend" : ""}`);
		appendOutput(out, r.stdout, r.stderr);
		return args;
	});
	return {
		text: out.join("\n") || "committed",
		details: { action: "commit", stagedFiles: files.length ? files : null, amended: !!params.amend },
		isError: false,
	};
}

async function doPush(runner: CommandRunner, cwd: string, params: IssueWorkflowParams): Promise<ActionResult> {
	const branch = await currentBranch(runner, cwd);
	const remote = trim(params.remote) || "origin";
	const args = ["push"];
	if (params.force_with_lease) args.push("--force-with-lease");
	args.push(remote, branch);
	const { stdout, stderr } = await run(runner, "git", args, cwd);
	const out = [`$ git ${args.join(" ")}`];
	appendOutput(out, stdout, stderr);
	return {
		text: out.join("\n") || "pushed",
		details: { action: "push", remote, branch, force_with_lease: !!params.force_with_lease },
		isError: false,
	};
}

function maskTempArg(args: string[], fp: string): string {
	return args.map((a) => (a === fp ? "<tmpfile>" : a)).join(" ");
}

async function doCreatePr(runner: CommandRunner, cwd: string, params: IssueWorkflowParams): Promise<ActionResult> {
	const out: string[] = [];
	const url = await runner.withTempFile(params.body as string, async (fp) => {
		const args = ["pr", "create", "--title", params.title as string, "--body-file", fp];
		const base = trim(params.base);
		if (base) args.push("--base", base);
		if (params.draft) args.push("--draft");
		const { stdout, stderr } = await run(runner, "gh", args, cwd);
		out.push(`$ gh ${maskTempArg(args, fp)}`);
		appendOutput(out, stdout, stderr);
		return stdout.trim();
	});
	return {
		text: out.join("\n") || "PR created",
		details: { action: "create_pr", title: params.title ?? null, base: trim(params.base) || null, draft: !!params.draft, url: url || null },
		isError: false,
	};
}

async function doUpdatePr(runner: CommandRunner, cwd: string, params: IssueWorkflowParams): Promise<ActionResult> {
	const out: string[] = [];
	const target = trim(params.pr);
	const updated: string[] = [];
	if (params.title && params.title.trim()) {
		const args = ["pr", "edit"];
		if (target) args.push(target);
		args.push("--title", params.title);
		const r = await run(runner, "gh", args, cwd);
		out.push(`$ gh ${args.join(" ")}`);
		appendOutput(out, r.stdout, r.stderr);
		updated.push("title");
	}
	if (params.body && params.body.trim()) {
		await runner.withTempFile(params.body, async (fp) => {
			const args = ["pr", "edit"];
			if (target) args.push(target);
			args.push("--body-file", fp);
			const r = await run(runner, "gh", args, cwd);
			out.push(`$ gh ${maskTempArg(args, fp)}`);
			appendOutput(out, r.stdout, r.stderr);
			return args;
		});
		updated.push("body");
	}
	return {
		text: out.join("\n") || "PR updated",
		details: { action: "update_pr", pr: target || null, updated },
		isError: false,
	};
}

async function doReady(runner: CommandRunner, cwd: string, params: IssueWorkflowParams): Promise<ActionResult> {
	const target = trim(params.pr);
	const args = ["pr", "ready"];
	if (target) args.push(target);
	const { stdout, stderr } = await run(runner, "gh", args, cwd);
	const out = [`$ gh ${args.join(" ")}`];
	appendOutput(out, stdout, stderr);
	return {
		text: out.join("\n") || "PR marked ready",
		details: { action: "ready", pr: target || null },
		isError: false,
	};
}

async function doComment(runner: CommandRunner, cwd: string, params: IssueWorkflowParams): Promise<ActionResult> {
	const out: string[] = [];
	const target = trim(params.pr);
	const url = await runner.withTempFile(params.body as string, async (fp) => {
		const args = ["pr", "comment"];
		if (target) args.push(target);
		args.push("--body-file", fp);
		const { stdout, stderr } = await run(runner, "gh", args, cwd);
		out.push(`$ gh ${maskTempArg(args, fp)}`);
		appendOutput(out, stdout, stderr);
		return stdout.trim();
	});
	return {
		text: out.join("\n") || "comment posted",
		details: { action: "comment", pr: target || null, url: url || null },
		isError: false,
	};
}

async function resolveIssueNumber(runner: CommandRunner, cwd: string, params: IssueWorkflowParams): Promise<number | null> {
	if (typeof params.issue === "number") return params.issue;
	const branch = await currentBranch(runner, cwd);
	return parseIssueNumberFromBranch(branch);
}

function requiresIssueWorktreeGate(params: IssueWorkflowParams): boolean {
	if (!MUTATING_ACTIONS.has(params.action)) return false;
	return params.action !== "issue_comment" || typeof params.issue !== "number";
}

async function doIssueComment(runner: CommandRunner, cwd: string, params: IssueWorkflowParams): Promise<ActionResult> {
	const out: string[] = [];
	const issue = await resolveIssueNumber(runner, cwd, params);
	if (issue === null) {
		return {
			text: "action 'issue_comment' requires an issue number: pass 'issue' or run inside an issue-<number> worktree.",
			details: { action: "issue_comment" },
			isError: true,
		};
	}
	const url = await runner.withTempFile(params.body as string, async (fp) => {
		const args = ["issue", "comment", String(issue), "--body-file", fp];
		const { stdout, stderr } = await run(runner, "gh", args, cwd);
		out.push(`$ gh ${maskTempArg(args, fp)}`);
		appendOutput(out, stdout, stderr);
		return stdout.trim();
	});
	return {
		text: out.join("\n") || "issue comment posted",
		details: { action: "issue_comment", issue, url: url || null },
		isError: false,
	};
}

/**
 * Dispatch a validated issue_workflow action.
 * Enforces the issue-worktree gate for mutating actions and centralises
 * exec-error handling into a structured error result.
 */
export async function executeAction(
	params: IssueWorkflowParams,
	cwd: string,
	runner: CommandRunner,
): Promise<ActionResult> {
	const action = params.action;

	// Gate mutating actions to issue worktrees (branch issue-<n>). Explicit
	// `issue_comment` targets a remote issue directly, so it does not need local
	// worktree context; implicit `issue_comment` still derives from the branch.
	if (requiresIssueWorktreeGate(params)) {
		let branch: string;
		try {
			branch = await currentBranch(runner, cwd);
		} catch (error) {
			const e = error instanceof GitCommandError ? error : error as Error;
			return {
				text: `issue_workflow '${action}' could not determine the current branch: ${e instanceof Error ? e.message : String(e)}`,
				details: { action, gate: "worktree" },
				isError: true,
			};
		}
		if (parseIssueNumberFromBranch(branch) === null) {
			return {
				text: `issue_workflow '${action}' is only allowed inside an issue worktree (branch issue-<number>). Current branch: '${branch || "(detached)"}'.`,
				details: { action, gate: "worktree", branch },
				isError: true,
			};
		}
	}

	try {
		switch (action) {
			case "current_branch":
				return await doCurrentBranch(runner, cwd);
			case "status":
				return await doStatus(runner, cwd);
			case "diff":
				return await doDiff(runner, cwd, params);
			case "view_pr":
				return await doViewPr(runner, cwd, params);
			case "commit":
				return await doCommit(runner, cwd, params);
			case "push":
				return await doPush(runner, cwd, params);
			case "create_pr":
				return await doCreatePr(runner, cwd, params);
			case "update_pr":
				return await doUpdatePr(runner, cwd, params);
			case "ready":
				return await doReady(runner, cwd, params);
			case "comment":
				return await doComment(runner, cwd, params);
			case "issue_comment":
				return await doIssueComment(runner, cwd, params);
			default:
				return { text: `Unknown issue_workflow action: ${String(action)}`, details: { action }, isError: true };
		}
	} catch (error) {
		if (error instanceof GitCommandError) {
			const text = [error.message, error.stdout.trim() && `${error.stdout.trim()}`].filter(Boolean).join("\n");
			return {
				text: text || `issue_workflow '${String(action)}' command failed.`,
				details: { action, cmd: error.cmd, stderr: error.stderr, stdout: error.stdout, exitCode: error.exitCode },
				isError: true,
			};
		}
		return {
			text: `issue_workflow '${String(action)}' failed: ${error instanceof Error ? error.message : String(error)}`,
			details: { action },
			isError: true,
		};
	}
}
