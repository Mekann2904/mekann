/**
 * Zip Repo Extension — archive Git repo as ZIP to clipboard (macOS).
 * /zip [--head|--worktree]
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename, join, dirname } from "node:path";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeAppleScriptString(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

type ZipMode = "default" | "head" | "worktree";

function parseArgs(raw: string): { mode: ZipMode } {
	const tokens = raw.trim().split(/\s+/);
	if (tokens.includes("--worktree")) return { mode: "worktree" };
	if (tokens.includes("--head")) return { mode: "head" };
	return { mode: "default" };
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("zip", {
		description: "Archive the current Git repo as ZIP and copy to clipboard (macOS). Flags: --head, --worktree",
		handler: async (rawArgs, ctx) => {
			const { mode } = parseArgs(rawArgs ?? "");

			let repoRoot: string;
			let shortHead = "nohead";
			try {
				const { stdout } = await execFileAsync(
					"git", ["rev-parse", "--show-toplevel", "HEAD"],
					{ cwd: ctx.cwd, encoding: "utf8" },
				);
				const lines = stdout.trim().split("\n");
				repoRoot = lines[0];
				shortHead = lines[1].slice(0, 12);
			} catch {
				ctx.ui.notify("Not a Git repository or no commits yet. /zip requires HEAD to exist.", "error");
				return;
			}
			const repoName = basename(repoRoot);

			let dirty = false;
			try {
				const { stdout: statusStdout } = await execFileAsync(
					"git", ["status", "--porcelain"],
					{ cwd: repoRoot, encoding: "utf8" },
				);
				dirty = statusStdout.trim().length > 0;
			} catch {
			}

			if (mode === "default" && dirty) {
				ctx.ui.notify(
					"Working tree has uncommitted changes. Commit/stash them, or use /zip --head or /zip --worktree.",
					"error",
				);
				return;
			}

			if (mode === "head" && dirty) {
				ctx.ui.notify(
					"⚠ Archiving HEAD only — uncommitted changes are NOT included.",
					"warning",
				);
			}

			const tmpDir = await mkdtemp(join(tmpdir(), `${repoName}-${shortHead}-`));
			const zipPath = join(tmpDir, `${repoName}-${shortHead}-${Date.now()}.zip`);

			try {
				await execFileAsync("git", [
					"archive",
					"--format=zip",
					`--prefix=${repoName}/`,
					`--output=${zipPath}`,
					"HEAD",
				], { cwd: repoRoot });

				if (mode === "worktree" && dirty) {
					const parentDir = dirname(repoRoot);
					await overlayDirtyFiles(parentDir, repoName, repoRoot, zipPath);
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				ctx.ui.notify(`Failed to create ZIP: ${msg}`, "error");
				return;
			}

			let sizeStr: string;
			try {
				const info = await stat(zipPath);
				sizeStr = formatBytes(info.size);
			} catch {
				sizeStr = "unknown size";
			}

			try {
				await execFileAsync("osascript", [
					"-e",
					`set the clipboard to (POSIX file "${escapeAppleScriptString(zipPath)}")`,
				]);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				ctx.ui.notify(
					`ZIP created at ${zipPath} (${sizeStr}) but clipboard copy failed: ${msg}`,
					"warning",
				);
				return;
			}

			const modeLabel = mode === "default" || mode === "head" ? "HEAD" : "worktree";
			ctx.ui.notify(
				`Copied to clipboard: ${zipPath} (${sizeStr}, ${modeLabel})`,
				"info",
			);
		},
	});
}

/** Overlay modified and untracked files onto an existing ZIP archive. */
async function overlayDirtyFiles(parentDir: string, repoName: string, repoRoot: string, zipPath: string): Promise<void> {
	const { stdout: modifiedStdout } = await execFileAsync("git", [
		"diff-files",
		"--name-only",
	], { cwd: repoRoot, encoding: "utf8" });

	const { stdout: othersStdout } = await execFileAsync("git", [
		"ls-files",
		"--others",
		"--exclude-standard",
		"--",
	], { cwd: repoRoot, encoding: "utf8" });

	const modified = modifiedStdout.split("\n").filter(Boolean);
	const untracked = othersStdout.split("\n").filter(Boolean);
	const dirtyFiles = [...modified, ...untracked];

	if (dirtyFiles.length === 0) return;

	const archivePaths = dirtyFiles.map((f) => `${repoName}/${f}`);

	await execFileAsync("/usr/bin/zip", [
		"-u",
		zipPath,
		...archivePaths,
	], { cwd: parentDir });
}
