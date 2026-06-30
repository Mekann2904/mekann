/**
 * GitHub API client — HTTP communication and fallback logic.
 * Pure parsing functions live in github-parse.ts.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
	parseGitHubViewer,
	normalizeDashboardResponse,
	type GitHubProfile,
	type GitHubProfileResult,
	type GitHubDashboardResult,
} from "./github-parse.js";
import { redactSecrets } from "../../context/tool-output/redact.js";

// Re-export types and parse functions for backward compatibility
export type { GitHubProfile, ContributionDay, GitHubActivitySummary, GitHubDashboardData, GitHubProfileResult, GitHubDashboardResult } from "./github-parse.js";
export { parseGitHubViewer, normalizeDashboardResponse } from "./github-parse.js";

const execFileAsync = promisify(execFile);

const VIEWER_QUERY = `query { viewer { login name bio location url avatarUrl } }`;
const DEFAULT_GITHUB_TIMEOUT_MS = 5000;

// Exposed for tests so the parameterised query + variable builder can be asserted
// without making a network call.
export const DASHBOARD_QUERY = `query($from: DateTime!, $to: DateTime!) {
	viewer {
		login name bio location url avatarUrl
		contributionsCollection(from: $from, to: $to) {
			contributionCalendar { weeks { contributionDays { date contributionCount contributionLevel } } }
			pullRequestContributionsByRepository(maxRepositories: 100) { contributions(first: 100) { totalCount } }
			issueContributionsByRepository(maxRepositories: 100) { contributions(first: 100) { totalCount } }
			pullRequestReviewContributionsByRepository(maxRepositories: 100) { contributions(first: 100) { totalCount } }
		}
	}
}`;

function timeoutMs(env: NodeJS.ProcessEnv = process.env): number {
	const parsed = Number(env.MEKANN_DASHBOARD_GITHUB_TIMEOUT_MS);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GITHUB_TIMEOUT_MS;
}

function dashboardVariables(from: string, to: string): Record<string, string> {
	return { from, to };
}

async function fromGh(): Promise<GitHubProfile> {
	const parsed = await runGhGraphql(VIEWER_QUERY) as { data?: { viewer?: unknown } };
	return parseGitHubViewer(parsed.data?.viewer);
}

async function fromToken(token: string): Promise<GitHubProfile> {
	const parsed = await runTokenGraphql(token, VIEWER_QUERY) as { data?: { viewer?: unknown } };
	return parseGitHubViewer(parsed.data?.viewer);
}

async function runGhGraphql(query: string, variables: Record<string, unknown> = {}, timeout = timeoutMs()): Promise<unknown> {
	const args = ["api", "graphql", "-f", `query=${query}`];
	// -F passes a typed raw field per variable; gh forwards them as GraphQL variables,
	// so values are never interpolated into the query text.
	for (const [key, value] of Object.entries(variables)) {
		args.push("-F", `${key}=${value}`);
	}
	const { stdout } = await execFileAsync("gh", args, { maxBuffer: 8 * 1024 * 1024, timeout });
	return JSON.parse(stdout);
}

async function runTokenGraphql(token: string, query: string, variables: Record<string, unknown> = {}, timeout = timeoutMs()): Promise<unknown> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	let response: Response;
	try {
		response = await fetch("https://api.github.com/graphql", {
			method: "POST",
			headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "user-agent": "mekann-dashboard" },
			body: JSON.stringify({ query, variables }),
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timer);
	}
	if (!response.ok) throw new Error(`GitHub GraphQL failed: ${response.status} ${response.statusText}`);
	const parsed = await response.json() as { errors?: unknown };
	if (parsed.errors) throw new Error(`GitHub GraphQL returned errors: ${JSON.stringify(parsed.errors).slice(0, 300)}`);
	return parsed;
}

export async function collectGitHubDashboard(env: NodeJS.ProcessEnv = process.env, now = new Date()): Promise<GitHubDashboardResult> {
	const to = now.toISOString();
	const fromDate = new Date(now);
	fromDate.setDate(fromDate.getDate() - 365);
	const variables = dashboardVariables(fromDate.toISOString(), to);
	const timeout = timeoutMs(env);
	try {
		return { ok: true, data: normalizeDashboardResponse(await runGhGraphql(DASHBOARD_QUERY, variables, timeout), now) };
	} catch (ghError) {
		const token = githubToken(env);
		if (token) {
			try {
				return { ok: true, data: normalizeDashboardResponse(await runTokenGraphql(token.value, DASHBOARD_QUERY, variables, timeout), now) };
			} catch (tokenError) {
				return { ok: false, error: `gh failed: ${message(ghError, env)}; ${token.name} failed: ${message(tokenError, env)}` };
			}
		}
		return { ok: false, error: `gh failed: ${message(ghError, env)}; run gh auth login or set GITHUB_TOKEN/GH_TOKEN` };
	}
}

export async function collectGitHubProfile(env: NodeJS.ProcessEnv = process.env): Promise<GitHubProfileResult> {
	try {
		return { ok: true, profile: await fromGh() };
	} catch (ghError) {
		const token = githubToken(env);
		if (token) {
			try {
				return { ok: true, profile: await fromToken(token.value) };
			} catch (tokenError) {
				return { ok: false, error: `gh failed: ${message(ghError, env)}; ${token.name} failed: ${message(tokenError, env)}` };
			}
		}
		return { ok: false, error: `gh failed: ${message(ghError, env)}; run gh auth login or set GITHUB_TOKEN/GH_TOKEN` };
	}
}

function githubToken(env: NodeJS.ProcessEnv): { name: "GITHUB_TOKEN" | "GH_TOKEN"; value: string } | undefined {
	if (env.GITHUB_TOKEN) return { name: "GITHUB_TOKEN", value: env.GITHUB_TOKEN };
	if (env.GH_TOKEN) return { name: "GH_TOKEN", value: env.GH_TOKEN };
	return undefined;
}

/** Strip configured token values from a string so secrets can never leak through error paths. */
export function maskSecrets(text: string, env: NodeJS.ProcessEnv = process.env): string {
	let out = text;
	for (const secret of [env.GITHUB_TOKEN, env.GH_TOKEN]) {
		if (secret && secret.length >= 8) {
			out = out.split(secret).join("[REDACTED]");
		}
	}
	return out;
}

export function message(error: unknown, env: NodeJS.ProcessEnv = process.env): string {
	const text = error instanceof Error ? error.message : String(error);
	const authHint = "To get started with GitHub CLI";
	let summary: string;
	if (text.includes(authHint) || text.includes("gh auth login") || text.includes("GH_TOKEN")) {
		summary = "GitHub CLI is not authenticated";
	} else {
		summary = text.replace(/\s+/g, " ").trim().slice(0, 300);
	}
	// IC-243: a token-derived error string can flow into dashboard output. Mask
	// configured env tokens (maskSecrets) AND run the canonical `redactSecrets`
	// (Bearer/sk-/ghp_ patterns) so neither surface leaks through error paths.
	return redactSecrets(maskSecrets(summary, env)).text;
}
