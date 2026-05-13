/**
 * Zip Repo Extension
 *
 * Compresses the current Git repository into a ZIP file and copies it to the macOS clipboard.
 * Usage: /zip
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename } from "node:path";
import { stat } from "node:fs/promises";

const execFileAsync = promisify(execFile);

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("zip", {
		description: "Archive the current Git repo as ZIP and copy to clipboard (macOS)",
		handler: async (_args, ctx) => {
			// 1. Check if inside a Git repository
			try {
				await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], {
					cwd: ctx.cwd,
				});
			} catch {
				ctx.ui.notify("Not a Git repository", "error");
				return;
			}

			// 2. Get repo name
			const repoName = basename(ctx.cwd);

			// 3. Generate timestamp
			const now = new Date();
			const ts = [
				now.getFullYear(),
				String(now.getMonth() + 1).padStart(2, "0"),
				String(now.getDate()).padStart(2, "0"),
				"-",
				String(now.getHours()).padStart(2, "0"),
				String(now.getMinutes()).padStart(2, "0"),
				String(now.getSeconds()).padStart(2, "0"),
			].join("");

			const zipPath = `/tmp/${repoName}-${ts}.zip`;

			// 4. Create ZIP via git archive (respects .gitignore, excludes .git/)
			try {
				await execFileAsync("git", ["archive", "--format=zip", `--output=${zipPath}`, "HEAD"], {
					cwd: ctx.cwd,
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				ctx.ui.notify(`Failed to create ZIP: ${msg}`, "error");
				return;
			}

			// 5. Get file size
			let sizeStr: string;
			try {
				const info = await stat(zipPath);
				sizeStr = formatBytes(info.size);
			} catch {
				sizeStr = "unknown size";
			}

			// 6. Copy to clipboard as a file (macOS)
			try {
				await execFileAsync("osascript", [
					"-e",
					`set the clipboard to (POSIX file "${zipPath}")`,
				]);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				ctx.ui.notify(`ZIP created at ${zipPath} (${sizeStr}) but clipboard copy failed: ${msg}`, "warning");
				return;
			}

			ctx.ui.notify(`Copied to clipboard: ${zipPath} (${sizeStr})`, "info");
		},
	});
}
