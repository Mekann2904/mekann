import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CurrentRepoSummary = {
	ok: true;
	repoName: string;
	branch: string;
	changes: { staged: number; unstaged: number; untracked: number };
	aheadBehind: { kind: "counts"; ahead: number; behind: number } | { kind: "no-upstream" };
	latestCommit?: { hash: string; subject: string };
} | { ok: false; error: string };

export function parsePorcelainStatus(output: string): { staged: number; unstaged: number; untracked: number } {
	const changes = { staged: 0, unstaged: 0, untracked: 0 };
	for (const line of output.split(/\r?\n/).filter(Boolean)) {
		const x = line[0] ?? " ";
		const y = line[1] ?? " ";
		if (x === "?" && y === "?") changes.untracked += 1;
		else {
			if (x !== " " && x !== "?") changes.staged += 1;
			if (y !== " ") changes.unstaged += 1;
		}
	}
	return changes;
}

export function parseAheadBehind(output: string): { kind: "counts"; ahead: number; behind: number } {
	const [behindRaw, aheadRaw] = output.trim().split(/\s+/);
	return { kind: "counts", behind: Number(behindRaw) || 0, ahead: Number(aheadRaw) || 0 };
}

async function git(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 1024 * 1024 });
	return stdout.trimEnd();
}

export async function collectCurrentRepo(cwd: string): Promise<CurrentRepoSummary> {
	try {
		const root = await git(cwd, ["rev-parse", "--show-toplevel"]);
		const [branch, status, latest] = await Promise.all([
			git(root, ["branch", "--show-current"]).then((v) => v || "detached"),
			git(root, ["status", "--porcelain=v1"]),
			git(root, ["log", "-1", "--format=%h%x00%s"]).catch(() => ""),
		]);
		let aheadBehind: Extract<CurrentRepoSummary, { ok: true }>["aheadBehind"] = { kind: "no-upstream" };
		try {
			await git(root, ["rev-parse", "--abbrev-ref", "@{upstream}"]);
			aheadBehind = parseAheadBehind(await git(root, ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]));
		} catch {
			aheadBehind = { kind: "no-upstream" };
		}
		const [hash, subject] = latest.split("\0");
		return {
			ok: true,
			repoName: basename(root),
			branch,
			changes: parsePorcelainStatus(status),
			aheadBehind,
			latestCommit: hash ? { hash, subject: subject ?? "" } : undefined,
		};
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}
