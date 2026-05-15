/** Sandbox Permissions — 権限モデルとデフォルトポリシービルダー。
 * read_only: 読み取りのみ、workspace_write: workspace 内書き込み (.git deny), yolo: sandbox なし (要承認) */

export type SandboxMode =
	| "read_only"
	| "workspace_write"
	| "yolo";

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

/** 文字列から SandboxMode への安全なパース。 */
export function parseSandboxMode(value: string): SandboxMode | undefined {
	switch (value) {
		case "read_only":
		case "workspace_write":
		case "yolo":
			return value;
		default:
			return undefined;
	}
}

/** 人間可読のモードラベル。 */
export function modeLabel(mode: SandboxMode): string {
	switch (mode) {
		case "read_only":
			return "read-only";
		case "workspace_write":
			return "workspace-write";
		case "yolo":
			return "yolo";
	}
}
