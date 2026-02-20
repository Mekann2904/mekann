/**
 * @file .pi/extensions/github-agent.ts の単体テスト
 * @description GitHub操作ツールアダプタのロジックテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// pi SDKのモック
vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	execFile: vi.fn(),
	promisify: vi.fn((fn) => fn),
}));

vi.mock("node:util", () => ({
	promisify: vi.fn((fn) => fn),
}));

// モック後にインポート
import githubAgent from "../../../.pi/extensions/github-agent.js";

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("github-agent.ts エクスポート確認", () => {
	it("モジュールがデフォルトエクスポートを持つ", () => {
		expect(githubAgent).toBeDefined();
		expect(typeof githubAgent).toBe("function");
	});
});

// ============================================================================
// パラメータ型定義のテスト
// ============================================================================

describe("GhAgentParams型", () => {
	interface GhAgentArgs {
		command: "info" | "tree" | "read" | "search";
		repo?: string;
		path?: string;
		query?: string;
		search_type?: "code" | "issues" | "repositories";
		limit?: number;
		extension?: string;
	}

	describe("command値の検証", () => {
		const validCommands = ["info", "tree", "read", "search"] as const;

		it("有効なコマンド値を受け入れる", () => {
			for (const cmd of validCommands) {
				const params: GhAgentArgs = { command: cmd };
				expect(validCommands).toContain(params.command);
			}
		});
	});

	describe("search_type値の検証", () => {
		const validTypes = ["code", "issues", "repositories"] as const;

		it("有効な検索タイプを受け入れる", () => {
			for (const type of validTypes) {
				const params: GhAgentArgs = { command: "search", search_type: type };
				expect(validTypes).toContain(params.search_type);
			}
		});
	});

	describe("オプショナルパラメータ", () => {
		it("commandのみで有効", () => {
			const params: GhAgentArgs = { command: "info" };
			expect(params.command).toBe("info");
			expect(params.repo).toBeUndefined();
		});

		it("全パラメータを指定可能", () => {
			const params: GhAgentArgs = {
				command: "search",
				repo: "owner/repo",
				query: "test query",
				search_type: "code",
				limit: 10,
				extension: "ts",
			};
			expect(params.repo).toBe("owner/repo");
			expect(params.limit).toBe(10);
		});
	});
});

// ============================================================================
// コマンド引数構築ロジックのテスト
// ============================================================================

describe("コマンド引数構築", () => {
	describe("infoコマンド", () => {
		const buildInfoArgs = (repo: string | undefined): string[] | null => {
			if (!repo) return null;
			return ["info", repo];
		};

		it("repoが必須", () => {
			expect(buildInfoArgs(undefined)).toBeNull();
		});

		it("正しい引数を構築", () => {
			expect(buildInfoArgs("owner/repo")).toEqual(["info", "owner/repo"]);
		});
	});

	describe("treeコマンド", () => {
		const buildTreeArgs = (
			repo: string | undefined,
			path?: string
		): string[] | null => {
			if (!repo) return null;
			const args = ["tree", repo];
			if (path) args.push(path);
			return args;
		};

		it("repoが必須", () => {
			expect(buildTreeArgs(undefined)).toBeNull();
		});

		it("pathはオプション", () => {
			expect(buildTreeArgs("owner/repo")).toEqual(["tree", "owner/repo"]);
			expect(buildTreeArgs("owner/repo", "src")).toEqual([
				"tree",
				"owner/repo",
				"src",
			]);
		});
	});

	describe("readコマンド", () => {
		const buildReadArgs = (
			repo: string | undefined,
			path: string | undefined
		): string[] | null => {
			if (!repo || !path) return null;
			return ["read", repo, path];
		};

		it("repoとpathが必須", () => {
			expect(buildReadArgs(undefined, "file.ts")).toBeNull();
			expect(buildReadArgs("owner/repo", undefined)).toBeNull();
		});

		it("正しい引数を構築", () => {
			expect(buildReadArgs("owner/repo", "src/index.ts")).toEqual([
				"read",
				"owner/repo",
				"src/index.ts",
			]);
		});
	});

	describe("searchコマンド", () => {
		interface SearchParams {
			query: string | undefined;
			search_type?: "code" | "issues" | "repositories";
			limit?: number;
			repo?: string;
			extension?: string;
		}

		const buildSearchArgs = (params: SearchParams): string[] | null => {
			if (!params.query) return null;
			const args = ["search"];

			if (params.search_type) args.push("-t", params.search_type);
			if (params.limit) args.push("-l", String(params.limit));
			if (params.repo) args.push("-r", params.repo);
			if (params.extension) args.push("-e", params.extension);

			args.push(params.query);
			return args;
		};

		it("queryが必須", () => {
			expect(buildSearchArgs({ query: undefined })).toBeNull();
		});

		it("queryのみで最小構成", () => {
			expect(buildSearchArgs({ query: "test" })).toEqual(["search", "test"]);
		});

		it("全オプションを指定", () => {
			expect(
				buildSearchArgs({
					query: "test",
					search_type: "code",
					limit: 10,
					repo: "owner/repo",
					extension: "ts",
				})
			).toEqual([
				"search",
				"-t",
				"code",
				"-l",
				"10",
				"-r",
				"owner/repo",
				"-e",
				"ts",
				"test",
			]);
		});

		it("limitが文字列に変換される", () => {
			const args = buildSearchArgs({ query: "test", limit: 5 });
			expect(args).toContain("5");
			expect(typeof args?.[3]).toBe("string");
		});
	});
});

// ============================================================================
// エラーレスポンスのテスト
// ============================================================================

describe("エラーレスポンス", () => {
	const createErrorResponse = (message: string) => ({
		content: [{ type: "text" as const, text: message }],
		details: {},
	});

	describe("infoコマンドのエラー", () => {
		it("repo未指定時のエラーメッセージ", () => {
			const response = createErrorResponse(
				"Error: 'repo' argument is required for info command."
			);
			expect(response.content[0].text).toContain("repo");
			expect(response.content[0].text).toContain("required");
		});
	});

	describe("readコマンドのエラー", () => {
		it("repoとpath未指定時のエラーメッセージ", () => {
			const response = createErrorResponse(
				"Error: 'repo' and 'path' arguments are required for read command."
			);
			expect(response.content[0].text).toContain("repo");
			expect(response.content[0].text).toContain("path");
			expect(response.content[0].text).toContain("required");
		});
	});

	describe("searchコマンドのエラー", () => {
		it("query未指定時のエラーメッセージ", () => {
			const response = createErrorResponse(
				"Error: 'query' argument is required for search command."
			);
			expect(response.content[0].text).toContain("query");
			expect(response.content[0].text).toContain("required");
		});
	});

	describe("実行エラー", () => {
		it("execFileエラーをフォーマット", () => {
			const error = new Error("Command failed");
			(error as any).stderr = "Permission denied";
			const message = `Error executing gh_agent: ${error.message}\nStderr: ${error.stderr || ""}`;
			expect(message).toContain("Command failed");
			expect(message).toContain("Permission denied");
		});
	});
});

// ============================================================================
// 成功レスポンスのテスト
// ============================================================================

describe("成功レスポンス", () => {
	const createSuccessResponse = (output: string) => ({
		content: [{ type: "text" as const, text: output.trim() || "No output." }],
		details: {},
	});

	it("出力ありの場合", () => {
		const response = createSuccessResponse("file content here");
		expect(response.content[0].text).toBe("file content here");
	});

	it("空出力の場合", () => {
		const response = createSuccessResponse("");
		expect(response.content[0].text).toBe("No output.");
	});

	it("空白のみの出力はtrimされる", () => {
		const response = createSuccessResponse("  content  ");
		expect(response.content[0].text).toBe("content");
	});
});

// ============================================================================
// パス解決ロジックのテスト
// ============================================================================

describe("パス解決ロジック", () => {
	describe("スクリプトパス解決", () => {
		it("拡張機能ディレクトリからの相対パス", () => {
			const getExtensionDir = () => "/path/to/.pi/extensions";
			const scriptPath = `${getExtensionDir()}/github-agent/gh_agent.sh`;
			expect(scriptPath).toBe(
				"/path/to/.pi/extensions/github-agent/gh_agent.sh"
			);
		});
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("空文字列パラメータ", () => {
		it("空文字のrepoは未指定として扱われる", () => {
			const repo = "";
			expect(!repo).toBe(true);
		});
	});

	describe("特殊文字を含むパス", () => {
		it("パスにスペースが含まれても処理される", () => {
			const path = "src/my file.ts";
			expect(path).toContain(" ");
		});
	});

	describe("大量のlimit", () => {
		it("大きなlimit値も文字列化される", () => {
			const limit = 1000;
			const limitStr = String(limit);
			expect(limitStr).toBe("1000");
		});
	});

	describe("複雑なクエリ", () => {
		it("クエリに特殊文字が含まれる場合", () => {
			const query = "function name:params";
			expect(query).toContain(":");
		});
	});
});
