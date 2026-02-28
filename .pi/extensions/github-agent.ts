/**
 * @abdd.meta
 * path: .pi/extensions/github-agent.ts
 * role: PIエージェントのためのGitHub操作ツール拡張
 * why: GitHub CLIを介してリポジトリ情報の取得、ファイルツリー閲覧、コンテンツ読み取り、コード検索を行う機能を提供するため
 * related: .pi/extensions/github-agent/gh_agent.sh, @mariozechner/pi-coding-agent
 * public_api: registerTool (name: "gh_agent", parameters: GhAgentParams)
 * invariants: scriptPathは現在のファイル位置からの相対パスで解決される, コマンド種別に応じた必須パラメータが検証される
 * side_effects: 外部プロセス(gh_agent.sh)の実行, ファイルシステムへのアクセス(スクリプト呼び出し)
 * failure_modes: 必須パラメータ欠如によるエラー返却, スクリプト実行失敗(non-zero exit), スクリプト実行時の例外キャッチ
 * @abdd.explain
 * overview: GitHubリポジトリの探索と操作を行うためのシェルスクリプトリレー機能
 * what_it_does:
 *   - GitHubリポジトリのメタデータ取得
 *   - ディレクトリツリーおよびファイル内容の取得
 *   - コード、イシュー、リポジトリの検索
 *   - 外部シェルスクリプト(gh_agent.sh)への引数バリデーションと実行
 * why_it_exists:
 *   - AIエージェントからGitHubデータへアクセスするための標準化されたインターフェースを提供する
 *   - 複雑なGitHub CLI操作をカプセル化し、TypeBoxを通じて型安全な呼び出しを可能にする
 * scope:
 *   in: TypeBoxで定義されたGhAgentParams (command, repo, path, query, search_type, limit, extension)
 *   out: テキスト形式の実行結果 または エラーメッセージ
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { toError } from "../lib/core/error-utils.js";
import { Type, type Static } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

const execFileAsync = promisify(execFile);

// Get directory of this file for resolving sibling resources
// Works in both development and after pi install (jiti preserves import.meta.url)
const getExtensionDir = (): string => {
  const currentFile = fileURLToPath(import.meta.url);
  return dirname(currentFile);
};

const GhAgentParams = Type.Object({
    command: StringEnum(["info", "tree", "read", "search"] as const),
    repo: Type.Optional(Type.String({ description: "Target repository (owner/name)" })),
    path: Type.Optional(Type.String({ description: "File path for read/tree commands" })),
    query: Type.Optional(Type.String({ description: "Search query" })),
    search_type: Type.Optional(StringEnum(["code", "issues", "repositories"] as const)),
    limit: Type.Optional(Type.Integer({ description: "Max results (default: 5)" })),
    extension: Type.Optional(Type.String({ description: "File extension filter for code search" })),
});

type GhAgentArgs = Static<typeof GhAgentParams>;

export default function (pi: ExtensionAPI) {
    pi.registerTool({
        name: "gh_agent",
        label: "GitHub Agent",
        description: "GitHub repository exploration tool. Supports info, tree, read, and search commands.",
        parameters: GhAgentParams,
        
        async execute(_toolCallId, params: GhAgentArgs) {
            // Resolve script relative to this extension file
            const scriptPath = resolve(getExtensionDir(), "github-agent", "gh_agent.sh");
            const cmdArgs: string[] = [params.command];

            // Validate and build arguments based on command
            if (params.command === "info") {
                if (!params.repo) return { content: [{ type: "text", text: "Error: 'repo' argument is required for info command." }], details: {} };
                cmdArgs.push(params.repo);
            } else if (params.command === "tree") {
                if (!params.repo) return { content: [{ type: "text", text: "Error: 'repo' argument is required for tree command." }], details: {} };
                cmdArgs.push(params.repo);
                if (params.path) cmdArgs.push(params.path);
            } else if (params.command === "read") {
                if (!params.repo || !params.path) return { content: [{ type: "text", text: "Error: 'repo' and 'path' arguments are required for read command." }], details: {} };
                cmdArgs.push(params.repo);
                cmdArgs.push(params.path);
            } else if (params.command === "search") {
                if (!params.query) return { content: [{ type: "text", text: "Error: 'query' argument is required for search command." }], details: {} };
                
                if (params.search_type) cmdArgs.push("-t", params.search_type);
                if (params.limit) cmdArgs.push("-l", String(params.limit));
                if (params.repo) cmdArgs.push("-r", params.repo);
                if (params.extension) cmdArgs.push("-e", params.extension);
                
                cmdArgs.push(params.query);
            }

            try {
                // Execute the shell script
                const { stdout, stderr } = await execFileAsync(scriptPath, cmdArgs);
                
                let output = "";
                if (stdout) output += stdout;
                
                // Only include stderr if there is no stdout, or if it looks like an error
                if (!output && stderr) {
                     return { content: [{ type: "text", text: `Stderr: ${stderr}` }], details: {} };
                }
                
                return {
                    content: [{ type: "text", text: output.trim() || "No output." }],
                    details: {},
                };
            } catch (error: unknown) {
                // execFile throws if exit code is non-zero
                const err = toError(error);
                return {
                    content: [{ type: "text", text: `Error executing gh_agent: ${err.message}\nStderr: ${(err as Error & { stderr?: string }).stderr || ""}` }],
                    details: {},
                };
            }
        }
    });
}
