/**
 * @abdd.meta
 * path: .pi/extensions/code-viewer.ts
 * role: 拡張機能モジュール
 * why: シンタックスハイライトと行番号付きでコードを表示する機能を提供するため
 * related: @mariozechner/pi-coding-agent, @mariozechner/pi-tui, node:fs
 * public_api: view_codeツール
 * invariants: pathとcodeパラメータのいずれか一方のみが必須、出力コードには行番号が付与される
 * side_effects: ファイルシステムからの読み取り
 * failure_modes: ファイルが存在しない場合、パラメータが不足している場合、文字コード読み取りエラー
 * @abdd.explain
 * overview: コードビューア拡張機能の実装
 * what_it_does:
 *   - view_codeツールを登録する
 *   - ファイルパスからコードを読み込み、言語を自動検出する
 *   - 直接指定されたコードスニペットに対してシンタックスハイライトを適用する
 *   - コードに行番号を付与してフォーマットする
 * why_it_exists:
 *   - エージェントに対してファイル内容やコードスニペットを視覚的に確認させるため
 *   - 行番号表示によりコード参照を容易にするため
 * scope:
 *   in: path(ファイルパス), code(コード文字列), language(言語指定)
 *   out: Text形式でフォーマットされたコード文字列、またはエラーメッセージ
 */

/**
 * Code Viewer Extension
 *
 * Provides a view_code tool for displaying code with syntax highlighting
 * and line numbers. Supports both file path and direct code input.
 *
 * Usage:
 *   view_code({ path: "src/main.ts" })           - View file with auto-detected language
 *   view_code({ code: "const x = 1;", language: "typescript" }) - View code snippet
 */

import * as fs from "node:fs";

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { highlightCode, getLanguageFromPath } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

// パラメータスキーマ定義
const ViewCodeParams = Type.Object({
	path: Type.Optional(Type.String({ description: "表示するファイルのパス" })),
	code: Type.Optional(Type.String({ description: "直接指定するコード文字列" })),
	language: Type.Optional(Type.String({ description: "シンタックスハイライト用の言語（例: typescript, python）" })),
});

interface ViewCodeDetails {
	path?: string;
	language?: string;
	lineCount: number;
	error?: string;
}

/**
 * @summary 行番号付きでコードをフォーマット
 * @param lines - コード行の配列
 * @param startLine - 開始行番号（デフォルト1）
 * @returns 行番号付きコード文字列
 */
function formatWithLineNumbers(lines: string[], startLine: number = 1): string {
	const maxLineNum = startLine + lines.length - 1;
	const width = maxLineNum.toString().length;

	return lines
		.map((line, index) => {
			const lineNum = (startLine + index).toString().padStart(width, " ");
			return `${lineNum} | ${line}`;
		})
		.join("\n");
}

/**
 * @summary 拡張機能のエントリポイント
 * @param pi - pi拡張API
 */
export default function (pi: ExtensionAPI): void {
	// view_code ツールを登録
	pi.registerTool({
		name: "view_code",
		label: "View Code",
		description:
			"シンタックスハイライトと行番号付きでコードを表示します。" +
			"path を指定してファイルを表示するか、code と language を指定してコードスニペットを表示します。" +
			"language が省略された場合、path から自動検出されます。",
		parameters: ViewCodeParams,

		/**
		 * @summary view_codeツールの実行処理
		 * @param _toolCallId - ツール呼び出しID
		 * @param params - ツールパラメータ（path, code, language）
		 * @param _signal - 中断シグナル
		 * @param _onUpdate - 進捗更新コールバック
		 * @param _ctx - 拡張コンテキスト
		 * @returns ツール実行結果
		 */
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			let code: string;
			let language: string | undefined = params.language;
			let resolvedPath: string | undefined;

			// パラメータ検証: path または code のいずれかが必要
			if (!params.path && !params.code) {
				return {
					content: [
						{
							type: "text" as const,
							text: "エラー: path または code パラメータのいずれかを指定してください。",
						},
					],
					details: {
						lineCount: 0,
						error: "path または code が必要です",
					} as ViewCodeDetails,
				};
			}

			try {
				// ファイルパスが指定された場合
				if (params.path) {
					resolvedPath = params.path;

					if (!fs.existsSync(params.path)) {
						return {
							content: [
								{
									type: "text" as const,
									text: `エラー: ファイルが見つかりません: ${params.path}`,
								},
							],
							details: {
								path: params.path,
								lineCount: 0,
								error: "ファイルが見つかりません",
							} as ViewCodeDetails,
						};
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

				// コードを行に分割
				const lines = code.split("\n");
				const lineCount = lines.length;

				// シンタックスハイライトを適用
				const highlightedLines = highlightCode(code, language);

				// 行番号を付与してフォーマット
				const formattedCode = formatWithLineNumbers(highlightedLines);

				// ヘッダー情報を作成
				let header = "";
				if (resolvedPath) {
					header = `ファイル: ${resolvedPath}`;
					if (language) {
						header += ` (${language})`;
					}
				} else if (language) {
					header = `言語: ${language}`;
				}
				header += ` | ${lineCount} 行`;

				const output = `${header}\n${"─".repeat(50)}\n${formattedCode}`;

				return {
					content: [
						{
							type: "text" as const,
							text: output,
						},
					],
					details: {
						path: resolvedPath,
						language,
						lineCount,
					} as ViewCodeDetails,
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				return {
					content: [
						{
							type: "text" as const,
							text: `エラー: コードの読み込みに失敗しました: ${errorMessage}`,
						},
					],
					details: {
						path: resolvedPath,
						lineCount: 0,
						error: errorMessage,
					} as ViewCodeDetails,
				};
			}
		},

		/**
		 * @summary ツール呼び出し時の表示
		 * @param args - ツール引数
		 * @param theme - テーマ
		 * @returns 表示用Text
		 */
		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("view_code "));

			if (args.path) {
				text += theme.fg("accent", args.path);
			} else if (args.code) {
				const preview = args.code.length > 30 ? args.code.substring(0, 30) + "..." : args.code;
				text += theme.fg("dim", `"${preview}"`);
			}

			if (args.language) {
				text += theme.fg("muted", ` [${args.language}]`);
			}

			return new Text(text, 0, 0);
		},

		/**
		 * @summary ツール結果の表示
		 * @param result - ツール実行結果
		 * @param _options - 表示オプション
		 * @param theme - テーマ
		 * @returns 表示用Text
		 */
		renderResult(result, _options, theme) {
			const details = result.details as ViewCodeDetails | undefined;

			if (details?.error) {
				return new Text(theme.fg("error", `エラー: ${details.error}`), 0, 0);
			}

			const text = result.content[0];
			const content = text?.type === "text" ? text.text : "";

			// 結果の要約表示
			if (details) {
				let summary = theme.fg("success", "表示完了 ");
				if (details.path) {
					summary += theme.fg("accent", details.path) + " ";
				}
				summary += theme.fg("muted", `(${details.lineCount} 行`);
				if (details.language) {
					summary += theme.fg("dim", `, ${details.language}`);
				}
				summary += theme.fg("muted", ")");
				return new Text(summary, 0, 0);
			}

			return new Text(theme.fg("muted", content.substring(0, 100)), 0, 0);
		},
	});
}
