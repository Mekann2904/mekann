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

// ─── Exported utility functions (testable) ───────────────────────

/** バイト数を人間可読に。 */
export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** ZIP ファイルパスを生成。 */
export function buildZipPath(repoRoot: string, shortHead: string): string {
	return join(dirname(repoRoot), `${basename(repoRoot)}-${shortHead}.zip`);
}

/** AppleScript 用パスエスケープ。 */
export function escapeAppleScriptPath(path: string): string {
	return path.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** AppleScript clipboard スクリプトを生成。 */
export function buildClipboardScript(escapedPath: string): string {
	return `
				use framework "Foundation"
				use framework "AppKit"
				set theURL to current application's NSURL's fileURLWithPath:"${escapedPath}"
				set thePasteboard to current application's NSPasteboard's generalPasteboard()
				thePasteboard's clearContents()
				thePasteboard's writeObjects:{theURL}
			`;
}

/** git ls-files の出力から dirty file リストをパース。 */
export function parseDirtyFiles(stdout: string): string[] {
	return stdout.split("\n").filter(Boolean);
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("zip", {
		description: "Archive working tree as ZIP and copy to clipboard (macOS)",
		handler: async (_args, ctx) => {
			let repoRoot: string;
			let shortHead = "nohead";
			try {
				const { stdout: rootStdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: ctx.cwd, encoding: "utf8" });
				repoRoot = rootStdout.trim();
				const { stdout: headStdout } = await execFileAsync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
				shortHead = headStdout.trim();
			} catch (e: unknown) {
				const msg = e instanceof Error ? e.message : String(e);
				ctx.ui.notify(`Not a Git repository or no commits yet: ${msg}`, "error");
				return;
			}
			let dirty = false;
			try {
				const { stdout: statusStdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8" });
				dirty = statusStdout.trim().length > 0;
			} catch {}
			const zipPath = buildZipPath(repoRoot, shortHead);

			// 前回の ZIP が残っていれば削除
			try { await unlink(zipPath); } catch {}

			try {
				await execFileAsync("git", ["archive", "--format=zip", `--prefix=${basename(repoRoot)}/`, `--output=${zipPath}`, "HEAD"], { cwd: repoRoot });

				if (dirty) await overlayDirtyFiles(repoRoot, basename(repoRoot), zipPath);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				ctx.ui.notify(`Failed to create ZIP: ${msg}`, "error");
				return;
			}
			let sizeStr = "unknown size";
			try {
				const b = (await stat(zipPath)).size;
				sizeStr = formatFileSize(b);
			} catch {}

			// NSPasteboard 経由でファイル URL をクリップボードにコピー
			// Finder、チャットアプリ等で ⌘V によるファイルペーストが可能
			try {
				const escaped = escapeAppleScriptPath(zipPath);
				const script = buildClipboardScript(escaped);
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

	const dirtyFiles = parseDirtyFiles(stdout);
	if (dirtyFiles.length === 0) return;
	await execFileAsync("/usr/bin/zip", ["-u", zipPath, ...dirtyFiles.map((f) => `${repoName}/${f}`)], { cwd: dirname(repoRoot) });
}
