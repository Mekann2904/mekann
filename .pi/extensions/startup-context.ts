/**
 * @abdd.meta
 * path: .pi/extensions/startup-context.ts
 * role: セッション開始時のシステムプロンプト拡張モジュール
 * why: AIエージェントが現在のリポジトリ状態を認識するための動的コンテキスト（Git履歴、ドキュメント等）を自動的に注入するため
 * related: @mariozechner/pi-coding-agent, node:child_process, node:fs
 * public_api: 関数 (pi: ExtensionAPI) => void
 * invariants: セッション開始時に `isFirstPrompt` はtrueであり、`before_agent_start` イベント時に1回のみコンテキストが注入される
 * side_effects: システムプロンプトの書き換え、ファイルシステム読み込み、子プロセス実行
 * failure_modes: Gitコマンド実行時のタイムアウト、READMEファイルの読み取り失敗、非Gitリポジトリ環境でのエラー（いずれも無視して処理続行）
 * @abdd.explain
 * overview: セッションの最初のプロンプト送信前に、Gitの最近のコミットログとREADME.mdの内容をシステムプロンプトへ追記するエクステンション
 * what_it_does:
 *   - `session_start` イベントで初回フラグを立てる
 *   - `before_agent_start` イベントで初回のみ以下の処理を実行する
 *   - カレントワーキングディレクトリのパスを取得する
 *   - `git log` を実行し直近10件のコミットメッセージを取得する
 *   - README.md（大文字小文字の変化を含む）の内容を読み込む
 *   - 収集した情報を整形し、イベントの `systemPrompt` に結合して返す
 * why_it_exists:
 *   - プロジェクトの全体像（README）と最近の変更（Git Log）をエージェントに即座に伝えるため
 *   - ユーザーが毎回手動でコンテキストを貼り付ける手間を削減するため
 *   - エージェントのファイル操作パス解釈を正確にするため
 * scope:
 *   in: ExtensionAPIイベントオブジェクト, コンテキストオブジェクト
 *   out: systemPromptが追記されたイベントオブジェクト
 */

/**
 * Startup Context Extension
 *
 * Injects dynamic context information on the first prompt of each session:
 * - Last 10 git commit messages (title only)
 * - README.md content (full content)
 * - Current working directory path
 *
 * Each section includes usage guidance to help the agent understand
 * how to utilize this context effectively.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// モジュールレベルのフラグ（reload時のリスナー重複登録防止）
let isInitialized = false;

export default function (pi: ExtensionAPI) {
  if (isInitialized) return;
  isInitialized = true;

  let isFirstPrompt = true;

  pi.on("session_start", async (_event, _ctx) => {
    isFirstPrompt = true;
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (!isFirstPrompt) return;
    isFirstPrompt = false;

    const contextParts: string[] = [];

    // Current working directory
    const cwd = process.cwd();
    contextParts.push(
      `## Current Working Directory\n` +
        `\`${cwd}\`\n\n` +
        `> Use this as the base path for all file operations. When referencing files, ` +
        `use paths relative to this directory.`
    );

    // Last 10 git commits (title only)
    try {
      const gitLog = execSync(
        'git log -10 --pretty=format:"%h %s" --no-merges 2>/dev/null',
        { encoding: "utf-8", timeout: 5000, cwd }
      ).trim();
      if (gitLog) {
        contextParts.push(
          `## Recent Git Commits (Last 10)\n` +
            `\`\`\`\n${gitLog}\n\`\`\`\n\n` +
            `> These commits show the recent development activity. Use this context to ` +
            `understand what has been recently worked on, identify related changes, or ` +
            `avoid breaking recent modifications.`
        );
      }
    } catch {
      // Not a git repository or git not available
    }

    // README.md (full content)
    const readmeCandidates = ["README.md", "readme.md", "README", "readme"];
    for (const readmeFile of readmeCandidates) {
      const readmePath = `${cwd}/${readmeFile}`;
      if (existsSync(readmePath)) {
        try {
          const content = readFileSync(readmePath, "utf-8");
          contextParts.push(
            `## README.md\n` +
              `\`\`\`markdown\n${content}\n\`\`\`\n\n` +
              `> The README contains project overview, setup instructions, and usage guidelines. ` +
              `Refer to it for understanding the project structure, available features, and ` +
              `how to work with this codebase.`
          );
          break;
        } catch {
          // Skip if file cannot be read
        }
      }
    }

    if (contextParts.length === 0) return;

    const injectedContext =
      `# Session Startup Context\n\n` +
      `This context is automatically injected at session start to help you understand ` +
      `the project's current state, recent changes, and overall structure.\n\n` +
      `${contextParts.join("\n\n")}\n\n` +
      `---\n` +
      `_End of startup context._`;

    // Append to system prompt instead of injecting a user message
    // This way it's sent to LLM but not displayed in TUI
    return {
      systemPrompt: `${event.systemPrompt}\n\n${injectedContext}`,
    };
  });

  // セッション終了時にリスナー重複登録防止フラグをリセット
  pi.on("session_shutdown", async () => {
    isInitialized = false;
  });
}
