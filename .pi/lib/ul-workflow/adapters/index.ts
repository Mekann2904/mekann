/**
 * @abdd.meta
 * path: .pi/lib/ul-workflow/adapters/index.ts
 * role: Adapters層のエクスポート
 * why: アダプターモジュールへの統一アクセスを提供
 * related: ./storage/file-workflow-repo.ts, ./tools/*.ts
 * public_api: FileWorkflowRepository, すべてのツールファクトリ
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: Adapters層の統一エクスポート
 * what_it_does: アダプターモジュールの再エクスポート
 * why_it_exists: インポートパスの簡素化
 * scope:
 *   in: storage/, tools/
 *   out: infrastructure/extension.ts
 */

// Storage
export { FileWorkflowRepository } from "./storage/file-workflow-repo.js";

// Tools
export { createStartTool } from "./tools/start-tool.js";
export { createStatusTool } from "./tools/status-tool.js";
export { createApproveTool } from "./tools/approve-tool.js";
export { createAbortTool, createResumeTool } from "./tools/abort-resume-tools.js";
export { makeResult, makeError, makeResultWithQuestion, getTaskDir } from "./tools/tool-utils.js";
