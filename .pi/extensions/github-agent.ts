/**
 * @abdd.meta
 * path: .pi/extensions/github-agent.ts
 * role: GitHub操作ツールのアダプタ
 * why: LLMエージェントからGitHubリポジトリの情報取得、ファイル閲覧、検索を行うためのインターフェースを提供する
 * related: .pi/extensions/github-agent/gh_agent.sh, node:child_process, @mariozechner/pi-coding-agent
 * public_api: execute(_toolCallId, params: GhAgentArgs)
 * invariants: params.commandは["info", "tree", "read", "search"]のいずれかである、shellスクリプトは実行可能である
 * side_effects: 外部プロセス(gh_agent.sh)を実行する、GitHub APIへのリクエストが発生する
 * failure_modes: 必須パラメータ不足によるエラー、shellスクリプト実行失敗、ネットワークエラー、GitHub APIレートリミット
 * @abdd.explain
 * overview: GitHub CLIまたはAPIをラップするシェルスクリプトを呼び出し、リポジトリ探索機能を提供する拡張機能
 * what_it_does:
 *   - info, tree, read, searchコマンドのパラメータ検証と引数構築を行う
 *   - gh_agent.shを子プロセスとして実行し、標準出力を戻り値として返す
 *   - 実行時のエラーを捕捉し、エラーメッセージをフォーマットする
 * why_it_exists:
 *   - GitHub上のコードベースをエージェントが探索可能にする
 *   - シェルスクリプトによる実装詳細(TypeScriptへの直接的な依存)を隠蔽する
 * scope:
 *   in: コマンド種別、リポジトリ指定、パス、検索クエリ、フィルタオプション
 *   out: コマンド実行結果のテキストまたはエラーメッセージ
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
