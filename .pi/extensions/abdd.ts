/**
 * ABDD (As-Built Driven Development) Extension
 *
 * ABDDツール統合拡張機能。実態ドキュメント生成、JSDoc自動生成、
 * 乖離確認を行うためのツールセットを提供する。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ============================================================================
// Constants
// ============================================================================

const ROOT_DIR = process.cwd();
const SCRIPTS_DIR = path.join(ROOT_DIR, "scripts");
const ABDD_DIR = path.join(ROOT_DIR, "ABDD");

// ============================================================================
// Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
	// Tool: abdd_generate - 実態ドキュメント生成
	pi.registerTool({
		name: "abdd_generate",
		label: "ABDD Generate",
		description: `ABDD実態ドキュメントを生成する。TypeScriptファイルを解析し、Mermaid図付きのAPIリファレンスを自動生成。

出力先:
- ABDD/.pi/extensions/*.md - 拡張機能ドキュメント
- ABDD/.pi/lib/*.md - ライブラリドキュメント

生成される図: クラス図、依存関係図、関数フロー図、シーケンス図
前提条件: mmdc (Mermaid CLI) がインストールされていると厳密な図検証が可能`,
		parameters: Type.Object({
			dryRun: Type.Optional(Type.Boolean({ description: "ドライラン" })),
			verbose: Type.Optional(Type.Boolean({ description: "詳細ログ" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const scriptPath = path.join(SCRIPTS_DIR, "generate-abdd.ts");
			const p = params as Record<string, unknown>;

			if (!fs.existsSync(scriptPath)) {
				return {
					content: [{ type: "text" as const, text: `エラー: スクリプトが見つかりません: ${scriptPath}` }],
					details: { success: false, error: "Script not found" },
				};
			}

			try {
				const args = ["npx", "tsx", scriptPath];
				// オプションを追加
				if (p.dryRun === true) args.push("--dry-run");
				if (p.verbose === true) args.push("--verbose");

				const result = execSync(args.join(" "), {
					cwd: ROOT_DIR,
					encoding: "utf-8",
					timeout: 120000,
					stdio: ["pipe", "pipe", "pipe"],
				});

				return {
					content: [{ type: "text" as const, text: `実態ドキュメントの生成が完了しました\n\n出力先: ${ABDD_DIR}\n\n${result}` }],
					details: { success: true, output: result, outputDir: ABDD_DIR },
				};
			} catch (error) {
				// stderrも含めてエラーメッセージを構築
				let errorMessage = error instanceof Error ? error.message : String(error);
				const execError = error as { stderr?: string; stdout?: string };
				if (execError.stderr) {
					errorMessage = `${errorMessage}\n\nstderr: ${execError.stderr}`;
				}
				return {
					content: [{ type: "text" as const, text: `エラー: ${errorMessage}\n\nヒント: mmdc (Mermaid CLI) がインストールされているか確認してください: npm install -g @mermaid-js/mermaid-cli` }],
					details: { success: false, error: errorMessage },
				};
			}
		},
	});

	// Tool: abdd_jsdoc - JSDoc自動生成
	pi.registerTool({
		name: "abdd_jsdoc",
		label: "ABDD JSDoc",
		description: `JSDocを自動生成する。LLMを使用して日本語のJSDocを生成し、ソースコードに挿入。

主な機能: エクスポート関数、クラス、インターフェース、型を対象
CI用途: check: true でJSDocがない要素数を確認
品質基準: 要約50文字以内、すべてのパラメータに@param、戻り値がある場合@returns`,
		parameters: Type.Object({
			dryRun: Type.Optional(Type.Boolean({ description: "ドライラン" })),
			check: Type.Optional(Type.Boolean({ description: "CI用チェック" })),
			verbose: Type.Optional(Type.Boolean({ description: "詳細ログ" })),
			limit: Type.Optional(Type.Number({ description: "処理上限" })),
			file: Type.Optional(Type.String({ description: "特定ファイル" })),
			regenerate: Type.Optional(Type.Boolean({ description: "再生成" })),
			force: Type.Optional(Type.Boolean({ description: "強制再生成" })),
			noCache: Type.Optional(Type.Boolean({ description: "キャッシュ不使用" })),
			metrics: Type.Optional(Type.Boolean({ description: "品質メトリクス" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const scriptPath = path.join(SCRIPTS_DIR, "add-jsdoc.ts");
			const p = params as Record<string, unknown>;

			if (!fs.existsSync(scriptPath)) {
				return {
					content: [{ type: "text" as const, text: `エラー: スクリプトが見つかりません: ${scriptPath}` }],
					details: { success: false, error: "Script not found" },
				};
			}

			try {
				const args = ["npx", "tsx", scriptPath];
				if (p.dryRun === true) args.push("--dry-run");
				if (p.check === true) args.push("--check");
				if (p.verbose === true) args.push("--verbose");
				if (p.limit !== undefined) args.push("--limit", String(p.limit));
				if (p.file !== undefined) args.push("--file", String(p.file));
				if (p.regenerate === true) args.push("--regenerate");
				if (p.force === true) args.push("--force");
				if (p.noCache === true) args.push("--no-cache");
				if (p.metrics === true) args.push("--metrics");

				const result = execSync(args.join(" "), {
					cwd: ROOT_DIR,
					encoding: "utf-8",
					timeout: 300000,
					stdio: ["pipe", "pipe", "pipe"],
				});

				return {
					content: [{ type: "text" as const, text: `JSDoc生成が完了しました\n\n${result}` }],
					details: { success: true, output: result },
				};
			} catch (error) {
				// stderrも含めてエラーメッセージを構築
				let errorMessage = error instanceof Error ? error.message : String(error);
				const execError = error as { stderr?: string; stdout?: string };
				if (execError.stderr) {
					errorMessage = `${errorMessage}\n\nstderr: ${execError.stderr}`;
				}

				if (p.check === true) {
					return {
						content: [{ type: "text" as const, text: `JSDocがない要素が見つかりました\n\n${errorMessage}\n\nヒント: npx tsx scripts/add-jsdoc.ts --dry-run で詳細を確認してください` }],
						details: { success: false, error: "JSDoc missing", output: errorMessage },
					};
				}

				return {
					content: [{ type: "text" as const, text: `エラー: ${errorMessage}\n\nヒント: APIキーが設定されているか確認してください（~/.pi/agent/auth.json）` }],
					details: { success: false, error: errorMessage },
				};
			}
		},
	});

	// Tool: abdd_review - 乖離確認
	pi.registerTool({
		name: "abdd_review",
		label: "ABDD Review",
		description: `ABDD乖離確認ツール。意図記述と実態記述の乖離を確認するためのチェックリストを表示・作成。

確認項目: philosophy.mdの価値観、spec.mdの不変条件、契約、境界条件
レビュー記録: createRecord: true で ABDD/reviews/YYYY-MM-DD.md に記録を作成`,
		parameters: Type.Object({
			date: Type.Optional(Type.String({ description: "レビュー日付（YYYY-MM-DD）" })),
			showChecklist: Type.Optional(Type.Boolean({ description: "チェックリスト表示" })),
			createRecord: Type.Optional(Type.Boolean({ description: "記録ファイル作成" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const p = params as Record<string, unknown>;
			const showChecklist = p.showChecklist !== false;
			const createRecord = p.createRecord === true;
			const dateStr = (p.date as string) || new Date().toISOString().split("T")[0];

			const checklist = `# ABDD レビューチェックリスト (${dateStr})

## 1. 意図記述の確認

### philosophy.md
- [ ] 価値観を理解しているか
- [ ] 優先順位を理解しているか
- [ ] 禁則事項を把握しているか
- [ ] 非目標を理解しているか

### spec.md
- [ ] 不変条件を理解しているか
- [ ] 契約を理解しているか
- [ ] 境界条件を理解しているか

## 2. 実態記述の確認

### as-builtドキュメント
- [ ] ABDD/.pi/extensions/*.md を確認したか
- [ ] ABDD/.pi/lib/*.md を確認したか
- [ ] Mermaid図を確認したか
- [ ] APIリファレンスを確認したか

### JSDoc品質
- [ ] すべてのエクスポート関数にJSDocがあるか
- [ ] @paramが適切に記述されているか
- [ ] @returnsが適切に記述されているか
- [ ] 日本語で記述されているか

## 3. 乖離の検出

### 価値観との整合性
- [ ] 実装はphilosophyの価値観に合致しているか
- [ ] トレードオフの判断が適切か

### 不変条件の充足
- [ ] 実装はspecの不変条件を満たしているか
- [ ] 常に成り立つべきルールが守られているか

### 契約の遵守
- [ ] 実装はspecの契約に従っているか
- [ ] インターフェースの約束が守られているか

### 境界条件の維持
- [ ] 実装はspecの境界条件内で動作しているか
- [ ] 制約事項が遵守されているか

## 4. 修正アクション

### 実装を更新すべき場合
- [ ] 意図に合わない実装を特定したか
- [ ] 修正方針を決定したか

### 意図を更新すべき場合
- [ ] 実装が正しく、意図が古い箇所を特定したか
- [ ] 更新方針を決定したか`;

			if (createRecord) {
				const reviewsDir = path.join(ABDD_DIR, "reviews");
				if (!fs.existsSync(reviewsDir)) {
					fs.mkdirSync(reviewsDir, { recursive: true });
				}

				const recordPath = path.join(reviewsDir, `${dateStr}.md`);

				if (fs.existsSync(recordPath)) {
					return {
						content: [{ type: "text" as const, text: `レビュー記録が既に存在します: ${recordPath}\n\n既存のファイルを編集するか、別の日付を指定してください` }],
						details: { success: false, error: "Record exists", recordPath },
					};
				}

				const recordContent = `${checklist}

---

## 乖離の特定

| 箇所 | 意図 | 実態 | 修正方針 |
|------|------|------|----------|
| ... | ... | ... | ... |

## 修正内容

- [ ] 実装を更新: ...
- [ ] 意図を修正: ...

## 次回アクション

1. ...
2. ...
`;

				fs.writeFileSync(recordPath, recordContent, "utf-8");

				return {
					content: [{ type: "text" as const, text: `レビュー記録を作成しました: ${recordPath}\n\n${checklist}` }],
					details: { success: true, recordPath, checklist },
				};
			}

			return {
				content: [{ type: "text" as const, text: `${checklist}\n\n---\n\nヒント: createRecord: true でレビュー記録ファイルを作成できます` }],
				details: { success: true, checklist },
			};
		},
	});

	console.log("ABDD extension loaded: abdd_generate, abdd_jsdoc, abdd_review");
}
