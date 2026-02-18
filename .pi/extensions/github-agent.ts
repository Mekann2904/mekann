/**
 * @abdd.meta
 * path: .pi/extensions/github-agent.ts
 * role: GitHub リポジトリ探索ツールの Pi エージェント拡張モジュール
 * why: LLM エージェントが gh CLI 経由で GitHub リポジトリの情報取得、ファイルツリー参照、ファイル読み込み、コード/Issue/リポジトリ検索を行えるようにするため
 * related: github-agent/gh_agent.sh, @mariozechner/pi-coding-agent, @sinclair/typebox
 * public_api: default関数（ExtensionAPI を受け取り gh_agent ツールを登録）
 * invariants:
 *   - info/tree コマンド実行時は repo 引数が必須
 *   - read コマンド実行時は repo と path 引数が必須
 *   - search コマンド実行時は query 引数が必須
 *   - コマンド引数は gh_agent.sh に渡される
 * side_effects:
 *   - gh_agent.sh シェルスクリプトを子プロセスとして実行
 *   - 外部ネットワークへの GitHub API 呼び出し（gh CLI 経由）
 * failure_modes:
 *   - 必須引数欠如時にエラーメッセージを返却（ツール実行は継続）
 *   - シェルスクリプト実行失敗時（終了コード非ゼロ）にエラーメッセージと stderr を返却
 *   - stdout が空で stderr のみ存在する場合、stderr の内容を返却
 * @abdd.explain
 * overview: Pi コーディングエージェント用の GitHub 連携ツール拡張。gh CLI をラップし、リポジトリ情報の取得と検索機能を提供する。
 * what_it_does:
 *   - TypeBox スキーマで定義された4種のコマンド（info/tree/read/search）を受け付ける
 *   - コマンド種別に応じて必須引数のバリデーションを行う
 *   - 引数を gh_agent.sh に渡して実行し、結果をテキスト形式で返す
 * why_it_exists:
 *   - LLM エージェントが GitHub 上のソースコードや Issue を参照できるようにするため
 *   - 外部リポジトリの構造や内容を動的に調査する能力をエージェントに付与するため
 * scope:
 *   in: GhAgentParams で定義されたコマンドと引数（command, repo, path, query, search_type, limit, extension）
 *   out: テキスト形式のコンテンツを含むツール実行結果オブジェクト
 */

import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type, type Static } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

const execFileAsync = promisify(execFile);

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
            const scriptPath = path.resolve(__dirname, "github-agent/gh_agent.sh");
            const cmdArgs: string[] = [params.command];

            // Validate and build arguments based on command
            if (params.command === "info") {
                if (!params.repo) return { content: [{ type: "text", text: "Error: 'repo' argument is required for info command." }] };
                cmdArgs.push(params.repo);
            } else if (params.command === "tree") {
                if (!params.repo) return { content: [{ type: "text", text: "Error: 'repo' argument is required for tree command." }] };
                cmdArgs.push(params.repo);
                if (params.path) cmdArgs.push(params.path);
            } else if (params.command === "read") {
                if (!params.repo || !params.path) return { content: [{ type: "text", text: "Error: 'repo' and 'path' arguments are required for read command." }] };
                cmdArgs.push(params.repo);
                cmdArgs.push(params.path);
            } else if (params.command === "search") {
                if (!params.query) return { content: [{ type: "text", text: "Error: 'query' argument is required for search command." }] };
                
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
                     return { content: [{ type: "text", text: `Stderr: ${stderr}` }] };
                }
                
                return {
                    content: [{ type: "text", text: output.trim() || "No output." }]
                };
            } catch (error: any) {
                // execFile throws if exit code is non-zero
                return {
                    content: [{ type: "text", text: `Error executing gh_agent: ${error.message}\nStderr: ${error.stderr || ""}` }]
                };
            }
        }
    });
}
