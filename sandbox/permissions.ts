/** Sandbox Permissions — 権限モデルとデフォルトポリシービルダー。
 * read_only: 読み取りのみ、workspace_write: workspace 内書き込み (.git deny), yolo: sandbox なし (要承認)
 *
 * SandboxMode, parseSandboxMode, modeLabel の実体は policy-core/modes.ts。
 * ここから re-export して既存 import の互換性を保つ。 */

// Re-export from single source of truth
export type { SandboxMode } from "../policy-core/modes.js";
export { parseSandboxMode, modeLabel, SANDBOX_MODES, DEFAULT_SANDBOX_MODE } from "../policy-core/modes.js";

import type { SandboxMode } from "../policy-core/modes.js";

export interface SandboxPolicy {
	mode: SandboxMode;
	cwd: string;
	workspaceRoots: string[]; // 読み取り可能ルート
	writableRoots: string[]; // 書き込み可能ルート（workspace_write のみ）
	network: boolean; // ネットワーク許可（filesystem と独立）
	/** true の場合、/opt/homebrew と /usr/local への read を許可。 */
	allowHomebrewPaths?: boolean;
	/** @internal per-run isolated temp directory. */
	_isolatedTempDir?: string;
	/** @internal 解決済み .git ディレクトリパス群。 */
	_resolvedGitdirs?: string[];
}

/** read_only ポリシーを生成する。 */
export function readOnlyPolicy(
	cwd: string,
	workspaceRoots: string[] = [],
): SandboxPolicy {
	return {
		mode: "read_only",
		cwd,
		workspaceRoots,
		writableRoots: [],
		network: false,
	};
}

/** workspace_write ポリシーを生成する。 */
export function workspaceWritePolicy(
	cwd: string,
	workspaceRoots: string[] = [],
	writableRoots: string[] = [],
	network = false,
): SandboxPolicy {
	return {
		mode: "workspace_write",
		cwd,
		workspaceRoots,
		writableRoots,
		network,
	};
}

/** yolo ポリシーを生成する。 */
export function yoloPolicy(): SandboxPolicy {
	return {
		mode: "yolo",
		cwd: "/",
		workspaceRoots: [],
		writableRoots: [],
		network: true,
	};
}
