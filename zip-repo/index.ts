/**
 * Zip Repo Extension — archive working tree as ZIP to clipboard (macOS).
 * /zip — always includes HEAD + uncommitted changes.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
import { basename, dirname, join } from "node:path";
import { stat, unlink } from "node:fs/promises";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("zip", {
		description: "Archive working tree as ZIP and copy to clipboard (macOS)",
		handler: async (_args, ctx) => {
			let repoRoot: string;
			let shortHead = "nohead";
			try {
				const { stdout: rootStdout } = await execFileAsync(
					"git", ["rev-parse", "--show-toplevel"],
					{ cwd: ctx.cwd, encoding: "utf8" },
				);
				repoRoot = rootStdout.trim();

				const { stdout: headStdout } = await execFileAsync(
					"git", ["rev-parse", "--short=12", "HEAD"],
					{ cwd: repoRoot, encoding: "utf8" },
				);
				shortHead = headStdout.trim();
			} catch (e: unknown) {
				const msg = e instanceof Error ? e.message : String(e);
				ctx.ui.notify(`Not a Git repository or no commits yet: ${msg}`, "error");
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
			} catch {}

			const parentDir = dirname(repoRoot);
			const zipPath = join(parentDir, `${repoName}-${shortHead}.zip`);

			// 前回の ZIP が残っていれば削除
			try { await unlink(zipPath); } catch {}

			try {
				await execFileAsync("git", ["archive", "--format=zip", `--prefix=${repoName}/`, `--output=${zipPath}`, "HEAD"], { cwd: repoRoot });

				if (dirty) {
					await overlayDirtyFiles(repoRoot, repoName, zipPath);
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

			// NSPasteboard 経由でファイル URL をクリップボードにコピー
			// Finder、チャットアプリ等で ⌘V によるファイルペーストが可能
			try {
				const escaped = zipPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
				const script = `
					use framework "Foundation"
					use framework "AppKit"
					set theURL to current application's NSURL's fileURLWithPath:"${escaped}"
					set thePasteboard to current application's NSPasteboard's generalPasteboard()
					thePasteboard's clearContents()
					thePasteboard's writeObjects:{theURL}
				`;
				await execFileAsync("osascript", ["-e", script]);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				ctx.ui.notify(`ZIP created at ${zipPath} (${sizeStr}) but clipboard copy failed: ${msg}`, "warning");
				return;
			}

			ctx.ui.notify(`Copied to clipboard: ${zipPath} (${sizeStr})`, "info");
		},
	});
}

async function overlayDirtyFiles(repoRoot: string, repoName: string, zipPath: string): Promise<void> {
	const { stdout } = await execFileAsync("git", ["ls-files", "-mo", "--exclude-standard", "--"], { cwd: repoRoot, encoding: "utf8" });

	const dirtyFiles = stdout.split("\n").filter(Boolean);
	if (dirtyFiles.length === 0) return;

	await execFileAsync("/usr/bin/zip", ["-u", zipPath, ...dirtyFiles.map((f) => `${repoName}/${f}`)], { cwd: dirname(repoRoot) });
}
