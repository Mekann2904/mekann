/**
 * FZF Integration Extension for PI Coding Agent
 *
 * fzf (fuzzy finder) を使用したインタラクティブな選択・検索機能
 */

import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

// ============================================
// 型定義
// ============================================

interface FzfItem {
	value: string;
	label?: string;
	description?: string;
}

interface FzfResult {
	selected: string[];
	cancelled: boolean;
}

interface FzfOptions {
	prompt?: string;
	multi?: boolean;
	height?: string;
	preview?: string;
	header?: string;
	ansi?: boolean;
	cycle?: string;
}

// ============================================
// fzfラッパー関数
// ============================================

function runFzf(items: string[], options: FzfOptions = {}, ctx: any): Promise<FzfResult> {
	return new Promise((resolve) => {
		const args: string[] = [];

		if (options.prompt) {
			args.push(`--prompt=${options.prompt}`);
		}

		if (options.multi) {
			args.push("--multi");
			args.push("--bind=ctrl-a:select-all,ctrl-d:deselect-all");
		}

		args.push(`--height=${options.height || "100%"}`);

		if (options.header) {
			args.push(`--header=${options.header}`);
		}

		if (options.ansi) {
			args.push("--ansi");
		}

		if (options.cycle) {
			args.push(`--cycle=${options.cycle}`);
		}

		if (options.preview) {
			args.push(`--preview=${options.preview}`);
			args.push("--preview-window=right:30%");
		}

		args.push("--bind=ctrl-c:cancel");
		args.push("--bind=esc:cancel");

		// TUIがある場合は停止してからfzfを実行
		if (ctx?.ui?.custom) {
			ctx.ui.custom<FzfResult>((tui, _theme, _kb, done) => {
				// TUIを停止してターミナルを解放
				tui.stop();

				// 画面をクリア
				process.stdout.write("\x1b[2J\x1b[H");

				// fzfを実行
				const fzf = spawn("fzf", args, {
					stdio: ["pipe", "pipe", "inherit"],
				});

				let stdout = "";

				fzf.stdout.on("data", (data) => {
					stdout += data.toString();
				});

				fzf.on("close", (code) => {
					let result: FzfResult;

					if (code === 130 || code === 1) {
						result = { selected: [], cancelled: true };
					} else if (code === 0) {
						const selected = stdout.trim().split("\n").filter(Boolean);
						result = { selected, cancelled: false };
					} else {
						result = { selected: [], cancelled: true };
					}

					// TUIを再開
					tui.start();
					tui.requestRender(true);

					// 完了を通知して結果を渡す
					done(result);
				});

				fzf.on("error", () => {
					const result = { selected: [], cancelled: true };
					tui.start();
					tui.requestRender(true);
					done(result);
				});

				// 入力を書き込む
				if (items.length > 0) {
					fzf.stdin.write(items.join("\n"));
				}
				fzf.stdin.end();

				// 保留中のコンポーネント
				return { render: () => [], invalidate: () => {} };
			}).then((result) => {
				if (result) {
					resolve(result);
				} else {
					resolve({ selected: [], cancelled: true });
				}
			});
		} else {
			// TUIがない場合は直接実行
			const fzf = spawn("fzf", args, {
				stdio: ["pipe", "pipe", "inherit"],
			});

			let stdout = "";

			fzf.stdout.on("data", (data) => {
				stdout += data.toString();
			});

			fzf.on("close", (code) => {
				if (code === 130 || code === 1) {
					resolve({ selected: [], cancelled: true });
				} else if (code === 0) {
					const selected = stdout.trim().split("\n").filter(Boolean);
					resolve({ selected, cancelled: false });
				} else {
					resolve({ selected: [], cancelled: true });
				}
			});

			fzf.on("error", () => {
				resolve({ selected: [], cancelled: true });
			});

			if (items.length > 0) {
				fzf.stdin.write(items.join("\n"));
			}
			fzf.stdin.end();
		}
	});
}

// ============================================
// ユーティリティ関数
// ============================================

// デフォルトで除外するディレクトリ・ファイルパターン
const DEFAULT_IGNORE_PATTERNS = [
	"node_modules/**",
	".git/**",
	".DS_Store",
	"dist/**",
	"build/**",
	"coverage/**",
	".next/**",
	".nuxt/**",
	".vscode/**",
	".idea/**",
	"*.log",
	".pi/node_modules/**",
];

/**
 * .gitignoreファイルを読み込んで除外パターンを取得
 */
async function loadGitignorePatterns(dirPath: string): Promise<string[]> {
	const { readFile } = await import("node:fs/promises");
	const { join } = await import("node:path");

	const patterns = [...DEFAULT_IGNORE_PATTERNS];

	try {
		const gitignorePath = join(dirPath, ".gitignore");
		const content = await readFile(gitignorePath, "utf-8");

		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			// コメントと空行をスキップ
			if (!trimmed || trimmed.startsWith("#")) continue;
			// ネガティブパターン(!)はスキップ（簡易実装のため）
			if (trimmed.startsWith("!")) continue;
			// ディレクトリ指定(末尾の/)を**に変換
			const pattern = trimmed.endsWith("/") ? `${trimmed}**` : trimmed;
			patterns.push(pattern);
		}
	} catch {
		// .gitignoreがない場合はデフォルトパターンのみ
	}

	return patterns;
}

/**
 * パスが除外パターンにマッチするかチェック
 */
function isPathIgnored(path: string, baseDir: string, patterns: string[]): boolean {
	const relativePath = path.replace(`${baseDir}${path.startsWith(baseDir) ? "" : "/"}`, "").replace(/^\//, "");
	const parts = relativePath.split("/");

	for (const pattern of patterns) {
		if (testPattern(relativePath, parts, pattern)) {
			return true;
		}
	}

	return false;
}

/**
 * パターンとパスのマッチングテスト
 */
function testPattern(path: string, parts: string[], pattern: string): boolean {
	// **をマルチセグメントワイルドカードとして変換
	const regexPattern = pattern
		.replace(/\*\*/g, ".*")
		.replace(/\*/g, "[^/]*")
		.replace(/\?/g, "[^/]")
		.replace(/\./g, "\\.");

	try {
		const regex = new RegExp(`^${regexPattern}$`);
		return regex.test(path);
	} catch {
		return false;
	}
}

async function scanFiles(
	dirPath: string,
	options: {
		recursive?: boolean;
		pattern?: string;
		includeHidden?: boolean;
		useGitignore?: boolean;
	} = {}
): Promise<string[]> {
	const { recursive = true, pattern, includeHidden = true, useGitignore = true } = options;
	const results: string[] = [];

	// .gitignoreパターンを読み込み
	const ignorePatterns = useGitignore ? await loadGitignorePatterns(dirPath) : [];

	async function scan(currentPath: string, currentDepth: number) {
		if (!recursive && currentDepth > 0) return;

		try {
			const entries = await readdir(currentPath, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = join(currentPath, entry.name);

				// .gitignoreチェック
				if (useGitignore && isPathIgnored(fullPath, dirPath, ignorePatterns)) {
					continue;
				}

				if (!includeHidden && entry.name.startsWith(".")) {
					continue;
				}

				if (entry.isDirectory()) {
					await scan(fullPath, currentDepth + 1);
				} else if (entry.isFile()) {
					if (pattern) {
						const regex = new RegExp(
							pattern.replace(/\*/g, ".*").replace(/\?/g, ".")
						);
						if (!regex.test(entry.name)) {
							continue;
						}
					}
					results.push(fullPath);
				}
			}
		} catch {
			// Skip unreadable directories
		}
	}

	await scan(dirPath, 0);
	return results;
}

async function scanDirectories(
	dirPath: string,
	options: {
		recursive?: boolean;
		includeHidden?: boolean;
		useGitignore?: boolean;
	} = {}
): Promise<string[]> {
	const { recursive = false, includeHidden = true, useGitignore = true } = options;
	const results: string[] = [];

	// .gitignoreパターンを読み込み
	const ignorePatterns = useGitignore ? await loadGitignorePatterns(dirPath) : [];

	async function scan(currentPath: string, currentDepth: number) {
		if (!recursive && currentDepth > 0) return;

		try {
			const entries = await readdir(currentPath, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = join(currentPath, entry.name);

				// .gitignoreチェック
				if (useGitignore && isPathIgnored(fullPath, dirPath, ignorePatterns)) {
					continue;
				}

				if (!includeHidden && entry.name.startsWith(".")) {
					continue;
				}

				if (entry.isDirectory()) {
					results.push(fullPath);
					await scan(fullPath, currentDepth + 1);
				}
			}
		} catch {
			// Skip unreadable directories
		}
	}

	await scan(dirPath, 0);
	return results;
}

async function getGitFiles(cwd: string): Promise<string[]> {
	return new Promise((resolve) => {
		const git = spawn("git", ["ls-files"], { cwd });

		let stdout = "";

		git.stdout.on("data", (data) => {
			stdout += data.toString();
		});

		git.on("close", (code) => {
			if (code === 0) {
				const files = stdout
					.trim()
					.split("\n")
					.filter(Boolean)
					.map((f) => join(cwd, f));
				resolve(files);
			} else {
				resolve([]);
			}
		});

		git.on("error", () => {
			resolve([]);
		});
	});
}

async function getGitBranches(cwd: string): Promise<string[]> {
	return new Promise((resolve) => {
		const git = spawn("git", ["branch", "-a"], { cwd });

		let stdout = "";

		git.stdout.on("data", (data) => {
			stdout += data.toString();
		});

		git.on("close", (code) => {
			if (code === 0) {
				const branches = stdout
					.trim()
					.split("\n")
					.map((line) => line.trim().replace(/^\*?\s*/, ""))
					.filter(Boolean);
				resolve(branches);
			} else {
				resolve([]);
			}
		});

		git.on("error", () => {
			resolve([]);
		});
	});
}

function formatPath(path: string, baseDir: string): string {
	return relative(baseDir, path);
}

function formatItem(
	item: string,
	_cwd: string,
	options: { colorize?: boolean } = {}
): string {
	if (!options.colorize) return item;

	const ext = item.split(".").pop()?.toLowerCase();
	const colorMap: Record<string, string> = {
		ts: "\x1b[34m", // blue
		js: "\x1b[33m", // yellow
		py: "\x1b[32m", // green
		md: "\x1b[36m", // cyan
		json: "\x1b[35m", // magenta
		yaml: "\x1b[35m",
		yml: "\x1b[35m",
		txt: "\x1b[37m", // white
	};
	const color = colorMap[ext || ""] || "\x1b[90m"; // gray
	return `${color}${item}\x1b[0m`;
}

// ============================================
// メイン拡張機能
// ============================================

export default function (pi: ExtensionAPI) {
	try {
		if (!pi) {
			console.error("fzf extension: pi object is null");
			return;
		}

		const ItemType = Type.Object({
			value: Type.String({ description: "値" }),
			label: Type.Optional(Type.String({ description: "表示ラベル" })),
			description: Type.Optional(Type.String({ description: "説明文" })),
		});

		// ============================================
		// 共通実行ロジック
		// ============================================

		async function executeFzf(
			type: "files" | "directories" | "list" | "git-files" | "git-branches",
			options: {
				mode?: "single" | "multi";
				items?: FzfItem[];
				itemsRaw?: string[];
				pattern?: string;
				recursive?: boolean;
				useGitignore?: boolean;
				prompt?: string;
				preview?: string;
				header?: string;
				cwd?: string;
			},
			ctx: any
		): Promise<{ selected: string[]; cancelled: boolean }> {
			if (!ctx) {
				return { selected: [], cancelled: true };
			}

			const cwd = options.cwd || ctx.cwd;
			const multi = options.mode === "multi";
			const itemsRaw: string[] = [];
			const itemsWithLabels: FzfItem[] = [];

			switch (type) {
				case "files": {
					const files = await scanFiles(cwd, {
						recursive: options.recursive ?? true,
						pattern: options.pattern,
						useGitignore: options.useGitignore ?? true,
					});
					itemsRaw.push(...files.map((f) => formatPath(f, cwd)));
					break;
				}

				case "directories": {
					const dirs = await scanDirectories(cwd, {
						recursive: options.recursive ?? false,
						useGitignore: options.useGitignore ?? true,
					});
					itemsRaw.push(...dirs.map((d) => formatPath(d, cwd)));
					break;
				}

				case "list": {
					if (options.items && options.items.length > 0) {
						itemsWithLabels.push(...options.items);
					} else if (options.itemsRaw && options.itemsRaw.length > 0) {
						itemsRaw.push(...options.itemsRaw);
					}
					break;
				}

				case "git-files": {
					const gitFiles = await getGitFiles(cwd);
					itemsRaw.push(...gitFiles.map((f) => formatPath(f, cwd)));
					break;
				}

				case "git-branches": {
					const branches = await getGitBranches(cwd);
					itemsRaw.push(...branches);
					break;
				}
			}

			let fzfItems: string[];

			if (itemsWithLabels.length > 0) {
				fzfItems = itemsWithLabels.map((item) => {
					const label = item.label || item.value;
					const desc = item.description ? ` \x1b[90m# ${item.description}\x1b[0m` : "";
					return `${label}${desc}`;
				});
			} else {
				fzfItems = itemsRaw;
			}

			if (fzfItems.length === 0) {
				return { selected: [], cancelled: true };
			}

			const coloredItems = fzfItems.map((item) =>
				formatItem(item, cwd, { colorize: true })
			);

			const result = await runFzf(coloredItems, {
				prompt: options.prompt || "> ",
				multi,
				header: options.header,
				preview: options.preview,
				ansi: true,
			}, ctx);

			const cleanSelected = result.selected.map((s) =>
				s.replace(/\x1b\[[0-9;]*m/g, "").trim()
			);

			if (result.cancelled || cleanSelected.length === 0) {
				return { selected: [], cancelled: true };
			}

			let finalSelected: string[];
			if (itemsWithLabels.length > 0) {
				finalSelected = cleanSelected.map((selected) => {
					const opt = itemsWithLabels.find((o) => {
						const label = o.label || o.value;
						return selected.startsWith(label);
					});
					return opt?.value || selected;
				});
			} else {
				finalSelected = cleanSelected;
			}

			return { selected: finalSelected, cancelled: false };
		}

		// ============================================
		// ツール: fzf
		// ============================================
		pi.registerTool({
			name: "fzf",
			label: "fzf検索",
			description: "fzfを使用してアイテムをインタラクティブに選択します",
			parameters: Type.Object({
				type: StringEnum(["files", "directories", "list", "git-files", "git-branches"] as const, {
					description: "選択対象のタイプ",
				}),
				mode: Type.Optional(StringEnum(["single", "multi"] as const, { description: "選択モード" })),
				items: Type.Optional(
					Type.Array(ItemType, { description: "type=listの場合のアイテム一覧" })
				),
				itemsRaw: Type.Optional(
					Type.Array(Type.String(), { description: "type=listの場合のシンプルな文字列配列" })
				),
				pattern: Type.Optional(
					Type.String({ description: "ファイル/ディレクトリのフィルタパターン（glob形式）" })
				),
				recursive: Type.Optional(
					Type.Boolean({ description: "再帰的に検索するかどうか" })
				),
				useGitignore: Type.Optional(
					Type.Boolean({ description: ".gitignoreに従ってファイルを除外する" })
				),
				prompt: Type.Optional(
					Type.String({ description: "fzfのプロンプト文字列" })
				),
				preview: Type.Optional(
					Type.String({ description: "fzfのプレビューコマンド" })
				),
				header: Type.Optional(
					Type.String({ description: "fzfのヘッダー文字列" })
				),
				cwd: Type.Optional(
					Type.String({ description: "作業ディレクトリ（省略時はプロジェクトルート）" })
				),
			}),

			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				if (!ctx?.hasUI) {
					return {
						content: [{ type: "text" as const, text: "UIが利用できません" }],
						details: { selected: [], cancelled: true },
					};
				}

				const result = await executeFzf(params.type, params, ctx);

				if (result.cancelled) {
					return {
						content: [{ type: "text" as const, text: "キャンセルしました" }],
						details: { selected: [], cancelled: true },
					};
				}

				return {
					content: [{ type: "text" as const, text: `選択: ${result.selected.join(", ")}` }],
					details: { selected: result.selected, cancelled: false },
				};
			},
		});

		// ============================================
		// スラッシュコマンド: /fzf
		// ============================================
		pi.registerCommand("fzf", {
			description: "fzfによるGit管理ファイルのファジー検索・選択",
			handler: async (_args, ctx) => {
				if (!ctx?.hasUI) {
					return;
				}

				const result = await executeFzf("git-files", {
					mode: "multi",
					prompt: "Git Files> ",
					header: "Git tracked files",
				}, ctx);

				if (result.selected.length > 0) {
					const text = result.selected.join("\n");
					ctx.ui.pasteToEditor(text);
					ctx.ui.notify(`${result.selected.length}ファイルを選択しました`, "success");
				}
			},
		});

		// ============================================
		// セッション開始時の通知
		// ============================================
		if (pi.on) {
			pi.on("session_start", async (_event, ctx) => {
				if (ctx?.ui) {
					ctx.ui.notify("fzf統合拡張が読み込まれました", "info");
				}
			});
		}
	} catch (error) {
		console.error("fzf extension error:", error);
	}
}
