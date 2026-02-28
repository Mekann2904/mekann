/**
 * @abdd.meta
 * path: .pi/lib/self-improvement/adapters/index.ts
 * role: アダプター層のエクスポート集約
 * why: アダプター層の公開APIを一箇所に集約し、他層からの依存を明確にするため
 * related: ./git-adapter.ts, ./file-adapter.ts, ./prompts.ts
 * public_api: アダプター層のすべての公開API
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: アダプター層のエクスポート集約ファイル
 * what_it_does:
 *   - Gitアダプターの再エクスポート
 *   - ファイルアダプターの再エクスポート
 *   - プロンプト生成の再エクスポート
 * why_it_exists:
 *   - 他層からのインポートを簡素化するため
 * scope:
 *   in: ./git-adapter.ts, ./file-adapter.ts, ./prompts.ts
 *   out: application層
 */

// Gitアダプター
export {
  GitAdapter,
  createGitAdapter,
  EXCLUDE_PATTERNS,
  shouldStageFile,
  generateGitignorePattern,
} from "./git-adapter.js";

// ファイルアダプター
export {
  FileAdapter,
  createFileAdapter,
  generateLogHeader,
  generateCycleLog,
  generateFooterLog,
} from "./file-adapter.js";

// プロンプト生成
export {
  buildLoopMarker,
  parseLoopCycleMarker,
  buildULPhaseMarker,
  parseULPhaseMarker,
  buildAutonomousCyclePrompt,
  buildPerspectivePrompt,
  buildResearchPrompt,
  buildPlanPrompt,
  buildImplementPrompt,
} from "./prompts.js";
