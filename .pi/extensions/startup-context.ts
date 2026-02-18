/**
 * @abdd.meta
 * path: .pi/extensions/startup-context.ts
 * role: セッション開始時に動的コンテキストをシステムプロンプトへ自動注入する拡張モジュール
 * why: AIエージェントがプロジェクトの現状・最近の変更・構造を理解し、文脈に即した応答を行うため
 * related: @mariozechner/pi-coding-agent, node:child_process, node:fs, README.md
 * public_api: default function (ExtensionAPI) => void
 * invariants:
 *   - isFirstPrompt はセッション開始時に true にリセットされる
 *   - 初回プロンプト処理後は isFirstPrompt が false になる
 *   - コンテキスト注入はシステムプロンプトへの追記として行われる（TUIには表示されない）
 * side_effects:
 *   - git log コマンド実行（タイムアウト5秒）
 *   - README.md ファイル読み込み（ファイルシステムアクセス）
 *   - イベントリスナーの登録（session_start, before_agent_start）
 * failure_modes:
 *   - Gitリポジトリ以外で実行された場合、gitコミット情報はスキップされる
 *   - README.md が存在しない、または読み込み権限がない場合、README情報はスキップされる
 *   - すべてのコンテキスト取得に失敗した場合、システムプロンプトは変更されない
 * @abdd.explain
 * overview: セッション初回プロンプト時に、現在の作業ディレクトリ・直近10件のGitコミット・README.mdの内容を収集し、システムプロンプト末尾に自動追加する拡張機能
 * what_it_does:
 *   - session_start イベントで isFirstPrompt フラグを true に初期化
 *   - before_agent_start イベントで初回のみコンテキストを構築して注入
 *   - process.cwd() から作業ディレクトリパスを取得し、ファイル操作の基準パスとして提示
 *   - git log -10 --pretty=format:"%h %s" --no-merges を実行して最近のコミットメッセージを取得
 *   - README.md / readme.md / README / readme の順で存在確認し、最初に見つかったものを読み込み
 *   - 構築したコンテキストをシステムプロンプトに追記して返却
 * why_it_exists:
 *   - セッション開始時にプロジェクトの全体像をAIに提示し、文脈理解を促進するため
 *   - 最近の開発活動を把握させ、不適切な変更や重複作業を防ぐため
 *   - READMEの情報を自動的に参照可能にし、プロジェクト固有の知識を共有するため
 * scope:
 *   in: ExtensionAPI インスタンス、process.cwd()、gitコマンド、READMEファイル
 *   out: システムプロンプトへの追記（文字列）、TUI表示なし
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

export default function (pi: ExtensionAPI) {
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
}
