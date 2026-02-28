/**
 * @abdd.meta
 * path: .pi/lib/self-improvement/adapters/git-adapter.ts
 * role: Git操作のアダプター実装
 * why: クリーンアーキテクチャのInterface Adapters層として、Git操作の詳細をカプセル化するため
 * related: ../domain/types.ts, ./file-adapter.ts
 * public_api: GitAdapter, createGitAdapter, EXCLUDE_PATTERNS, shouldStageFile, generateGitignorePattern
 * invariants: gitコマンドは指定されたcwdで実行される
 * side_effects: Gitリポジトリの状態変更、ファイルシステムへの変更
 * failure_modes: gitコマンドの失敗、権限エラー
 * @abdd.explain
 * overview: Git操作のアダプター実装
 * what_it_does:
 *   - gitコマンドの実行
 *   - 変更ファイルの取得
 *   - コミットの作成
 *   - 除外パターンの判定
 * why_it_exists:
 *   - Git操作の詳細をドメイン層から隠蔽し、テスト可能にするため
 * scope:
 *   in: ../domain/types.ts
 *   out: application層
 */

import { spawn } from "node:child_process";
import type { GitOperations, GitCommandResult } from "../domain/types.js";

// ============================================================================
// 除外パターン
// ============================================================================

/**
 * 除外すべきファイルパターン
 * git-workflowスキル準拠: 機密情報、ビルド成果物、キャッシュを除外
 */
export const EXCLUDE_PATTERNS = [
  /\.env$/,
  /\.env\./,
  /credentials/i,
  /secrets?\.json$/i,
  /node_modules\//,
  /dist\//,
  /build\//,
  /\.cache\//,
  /\.log$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
];

/**
 * ファイルがステージング対象かどうかを判定する
 * @summary ステージング判定
 * @param filePath ファイルパス
 * @returns ステージング対象の場合はtrue
 */
export function shouldStageFile(filePath: string): boolean {
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(filePath)) {
      console.log(`[git-adapter] Excluding file from staging: ${filePath}`);
      return false;
    }
  }
  return true;
}

/**
 * 除外パターンに対応する.gitignoreエントリを生成する
 * @summary .gitignoreパターンを生成
 * @param filePath 除外対象のファイルパス
 * @returns .gitignoreに追加すべきパターン
 */
export function generateGitignorePattern(filePath: string): string | null {
  // 環境変数ファイル
  if (/\.env$/.test(filePath) || /\.env\./.test(filePath)) {
    return ".env*";
  }
  // 認証情報ファイル
  if (/credentials/i.test(filePath) || /secrets?\.json$/i.test(filePath)) {
    return "*.credentials.json\n*secrets.json";
  }
  // ログファイル
  if (/\.log$/.test(filePath)) {
    return "*.log";
  }
  // キャッシュディレクトリ
  if (/\.cache\//.test(filePath)) {
    return ".cache/";
  }
  // それ以外はファイル自体を追加
  return null;
}

// ============================================================================
// GitAdapter クラス
// ============================================================================

/**
 * Git操作のアダプター実装
 * 
 * git-workflowスキル準拠:
 * - git add -A / git add . は使用せず、変更ファイルを個別にステージング
 * - コミットメッセージは日本語
 * - 機密情報・ビルド成果物は除外
 */
export class GitAdapter implements GitOperations {
  /**
   * gitコマンドを実行する
   * @summary gitコマンドを実行
   * @param args gitコマンドの引数
   * @param cwd 作業ディレクトリ
   * @returns コマンド実行結果
   */
  async runGitCommand(args: string[], cwd: string): Promise<GitCommandResult> {
    return new Promise((resolve) => {
      const proc = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => { stdout += data.toString(); });
      proc.stderr.on("data", (data) => { stderr += data.toString(); });

      proc.on("close", (code) => {
        resolve({ stdout, stderr, code: code ?? 1 });
      });

      proc.on("error", () => {
        resolve({ stdout: "", stderr: "Failed to spawn git process", code: 1 });
      });
    });
  }

  /**
   * 変更されたファイル一覧を取得する
   * @summary 変更ファイル一覧を取得
   * @param cwd 作業ディレクトリ
   * @returns 変更されたファイルパスの配列
   */
  async getChangedFiles(cwd: string): Promise<string[]> {
    const result = await this.runGitCommand(["status", "--porcelain"], cwd);
    if (result.code !== 0) {
      return [];
    }

    const files: string[] = [];
    for (const line of result.stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // XY PATH形式（X=インデックス、Y=作業ツリーの状態）
      const match = trimmed.match(/^[MADRC?!\s]{2}\s+(.+)$/);
      if (match && match[1]) {
        const filePath = match[1].trim();
        // リネームの場合は "old -> new" 形式になるので new を取得
        const actualPath = filePath.includes(" -> ") 
          ? filePath.split(" -> ")[1] 
          : filePath;
        if (actualPath) {
          files.push(actualPath);
        }
      }
    }

    return files;
  }

  /**
   * 変更差分の詳細を取得する
   * @summary 差分サマリーを取得
   * @param cwd 作業ディレクトリ
   * @returns 統計情報と変更ファイル一覧
   */
  async getDiffSummary(cwd: string): Promise<{ stats: string; changes: string }> {
    // 統計情報
    const statsResult = await this.runGitCommand(["diff", "--stat"], cwd);
    const stats = statsResult.stdout.trim();

    // 変更ファイル一覧
    const changesResult = await this.runGitCommand(["status", "--short"], cwd);
    const changes = changesResult.stdout.trim();

    return { stats, changes };
  }

  /**
   * コミットを作成する
   * @summary コミットを作成
   * @param message コミットメッセージ
   * @param cwd 作業ディレクトリ
   * @returns コミットハッシュまたはnull
   */
  async createCommit(message: string, cwd: string): Promise<string | null> {
    try {
      // 変更ファイル一覧を取得
      const changedFiles = await this.getChangedFiles(cwd);
      
      if (changedFiles.length === 0) {
        console.log("[git-adapter] No changes to commit");
        return null;
      }

      // 除外パターンを適用してステージング対象を絞り込み
      const filesToStage = changedFiles.filter(shouldStageFile);
      
      if (filesToStage.length === 0) {
        console.log("[git-adapter] All changed files are excluded from staging");
        return null;
      }

      console.log(`[git-adapter] Staging ${filesToStage.length} files`);

      // 個別にファイルをステージング（git add -A を使用しない）
      for (const file of filesToStage) {
        const addResult = await this.runGitCommand(["add", file], cwd);
        if (addResult.code !== 0) {
          console.warn(`[git-adapter] Failed to stage ${file}: ${addResult.stderr}`);
        }
      }

      // ステージング内容を確認
      const stagedResult = await this.runGitCommand(["diff", "--staged", "--stat"], cwd);
      if (stagedResult.stdout.trim().length === 0) {
        console.log("[git-adapter] No staged changes after filtering");
        return null;
      }

      // コミット作成
      const result = await this.runGitCommand(["commit", "-m", message], cwd);

      if (result.code === 0) {
        // コミットハッシュを取得
        const hashResult = await this.runGitCommand(["rev-parse", "HEAD"], cwd);
        const hash = hashResult.stdout.trim().slice(0, 7);
        console.log(`[git-adapter] Commit created: ${hash}`);
        return hash;
      }

      // 変更なしエラー
      if (result.stderr.includes("nothing to commit")) {
        return null;
      }

      console.warn(`[git-adapter] Git commit warning: ${result.stderr}`);
      return null;
    } catch (error: unknown) {
      console.error(`[git-adapter] Git operation failed: ${error}`);
      return null;
    }
  }

  /**
   * 指定したファイルのみをステージングしてコミットする
   * @summary 選択的ステージングとコミット
   * @param files ステージングするファイル
   * @param message コミットメッセージ
   * @param cwd 作業ディレクトリ
   * @returns コミットハッシュまたはnull
   */
  async stageAndCommit(
    files: string[],
    message: string,
    cwd: string
  ): Promise<string | null> {
    // 除外パターンを適用
    const filesToStage = files.filter(shouldStageFile);
    
    if (filesToStage.length === 0) {
      console.log("[git-adapter] No files to stage after filtering");
      return null;
    }

    // ステージング
    for (const file of filesToStage) {
      await this.runGitCommand(["add", file], cwd);
    }

    // コミット
    return this.createCommit(message, cwd);
  }

  /**
   * 現在のHEADコミットハッシュを取得する
   * @summary HEADハッシュを取得
   * @param cwd 作業ディレクトリ
   * @returns コミットハッシュ（短縮形式）
   */
  async getHeadHash(cwd: string): Promise<string | null> {
    const result = await this.runGitCommand(["rev-parse", "--short", "HEAD"], cwd);
    if (result.code === 0) {
      return result.stdout.trim();
    }
    return null;
  }
}

/**
 * GitAdapterのファクトリ関数
 * @summary GitAdapterを作成
 * @returns GitAdapterのインスタンス
 */
export function createGitAdapter(): GitAdapter {
  return new GitAdapter();
}
