/**
 * @abdd.meta
 * path: .pi/extensions/enhanced-read.ts
 * role: シンタックスハイライトと行番号付きのファイル読み込みツールを提供する拡張機能
 * why: エージェントがコードファイルを可読性高く表示し、範囲指定読み込みを可能にするため
 * related: @mariozechner/pi-ai, @mariozechner/pi-coding-agent, @mariozechner/pi-tui, code-viewer.ts
 * public_api: enhanced_read ツール
 * invariants: パスは必須、offset/limit はオプション（デフォルトで全行表示）
 * side_effects: ファイルシステムからの読み取り
 * failure_modes: ファイルが存在しない、読み取り権限がない、言語検出に失敗、無効なoffset/limit値
 * @abdd.explain
 * overview: ファイルをシンタックスハイライト、行番号付きで表示し、範囲指定読み込みをサポートするツール
 * what_it_does:
 *   - ファイルパスからコードを読み込み、言語を自動検出してハイライト表示する
 *   - offset で開始行、limit で最大行数を指定可能
 *   - 行番号を付与してコードを見やすくフォーマットする
 *   - 総行数と現在の範囲（開始行〜終了行）を表示する
 * why_it_exists:
 *   - 既存の read ツールにハイライトと範囲指定機能を追加した拡張版を提供するため
 *   - 大きなファイルの部分的な読み込みを可能にするため
 * scope:
 *   in: ExtensionAPI, ファイルパス, offset（開始行）, limit（最大行数）
 *   out: ハイライト付きコード表示、範囲情報、総行数
 */

/**
 * Enhanced Read Extension
 *
 * Provides an enhanced_read tool for reading files with syntax highlighting,
 * line numbers, and range specification support.
 *
 * Usage:
 *   enhanced_read({ path: "src/main.ts" })                    - Read entire file
 *   enhanced_read({ path: "src/main.ts", offset: 10 })        - Read from line 10
 *   enhanced_read({ path: "src/main.ts", offset: 10, limit: 50 }) - Read lines 10-59
 */

import * as fs from "node:fs";

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { highlightCode, getLanguageFromPath } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

// パラメータスキーマ定義
const EnhancedReadParams = Type.Object({
	path: Type.String({ description: "読み込むファイルのパス" }),
	offset: Type.Optional(
		Type.Number({ description: "開始行番号（1始まり）。省略時はファイルの先頭から" })
	),
	limit: Type.Optional(
		Type.Number({ description: "読み込む最大行数。省略時はファイルの末尾まで" })
	),
});

interface EnhancedReadDetails {
	/** 読み込んだファイルパス */
	path: string;
	/** 検出された言語 */
	language: string;
	/** ファイルの総行数 */
	totalLines: number;
	/** 表示開始行（1始まり） */
	startLine: number;
	/** 表示終了行（1始まり） */
	endLine: number;
	/** 読み込んだ行数 */
	displayedLines: number;
	/** エラーメッセージ（エラー時のみ） */
	error?: string;
}

/**
 * @summary 行番号付きでコードをフォーマット
 * @param lines - コード行の配列
 * @param startLine - 開始行番号（1始まり）
 * @returns 行番号付きコード文字列
 */
function formatWithLineNumbers(lines: string[], startLine: number): string {
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
	// enhanced_read ツールを登録
	pi.registerTool({
		name: "enhanced_read",
		label: "Enhanced Read",
		description:
			"シンタックスハイライト、行番号付きでファイルを読み込みます。" +
			"offset で開始行、limit で最大行数を指定可能です。" +
			"大きなファイルの部分的な読み込みに便利です。",
		parameters: EnhancedReadParams,

		/**
		 * @summary enhanced_readツールの実行処理
		 * @param _toolCallId - ツール呼び出しID
		 * @param params - ツールパラメータ（path, offset, limit）
		 * @param _signal - 中断シグナル
		 * @param _onUpdate - 進捗更新コールバック
		 * @param _ctx - 拡張コンテキスト
		 * @returns ツール実行結果
		 */
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const filePath = params.path;
			const offset = params.offset ?? 1; // デフォルトは先頭から
			const limit = params.limit; // undefined の場合は末尾まで

			// パラメータ検証
			if (offset < 1) {
				return {
					content: [
						{
							type: "text" as const,
							text: `エラー: offset は1以上の値を指定してください。指定値: ${offset}`,
						},
					],
					details: {
						path: filePath,
						language: "",
						totalLines: 0,
						startLine: 0,
						endLine: 0,
						displayedLines: 0,
						error: "offset は1以上である必要があります",
					} as EnhancedReadDetails,
				};
			}

			if (limit !== undefined && limit < 1) {
				return {
					content: [
						{
							type: "text" as const,
							text: `エラー: limit は1以上の値を指定してください。指定値: ${limit}`,
						},
					],
					details: {
						path: filePath,
						language: "",
						totalLines: 0,
						startLine: 0,
						endLine: 0,
						displayedLines: 0,
						error: "limit は1以上である必要があります",
					} as EnhancedReadDetails,
				};
			}

			try {
				// ファイル存在確認
				if (!fs.existsSync(filePath)) {
					return {
						content: [
							{
								type: "text" as const,
								text: `エラー: ファイルが見つかりません: ${filePath}`,
							},
						],
						details: {
							path: filePath,
							language: "",
							totalLines: 0,
							startLine: 0,
							endLine: 0,
							displayedLines: 0,
							error: "ファイルが見つかりません",
						} as EnhancedReadDetails,
					};
				}

				// ファイル読み込み
				const content = fs.readFileSync(filePath, "utf-8");
				const allLines = content.split("\n");
				const totalLines = allLines.length;

				// 言語を自動検出
				const language = getLanguageFromPath(filePath);

				// offset/limit を適用して範囲を決定
				// offset は1始まり、配列インデックスは0始まり
				const startIndex = Math.max(0, offset - 1);
				const endIndex =
					limit !== undefined ? Math.min(totalLines, startIndex + limit) : totalLines;

				// 範囲外の場合はエラー
				if (startIndex >= totalLines) {
					return {
						content: [
							{
								type: "text" as const,
								text: `エラー: offset ${offset} はファイルの総行数 ${totalLines} を超えています。`,
							},
						],
						details: {
							path: filePath,
							language,
							totalLines,
							startLine: 0,
							endLine: 0,
							displayedLines: 0,
							error: `offset ${offset} が総行数 ${totalLines} を超えています`,
						} as EnhancedReadDetails,
					};
				}

				// 指定範囲の行を取得
				const selectedLines = allLines.slice(startIndex, endIndex);
				const startLine = startIndex + 1; // 1始まりに変換
				const endLine = startIndex + selectedLines.length;
				const displayedLines = selectedLines.length;

				// 選択範囲のコードに対してシンタックスハイライトを適用
				// highlightCode は string[] を返す
				const selectedContent = selectedLines.join("\n");
				const highlightedLines = highlightCode(selectedContent, language);

				// 行番号付きでフォーマット
				const formattedCode = formatWithLineNumbers(highlightedLines, startLine);

				// ヘッダー情報を作成
				const headerParts: string[] = [];
				headerParts.push(`ファイル: ${filePath}`);
				if (language) {
					headerParts.push(`言語: ${language}`);
				}
				headerParts.push(`範囲: ${startLine}-${endLine} 行 / 総行数: ${totalLines} 行`);

				const header = headerParts.join(" | ");
				const separator = "─".repeat(60);
				const output = `${header}\n${separator}\n${formattedCode}`;

				return {
					content: [
						{
							type: "text" as const,
							text: output,
						},
					],
					details: {
						path: filePath,
						language,
						totalLines,
						startLine,
						endLine,
						displayedLines,
					} as EnhancedReadDetails,
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				return {
					content: [
						{
							type: "text" as const,
							text: `エラー: ファイルの読み込みに失敗しました: ${errorMessage}`,
						},
					],
					details: {
						path: filePath,
						language: "",
						totalLines: 0,
						startLine: 0,
						endLine: 0,
						displayedLines: 0,
						error: errorMessage,
					} as EnhancedReadDetails,
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
			let text = theme.fg("toolTitle", theme.bold("enhanced_read "));
			text += theme.fg("accent", args.path);

			// offset/limit が指定されている場合は表示
			const rangeParts: string[] = [];
			if (args.offset) {
				rangeParts.push(`offset: ${args.offset}`);
			}
			if (args.limit) {
				rangeParts.push(`limit: ${args.limit}`);
			}
			if (rangeParts.length > 0) {
				text += theme.fg("muted", ` [${rangeParts.join(", ")}]`);
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
			const details = result.details as EnhancedReadDetails | undefined;

			// エラー時の表示
			if (details?.error) {
				return new Text(theme.fg("error", `エラー: ${details.error}`), 0, 0);
			}

			// 成功時の要約表示
			if (details) {
				const parts: string[] = [];
				parts.push(theme.fg("success", "読み込み完了 "));
				parts.push(theme.fg("accent", details.path));
				parts.push(theme.fg("muted", " ("));
				parts.push(theme.fg("dim", `${details.startLine}-${details.endLine}`));
				parts.push(theme.fg("muted", " 行 / "));
				parts.push(theme.fg("dim", `総 ${details.totalLines} 行`));

				if (details.language) {
					parts.push(theme.fg("muted", ", "));
					parts.push(theme.fg("accent", details.language));
				}

				parts.push(theme.fg("muted", ")"));

				return new Text(parts.join(""), 0, 0);
			}

			// フォールバック: 内容の一部を表示
			const text = result.content[0];
			const content = text?.type === "text" ? text.text : "";
			return new Text(theme.fg("muted", content.substring(0, 100)), 0, 0);
		},
	});
}
