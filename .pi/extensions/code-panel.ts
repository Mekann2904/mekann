/**
 * @abdd.meta
 * path: .pi/extensions/code-panel.ts
 * role: オーバーレイパネルでコードを表示するコマンドを提供する拡張機能
 * why: エージェントがモダンなサイドパネルUIでコードをハイライト表示するため
 * related: @mariozechner/pi-ai, @mariozechner/pi-coding-agent, @mariozechner/pi-tui, code-viewer.ts
 * public_api: /code-panel コマンド
 * invariants: なし
 * side_effects: なし（読み取り専用）
 * failure_modes: コードまたはファイルパスが無効
 * @abdd.explain
 * overview: オーバーレイパネルでシンタックスハイライト付きのコードを表示するコマンドを提供する
 * what_it_does:
 *   - コード文字列またはファイルパスを受け取り、オーバーレイパネルで表示する
 *   - シンタックスハイライトと行番号を適用
 *   - ESC または q キーでパネルを閉じる
 * why_it_exists:
 *   - モダンなオーバーレイUI体験を提供するため
 *   - コードを見やすくハイライト表示するため
 * scope:
 *   in: ExtensionAPI, コード文字列/ファイルパス, 言語
 *   out: オーバーレイパネルでのハイライト付きコード表示
 */

/**
 * Code Panel Extension
 *
 * Provides a /code-panel command for displaying code in an overlay side panel
 * with syntax highlighting and line numbers.
 *
 * Usage:
 *   /code-panel code:"const x = 1;" language:typescript
 *   /code-panel path:src/main.ts
 */

import * as fs from "node:fs";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { highlightCode, getLanguageFromPath } from "@mariozechner/pi-coding-agent";
import { Container, Text, matchesKey } from "@mariozechner/pi-tui";

/**
 * @summary 行番号付きでコードをフォーマット
 * @param lines - コード行の配列
 * @param startLine - 開始行番号（デフォルト1）
 * @param theme - テーマオブジェクト
 * @returns フォーマット済み行文字列の配列
 */
function formatLinesWithNumbers(
	lines: string[],
	startLine: number,
	theme: { fg: (color: string, text: string) => string }
): string[] {
	const maxLineNum = startLine + lines.length - 1;
	const width = maxLineNum.toString().length;

	return lines.map((line, index) => {
		const lineNum = (startLine + index).toString().padStart(width, " ");
		const lineNumText = theme.fg("dim", `${lineNum} | `);
		return lineNumText + line;
	});
}

/**
 * @summary コードパネルコンテンツを作成
 * @param code - コード文字列
 * @param language - 言語
 * @param filePath - ファイルパス（オプション）
 * @param theme - テーマオブジェクト
 * @returns Containerコンポーネント
 */
function createCodePanel(
	code: string,
	language: string | undefined,
	filePath: string | undefined,
	theme: { fg: (color: string, text: string) => string; bold: (text: string) => string }
): Container {
	const container = new Container();

	// タイトル
	const titleParts: string[] = [];
	titleParts.push(theme.fg("accent", theme.bold("Code Panel")));
	if (filePath) {
		titleParts.push(theme.fg("muted", " - "));
		titleParts.push(theme.fg("accent", filePath));
	}
	if (language) {
		titleParts.push(theme.fg("muted", " ["));
		titleParts.push(theme.fg("dim", language));
		titleParts.push(theme.fg("muted", "]"));
	}
	container.addChild(new Text(" " + titleParts.join(""), 0, 0));

	// セパレータ
	container.addChild(
		new Text(" " + theme.fg("border", "─".repeat(50)), 0, 0)
	);

	// コードセクション（シンタックスハイライト適用済み）
	const highlightedLines = highlightCode(code, language);
	const codeLines = formatLinesWithNumbers(highlightedLines, 1, theme);

	// スクロール対応：最大表示行数を制限
	const maxDisplayLines = 30;
	const displayLines = codeLines.slice(0, maxDisplayLines);

	for (const line of displayLines) {
		container.addChild(new Text(" " + line, 0, 0));
	}

	// 行数が多い場合は省略表示
	if (codeLines.length > maxDisplayLines) {
		const omittedCount = codeLines.length - maxDisplayLines;
		container.addChild(
			new Text(
				" " + theme.fg("muted", `... (${omittedCount} 行省略)`),
				0, 0
			)
		);
	}

	// フッター（操作ガイド）
	container.addChild(
		new Text(
			" " + theme.fg("dim", "ESC または q で閉じる"),
			0, 0
		)
	);

	return container;
}

/**
 * @summary 拡張機能のエントリポイント
 * @param pi - pi拡張API
 */
export default function (pi: ExtensionAPI): void {
	pi.registerCommand("code-panel", {
		description:
			"コードをオーバーレイパネルで表示します。" +
			"code または path パラメータを使用します。",

		/**
		 * @summary code-panelコマンドのハンドラ
		 * @param args - コマンド引数（code, path, language）
		 * @param ctx - 拡張コンテキスト
		 */
		handler: async (args, ctx) => {
			// 引数をパース
			const params = parseArgs(args);

			// パラメータ検証
			if (!params.code && !params.path) {
				ctx.ui.notify("エラー: code または path パラメータを指定してください。\n" +
					"使用例:\n" +
					"  /code-panel code:\"const x = 1;\" language:typescript\n" +
					"  /code-panel path:src/main.ts", "error");
				return;
			}

			let code: string;
			let language = params.language;
			let filePath: string | undefined;

			try {
				// ファイルパスが指定された場合
				if (params.path) {
					filePath = params.path;

					if (!fs.existsSync(params.path)) {
						ctx.ui.notify(`エラー: ファイルが見つかりません: ${params.path}`, "error");
						return;
					}

					code = fs.readFileSync(params.path, "utf-8");

					// 言語が指定されていない場合、パスから自動検出
					if (!language) {
						language = getLanguageFromPath(params.path);
					}
				} else {
					// コードが直接指定された場合
					code = params.code!;
				}

				// オーバーレイパネルを表示
				const result = await ctx.ui.custom<string | null>(
					(tui, theme, _keybindings, done) => {
						const panel = createCodePanel(code, language, filePath, theme);

						return {
							render: (width: number) => panel.render(width),
							invalidate: () => panel.invalidate(),
							handleInput: (data: string) => {
								// ESC または q で閉じる
								if (matchesKey(data, "escape") || data === "q") {
									done(null);
								}
							},
						};
					},
					{
						overlay: true,
						overlayOptions: {
							anchor: "right-center",
							width: "50%",
							minWidth: 40,
							maxHeight: "80%",
							margin: 1,
						},
					}
				);

				if (result === null) {
					ctx.ui.notify("パネルを閉じました", "info");
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`エラー: ${errorMessage}`, "error");
			}
		},
	});
}

/**
 * @summary コマンド引数をパース
 * @param args - コマンド引数文字列
 * @returns パース結果
 */
function parseArgs(args: string): {
	code?: string;
	path?: string;
	language?: string;
} {
	const result: { code?: string; path?: string; language?: string } = {};

	// code:"..." または code:'...' パターンを抽出
	const codeMatch = args.match(/code:(?:"([^"]*)"|'([^']*)')/);
	if (codeMatch) {
		result.code = codeMatch[1] ?? codeMatch[2];
	}

	// path:... パターンを抽出（空白または文字列終了まで）
	const pathMatch = args.match(/path:(\S+)/);
	if (pathMatch) {
		result.path = pathMatch[1];
	}

	// language:... パターンを抽出
	const langMatch = args.match(/language:(\S+)/);
	if (langMatch) {
		result.language = langMatch[1];
	}

	return result;
}
