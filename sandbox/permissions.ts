/**
 * Sandbox Permissions — 権限モデルの型定義とデフォルトポリシービルダー。
 *
 * 3段階の sandbox mode:
 *   read_only         — 読み取りのみ。書き込み・ネットワークは一切禁止。
 *                        workspace は read-only。ただし isolated temp dir のみ writable。
 *   workspace_write   — workspace 内への書き込みを許可（.git/.codex/.agents は deny）。
 *                        ネットワークは独立制御（デフォルト false）。
 *   danger_full_access — sandbox なし。(allow default)。要明示承認。
 */

export type SandboxMode =
	| "read_only"
	| "workspace_write"
	| "danger_full_access";

export interface SandboxPolicy {
	mode: SandboxMode;
	cwd: string;
	workspaceRoots: string[]; // 読み取り可能ルート
	writableRoots: string[]; // 書き込み可能ルート（workspace_write のみ）
	network: boolean; // ネットワーク許可（filesystem と独立）
	/**
	 * true の場合、/opt/homebrew と /usr/local への read アクセスを許可する。
	 * Homebrew 経由でインストールされたツール（node, python 等）を
	 * sandbox 内で実行する場合に必要。
	 */
	allowHomebrewPaths?: boolean;
	/**
	 * @internal per-run isolated temp directory.
	 * runSandboxedShellMac が command ごとに作成・終了後に削除する。
	 * system TMPDIR を広く許可しないための機構。
	 */
	_isolatedTempDir?: string;
	/**
	 * @internal 解決済み .git ディレクトリパス群。
	 * pointer file / worktree / submodule の gitdir 解決結果。
	 * これらのパスには write deny rule を適用する。
	 */
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

/** danger_full_access ポリシーを生成する。 */
export function dangerFullAccessPolicy(): SandboxPolicy {
	return {
		mode: "danger_full_access",
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
		case "danger_full_access":
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
		case "danger_full_access":
			return "full-access";
	}
}
