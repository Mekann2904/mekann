/**
 * Zip Repo Extension — archive Git repo as ZIP to clipboard (macOS).
 * /zip [--head|--worktree]
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile as execFileAsync } from "node:child_process/promises";
import { basename, join, dirname } from "node:path";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";



export default function (pi: ExtensionAPI) {
	pi.registerCommand("zip", {
		description: "Archive the current Git repo as ZIP and copy to clipboard (macOS). Flags: --head, --worktree",
		handler: async (rawArgs, ctx) => {
			const tokens = (rawArgs ?? "").trim().split(/\s+/);
			const mode = tokens.includes("--worktree") ? "worktree" : tokens.includes("--head") ? "head" : "default";

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

			let sizeStr = "unknown size";
			try {
				const b = (await stat(zipPath)).size;
				sizeStr = b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
			} catch {}

			try {
				await execFileAsync("osascript", [
					"-e",
					`set the clipboard to (POSIX file "${zipPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`,
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

async function overlayDirtyFiles(parentDir: string, repoName: string, repoRoot: string, zipPath: string): Promise<void> {
	const { stdout } = await execFileAsync("git", [
		"ls-files", "-mo", "--exclude-standard", "--",
	], { cwd: repoRoot, encoding: "utf8" });

	const dirtyFiles = stdout.split("\n").filter(Boolean);
	if (dirtyFiles.length === 0) return;

	await execFileAsync("/usr/bin/zip", [
		"-u", zipPath,
		...dirtyFiles.map((f) => `${repoName}/${f}`),
	], { cwd: parentDir });
}
