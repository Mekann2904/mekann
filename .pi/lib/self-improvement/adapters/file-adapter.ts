/**
 * @abdd.meta
 * path: .pi/lib/self-improvement/adapters/file-adapter.ts
 * role: ファイル操作のアダプター実装
 * why: クリーンアーキテクチャのInterface Adapters層として、ファイル操作の詳細をカプセル化するため
 * related: ../domain/types.ts, ./git-adapter.ts
 * public_api: FileAdapter, createFileAdapter
 * invariants: ファイルパスは絶対パスまたはCWDからの相対パス
 * side_effects: ファイルシステムへの読み書き
 * failure_modes: ファイルが存在しない、権限エラー
 * @abdd.explain
 * overview: ファイル操作のアダプター実装
 * what_it_does:
 *   - ファイルの読み書き
 *   - ディレクトリの作成
 *   - ログファイルの管理
 * why_it_exists:
 *   - ファイル操作の詳細をドメイン層から隠蔽し、テスト可能にするため
 * scope:
 *   in: ../domain/types.ts
 *   out: application層
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { FileOperations } from "../domain/types.js";

// ============================================================================
// FileAdapter クラス
// ============================================================================

/**
 * ファイル操作のアダプター実装
 */
export class FileAdapter implements FileOperations {
  private cwd: string;

  /**
   * @param cwd 作業ディレクトリ（デフォルト: process.cwd()）
   */
  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  /**
   * ファイルが存在するか確認する
   * @summary ファイル存在確認
   * @param path ファイルパス
   * @returns 存在する場合はtrue
   */
  exists(path: string): boolean {
    const absolutePath = this.resolvePath(path);
    return existsSync(absolutePath);
  }

  /**
   * ファイルを読み込む
   * @summary ファイル読み込み
   * @param path ファイルパス
   * @returns ファイル内容
   */
  readFile(path: string): string {
    const absolutePath = this.resolvePath(path);
    return readFileSync(absolutePath, "utf-8");
  }

  /**
   * ファイルに書き込む
   * @summary ファイル書き込み
   * @param path ファイルパス
   * @param content 書き込む内容
   */
  writeFile(path: string, content: string): void {
    const absolutePath = this.resolvePath(path);
    // 親ディレクトリを確保
    this.ensureDirForFile(absolutePath);
    writeFileSync(absolutePath, content, "utf-8");
  }

  /**
   * ファイルに追記する
   * @summary ファイル追記
   * @param path ファイルパス
   * @param content 追記する内容
   */
  appendFile(path: string, content: string): void {
    const absolutePath = this.resolvePath(path);
    // 親ディレクトリを確保
    this.ensureDirForFile(absolutePath);
    appendFileSync(absolutePath, content, "utf-8");
  }

  /**
   * ディレクトリを作成する
   * @summary ディレクトリ作成
   * @param path ディレクトリパス
   */
  ensureDir(path: string): void {
    const absolutePath = this.resolvePath(path);
    if (!existsSync(absolutePath)) {
      mkdirSync(absolutePath, { recursive: true });
    }
  }

  /**
   * パスを絶対パスに解決する
   * @summary パス解決
   * @param path 相対パスまたは絶対パス
   * @returns 絶対パス
   */
  resolvePath(path: string): string {
    if (path.startsWith("/")) {
      return path;
    }
    return resolve(this.cwd, path);
  }

  /**
   * ファイルの親ディレクトリを作成する
   * @summary 親ディレクトリ作成
   * @param filePath ファイルパス
   */
  private ensureDirForFile(filePath: string): void {
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

// ============================================================================
// ログファイル管理
// ============================================================================

/**
 * ログファイルのヘッダーを生成する
 * @summary ログヘッダーを生成
 * @param runId 実行ID
 * @param task タスク内容
 * @param maxCycles 最大サイクル数
 * @param autoCommit 自動コミット有無
 * @param ulMode ULモード有無
 * @param autoApprove 自動承認有無
 * @param modelInfo モデル情報
 * @returns ログヘッダー文字列
 */
export function generateLogHeader(
  runId: string,
  task: string,
  maxCycles: number,
  autoCommit: boolean,
  ulMode: boolean,
  autoApprove: boolean,
  modelInfo: { provider: string; id: string }
): string {
  return `# Self Improvement Autonomous Loop

- Run ID: ${runId}
- Started At: ${new Date().toISOString()}
- Task: ${task}
- Max Cycles: ${maxCycles === Infinity ? "Infinity" : maxCycles}
- Auto Commit: ${autoCommit ? "true" : "false"}
- UL Mode: ${ulMode ? "true" : "false"}
- Auto Approve: ${autoApprove ? "true" : "false"}
- Model: ${modelInfo.provider}/${modelInfo.id}

## Timeline
`;
}

/**
 * サイクルログを生成する
 * @summary サイクルログを生成
 * @param cycleNumber サイクル番号
 * @param timestamp タイムスタンプ
 * @param commitHash コミットハッシュ
 * @param perspectiveResults 視座結果
 * @param summary サマリー
 * @param shouldContinue 継続判定
 * @param stopReason 停止理由
 * @returns サイクルログ文字列
 */
export function generateCycleLog(
  cycleNumber: number,
  timestamp: string,
  commitHash: string | null,
  perspectiveResults: Array<{
    perspective: string;
    score: number;
    findings: string[];
    questions: string[];
    improvements: string[];
  }>,
  summary: string,
  shouldContinue: boolean,
  stopReason: string | null
): string {
  let content = `### Cycle ${cycleNumber}

**Timestamp**: ${timestamp}
**Commit**: ${commitHash ?? "none"}

`;

  for (const pr of perspectiveResults) {
    content += `#### ${pr.perspective}

**Score**: ${(pr.score * 100).toFixed(0)}%

**Findings**:
${pr.findings.length > 0 ? pr.findings.map((f) => `- ${f}`).join("\n") : "(none)"}

**Questions**:
${pr.questions.length > 0 ? pr.questions.map((q) => `- ${q}`).join("\n") : "(none)"}

**Improvements**:
${pr.improvements.length > 0 ? pr.improvements.map((i) => `- ${i}`).join("\n") : "(none)"}

`;
  }

  content += `**Summary**: ${summary}

**Continue**: ${shouldContinue ? "yes" : `no (reason: ${stopReason ?? "unknown"})`}

---

`;

  return content;
}

/**
 * フッターログを生成する
 * @summary フッターログを生成
 * @param state ループ状態
 * @returns フッターログ文字列
 */
export function generateFooterLog(state: {
  lastUpdatedAt: string;
  currentCycle: number;
  totalImprovements: number;
  stopReason: string | null;
  lastCommitHash: string | null;
  summary: string;
  perspectiveStates: Array<{
    displayName: string;
    score: number;
    findings: length;
    improvements: length;
  }>;
}): string {
  return `

## Execution Complete

| Item | Value |
|------|-------|
| End Time | ${state.lastUpdatedAt} |
| Total Cycles | ${state.currentCycle} |
| Total Improvements | ${state.totalImprovements} |
| Stop Reason | ${state.stopReason ?? "completed"} |
| Last Commit | ${state.lastCommitHash ?? "none"} |

## Final Summary

${state.summary}

## Final Perspective Scores

| Perspective | Score | Findings | Improvements |
|-------------|-------|----------|--------------|
${state.perspectiveStates.map((ps) => `| ${ps.displayName} | ${(ps.score * 100).toFixed(0)}% | ${ps.findings.length} | ${ps.improvements.length} |`).join("\n")}

---

*This log was auto-generated by the self-improvement-loop.*
`;
}

/**
 * FileAdapterのファクトリ関数
 * @summary FileAdapterを作成
 * @param cwd 作業ディレクトリ
 * @returns FileAdapterのインスタンス
 */
export function createFileAdapter(cwd?: string): FileAdapter {
  return new FileAdapter(cwd);
}
