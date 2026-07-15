import type { IssueWorkflowAction, IssueWorkflowParams } from "./schemas.js";

export interface MutationPolicyRunner {
	git(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }>;
	gh(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }>;
	withTempFile<T>(content: string, use: (filePath: string) => Promise<T>): Promise<T>;
}

type MutationKind = "local" | "push" | "github-pr" | "github-repo";
type BranchRequirement = "always" | "implicit-issue" | "never";
type MutationPolicy = {
	kind: MutationKind;
	branch: BranchRequirement;
	describe(params: IssueWorkflowParams): string;
};

/** Single source of truth for mutation classification, branch needs, and descriptions. */
const MUTATION_POLICIES = {
	commit: {
		kind: "local", branch: "always",
		describe: (p) => `commit${p.amend ? " (amend)" : ""}; files=${p.files?.join(", ") || "already staged"}; message=${JSON.stringify(p.message)}`,
	},
	push: {
		kind: "push", branch: "always",
		describe: (p) => `push remote=${p.remote?.trim() || "origin"}; branch=current; force-with-lease=${p.force_with_lease === true}`,
	},
	create_pr: {
		kind: "github-repo", branch: "always",
		describe: (p) => `create PR; base=${p.base?.trim() || "recorded/default"}; draft=${p.draft === true}; title=${JSON.stringify(p.title)}`,
	},
	update_pr: {
		kind: "github-pr", branch: "always",
		describe: (p) => `update PR=${p.pr?.trim() || "current branch PR"}; fields=${[p.title ? "title" : "", p.body ? "body" : ""].filter(Boolean).join(", ")}`,
	},
	ready: {
		kind: "github-pr", branch: "always",
		describe: (p) => `mark PR=${p.pr?.trim() || "current branch PR"} ready`,
	},
	comment: {
		kind: "github-pr", branch: "always",
		describe: (p) => `comment on PR=${p.pr?.trim() || "current branch PR"}`,
	},
	issue_comment: {
		kind: "github-repo", branch: "implicit-issue",
		describe: (p) => `comment on issue=${p.issue ?? "current issue branch"}`,
	},
	promote_to_ready_for_agent: {
		kind: "github-repo", branch: "implicit-issue",
		describe: (p) => `change issue=${p.issue ?? "current issue branch"} labels to ready-for-agent`,
	},
	demote_to_ready_for_human: {
		kind: "github-repo", branch: "implicit-issue",
		describe: (p) => `change issue=${p.issue ?? "current issue branch"} labels to ready-for-human`,
	},
} satisfies Partial<Record<IssueWorkflowAction, MutationPolicy>>;

export type MutatingAction = keyof typeof MUTATION_POLICIES;
type GithubMutationAction = { [A in MutatingAction]: (typeof MUTATION_POLICIES)[A]["kind"] extends `github-${string}` ? A : never }[MutatingAction];

export const MUTATING_ACTIONS: ReadonlySet<IssueWorkflowAction> = new Set(Object.keys(MUTATION_POLICIES) as MutatingAction[]);

export type MutationIntent =
	| { kind: "local"; action: "commit"; params: IssueWorkflowParams; summary: string; branch: string }
	| { kind: "push"; action: "push"; params: IssueWorkflowParams; summary: string; branch: string; repository: string | null; remoteUrl: string }
	| { kind: "github"; action: GithubMutationAction; params: IssueWorkflowParams; summary: string; repository: string; targetUrl?: string; branch?: string };

function trim(value: string | undefined): string {
	return typeof value === "string" ? value.trim() : "";
}

function githubRepository(value: string): string | null {
	const match = value.match(/github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/pull\/\d+)?$/i);
	return match ? `${match[1]}/${match[2]}` : null;
}

function isMutatingAction(action: IssueWorkflowAction): action is MutatingAction {
	return Object.prototype.hasOwnProperty.call(MUTATION_POLICIES, action);
}

function policyFor(action: IssueWorkflowAction): MutationPolicy {
	if (!isMutatingAction(action)) throw new Error(`Unsupported mutation action: ${action}`);
	return MUTATION_POLICIES[action];
}

function isGithubMutationAction(action: IssueWorkflowAction): action is GithubMutationAction {
	if (!isMutatingAction(action)) return false;
	return MUTATION_POLICIES[action].kind.startsWith("github-");
}

function needsBranch(policy: MutationPolicy, params: IssueWorkflowParams): boolean {
	return policy.branch === "always" || (policy.branch === "implicit-issue" && params.issue === undefined);
}

export function describeMutation(params: IssueWorkflowParams): string {
	return policyFor(params.action).describe(params);
}

async function resolveGithubTarget(kind: MutationKind, params: IssueWorkflowParams, cwd: string, runner: MutationPolicyRunner): Promise<{ repository: string; targetUrl?: string }> {
	const explicitPr = trim(params.pr);
	if (kind === "github-pr" && explicitPr.startsWith("https://github.com/")) {
		const repository = githubRepository(explicitPr);
		if (!repository) throw new Error("Cannot resolve the repository from the explicit PR URL.");
		return { repository, targetUrl: explicitPr };
	}
	if (kind === "github-pr") {
		const args = ["pr", "view"];
		if (explicitPr) args.push(explicitPr);
		args.push("--json", "url");
		const parsed = JSON.parse((await runner.gh(args, cwd)).stdout) as { url?: string };
		const targetUrl = trim(parsed.url);
		const repository = githubRepository(targetUrl);
		if (!targetUrl || !repository) throw new Error("Cannot resolve the GitHub PR target for confirmation.");
		return { repository, targetUrl };
	}
	const parsed = JSON.parse((await runner.gh(["repo", "view", "--json", "nameWithOwner,url"], cwd)).stdout) as { nameWithOwner?: string };
	const repository = trim(parsed.nameWithOwner);
	if (!repository) throw new Error("Cannot resolve the GitHub repository for confirmation.");
	return { repository };
}

export async function resolveMutationIntent(params: IssueWorkflowParams, cwd: string, runner: MutationPolicyRunner): Promise<MutationIntent> {
	const policy = policyFor(params.action);
	const summary = policy.describe(params);
	const branchPromise = needsBranch(policy, params)
		? runner.git(["branch", "--show-current"], cwd).then(({ stdout }) => stdout.trim())
		: Promise.resolve(undefined);

	if (policy.kind === "local") return { kind: "local", action: "commit", params, summary, branch: (await branchPromise) ?? "" };
	if (policy.kind === "push") {
		const remote = trim(params.remote) || "origin";
		const [branch, remoteUrl] = await Promise.all([
			branchPromise,
			runner.git(["remote", "get-url", remote], cwd).then(({ stdout }) => stdout.trim()),
		]);
		if (!remoteUrl) throw new Error(`Cannot resolve git remote '${remote}' for confirmation.`);
		return { kind: "push", action: "push", params, summary, branch: branch ?? "", repository: githubRepository(remoteUrl), remoteUrl };
	}
	if (!isGithubMutationAction(params.action)) throw new Error(`Unsupported GitHub mutation action: ${params.action}`);
	const [branch, target] = await Promise.all([branchPromise, resolveGithubTarget(policy.kind, params, cwd, runner)]);
	return { kind: "github", action: params.action, params, summary, repository: target.repository, ...(target.targetUrl ? { targetUrl: target.targetUrl } : {}), ...(branch !== undefined ? { branch } : {}) };
}

export function formatMutationIntent(intent: MutationIntent): string {
	return [
		`Operation: ${intent.summary}`,
		...(intent.kind === "push" ? [`Repository: ${intent.repository ?? "non-GitHub remote"}`, `Remote URL: ${intent.remoteUrl}`] : []),
		...(intent.kind === "github" ? [`Repository: ${intent.repository}`, ...(intent.targetUrl ? [`Target URL: ${intent.targetUrl}`] : [])] : []),
		...(intent.branch !== undefined ? [`Branch: ${intent.branch || "(detached)"}`] : []),
	].join("\n");
}

/** Bind execution to the exact params and target used to resolve the approved intent. */
export function bindApprovedMutation(runner: MutationPolicyRunner, intent: MutationIntent): { params: IssueWorkflowParams; runner: MutationPolicyRunner } {
	if (intent.kind === "local") return { params: intent.params, runner };
	if (intent.kind === "push") return { params: { ...intent.params, remote: intent.remoteUrl }, runner };
	const boundParams = intent.targetUrl ? { ...intent.params, pr: intent.targetUrl } : intent.params;
	const repository = intent.repository;
	return {
		params: boundParams,
		runner: {
			...runner,
			gh(args, cwd) { return runner.gh(["--repo", repository, ...args], cwd); },
		},
	};
}
