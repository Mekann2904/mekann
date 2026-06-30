/**
 * autoresearch/runner.ts — 実験コントローラの実行層 (barrel)。
 *
 * 歴史的に single file (1000 行超) だった実行層を責務別モジュールに分割した:
 *   - {@link ./runner/types.js}     共有型 (ChecksResult / RunResult / RunManifest)
 *   - {@link ./runner/git.js}       git 操作・run id 生成・auto commit/revert
 *   - {@link ./runner/secrets.js}   秘密情報マスク (redactText)
 *   - {@link ./runner/spawn.js}     プロセス spawn・出力切り詰め
 *   - {@link ./runner/checks.js}    autoresearch.checks.sh 実行
 *   - {@link ./runner/artifacts.js} 成果物ディレクトリ・manifest 読み書き
 *   - {@link ./runner/loop.js}      COMPLETE marker 検出・follow-up メッセージ
 *
 * このファイルは外部公開 API を維持するための再エクスポート口であり、呼び出し元
 * (index.ts / tools/*.ts / *.test.ts) は引き続き `./runner.js` から import できる。
 * 実装の追加・変更は各 sub-module に対して行うこと。
 */

// --- Types (shared across modules) ---
export type { ChecksResult, RunResult, RunManifestChecks, RunManifest } from "./runner/types.js";

// --- Git operations + run id + auto commit/revert ---
export {
	getGitShortHash,
	getGitFullHash,
	isGitDirty,
	getChangedFiles,
	generatePiRunId,
	generateRunId,
	gitAutoCommit,
	stageAutoresearchReportArtifacts,
	gitAutoRevert,
} from "./runner/git.js";

// --- Spawn + truncation ---
export {
	truncateTail,
	runCommand,
	runArgvCommand,
	type ArgvCommand,
} from "./runner/spawn.js";

// --- Checks execution ---
export { runChecks } from "./runner/checks.js";

// --- Artifact directory + manifest ---
export {
	getRunArtifactDir,
	createRunArtifactDir,
	writeRunArtifacts,
	writeChecksArtifacts,
	markArtifactComplete,
	loadRunFromArtifact,
} from "./runner/artifacts.js";

// --- Loop helpers ---
export {
	COMPLETE_MARKER,
	hasCompleteMarker,
	loopFollowUpMessage,
} from "./runner/loop.js";

// --- Re-export from runOutputParser (preserved public surface) ---
export { parseExternalInfo, type ExternalInfo } from "./runOutputParser.js";
