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

/** git status --porcelain の出力から deleted / modified に分離。 */
export function parseGitStatus(stdout: string): { deleted: string[]; modified: string[] } {
	const deleted: string[] = [];
	const modified: string[] = [];
	for (const line of stdout.split("\n").filter(Boolean)) {
		const statusCode = line.slice(0, 2);
		let filePath = line.slice(3);

		// Handle rename: "XY old_path -> new_path"
		const renameArrow = filePath.indexOf(" -> ");
		if (renameArrow !== -1) {
			filePath = filePath.slice(renameArrow + 4);
		}

		// Handle quoted paths: git status --porcelain may quote paths with special chars
		if (filePath.startsWith('"') && filePath.endsWith('"')) {
			filePath = filePath.slice(1, -1);
			// Unescape C-style octal sequences (\303\261 → ñ etc.)
			// Git outputs individual UTF-8 bytes as octal; collect all bytes then decode
			const bytes: number[] = [];
			let i = 0;
			while (i < filePath.length) {
				if (filePath[i] === "\\" && i + 3 < filePath.length && /^[0-7]{3}$/.test(filePath.slice(i + 1, i + 4))) {
					bytes.push(parseInt(filePath.slice(i + 1, i + 4), 8));
					i += 4;
				} else {
					for (const b of new TextEncoder().encode(filePath[i])) bytes.push(b);
					i++;
				}
			}
			filePath = new TextDecoder().decode(new Uint8Array(bytes));
		}

		if (statusCode.includes("D")) {
			deleted.push(filePath);
		} else {
			modified.push(filePath);
		}
	}
	return { deleted, modified };
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

				if (dirty) await prepareWorktreeZip(repoRoot, basename(repoRoot), zipPath);
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

async function prepareWorktreeZip(repoRoot: string, repoName: string, zipPath: string): Promise<void> {
	const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8" });
	const { deleted, modified } = parseGitStatus(stdout);

	if (deleted.length > 0) {
		await execFileAsync("/usr/bin/zip", ["-d", zipPath, ...deleted.map((f) => `${repoName}/${f}`)], { cwd: dirname(repoRoot) });
	}

	// Filter modified files to only include those that actually exist on disk
	const existingModified: string[] = [];
	for (const f of modified) {
		try {
			await stat(join(repoRoot, f));
			existingModified.push(f);
		} catch {
			// File doesn't exist on disk (e.g., type change to symlink) — skip
		}
	}

	if (existingModified.length > 0) {
		await execFileAsync("/usr/bin/zip", ["-u", zipPath, ...existingModified.map((f) => `${repoName}/${f}`)], { cwd: dirname(repoRoot) });
	}
}
