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
// Types for abdd_analyze
// ============================================================================

/** 乖離タイプ */
type DivergenceType = "value_mismatch" | "invariant_violation" | "contract_breach" | "missing_jsdoc";

// Note: contract_breachは現在未実装。Phase 2以降でAST解析ベースの実装を検討。
// 現状はmissing_jsdocで契約違反の一部（JSDoc欠落）をカバー。

/** 乖離重要度 */
type Severity = "low" | "medium" | "high";

/** 乖離候補 */
interface Divergence {
	type: DivergenceType;
	severity: Severity;
	intention: { source: string; text: string };
	reality: { file: string; text: string };
	reason: string;
}

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

	// Tool: abdd_analyze - 乖離候補抽出
	pi.registerTool({
		name: "abdd_analyze",
		label: "ABDD Analyze",
		description: `ABDD乖離分析ツール。意図記述（philosophy.md、spec.md）と実態記述（ABDD/.pi/**/*.md）を比較し、乖離候補を抽出。

検出パターン:
1. 不変条件違反: spec.mdの未チェック項目と実装の不一致
2. 価値観ミスマッチ: philosophy.mdの禁則パターンの検出
3. 契約違反: インターフェースの約束と実装の不一致

出力形式:
\`\`\`typescript
{
  divergences: { type, severity, intention, reality, reason }[],
  summary: { total, high, medium, low }
}
\`\`\`

注意: 機械的検出のため偽陽性を含みます。人間による最終判断が必要。`,
		parameters: Type.Object({
			verbose: Type.Optional(Type.Boolean({ description: "詳細ログを出力" })),
			checkInvariants: Type.Optional(Type.Boolean({ description: "不変条件チェックを実行（デフォルト: true）" })),
			checkValues: Type.Optional(Type.Boolean({ description: "価値観チェックを実行（デフォルト: true）" })),
			checkJSDoc: Type.Optional(Type.Boolean({ description: "JSDoc欠落チェックを実行（デフォルト: true）" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const p = params as Record<string, unknown>;
			const verbose = p.verbose === true;
			const checkInvariants = p.checkInvariants !== false;
			const checkValues = p.checkValues !== false;
			const checkJSDoc = p.checkJSDoc !== false;

			const divergences: Divergence[] = [];
			const warnings: string[] = [];

			// パスの設定
			const philosophyPath = path.join(ROOT_DIR, "philosophy.md");
			const specPath = path.join(ROOT_DIR, "ABDD", "spec.md");
			const abddDir = path.join(ROOT_DIR, "ABDD", ".pi");

			// philosophy.mdの読み込み
			let philosophyContent = "";
			if (fs.existsSync(philosophyPath)) {
				try {
					philosophyContent = fs.readFileSync(philosophyPath, "utf-8");
				} catch (e) {
					warnings.push(`philosophy.mdの読み込みエラー: ${philosophyPath}`);
				}
			} else {
				warnings.push(`philosophy.mdが見つかりません: ${philosophyPath}`);
			}

			// spec.mdの読み込み
			let specContent = "";
			if (fs.existsSync(specPath)) {
				try {
					specContent = fs.readFileSync(specPath, "utf-8");
				} catch (e) {
					warnings.push(`spec.mdの読み込みエラー: ${specPath}`);
				}
			} else {
				warnings.push(`spec.mdが見つかりません: ${specPath}`);
			}

			// ABDD/.pi/**/*.mdの読み込み
			const realityFiles: { path: string; content: string }[] = [];
			if (fs.existsSync(abddDir)) {
				const mdFiles = findAllMdFiles(abddDir);
				for (const filePath of mdFiles) {
					try {
						const content = fs.readFileSync(filePath, "utf-8");
						const relativePath = path.relative(ROOT_DIR, filePath);
						realityFiles.push({ path: relativePath, content });
					} catch (e) {
						warnings.push(`ファイル読み込みエラー: ${filePath}`);
					}
				}
			} else {
				warnings.push(`ABDD/.piディレクトリが見つかりません: ${abddDir}`);
			}

			// 1. 不変条件違反の検出
			if (checkInvariants && specContent) {
				const invariantDivergences = detectInvariantViolations(specContent, realityFiles);
				divergences.push(...invariantDivergences);
			}

			// 2. 価値観ミスマッチの検出
			if (checkValues && philosophyContent) {
				const valueDivergences = detectValueMismatches(philosophyContent, realityFiles);
				divergences.push(...valueDivergences);
			}

			// 3. JSDoc欠落の検出
			if (checkJSDoc && realityFiles.length > 0) {
				const jsdocDivergences = detectJSDocMissing(realityFiles);
				divergences.push(...jsdocDivergences);
			}

			// サマリーの作成
			const summary = {
				total: divergences.length,
				high: divergences.filter((d) => d.severity === "high").length,
				medium: divergences.filter((d) => d.severity === "medium").length,
				low: divergences.filter((d) => d.severity === "low").length,
			};

			// 出力の構築
			let output = `# ABDD 乖離分析結果\n\n`;
			output += `## サマリー\n\n`;
			output += `- 総検出数: ${summary.total}\n`;
			output += `- 高重要度: ${summary.high}\n`;
			output += `- 中重要度: ${summary.medium}\n`;
			output += `- 低重要度: ${summary.low}\n\n`;

			if (warnings.length > 0) {
				output += `## 警告\n\n`;
				for (const warning of warnings) {
					output += `- ${warning}\n`;
				}
				output += `\n`;
			}

			if (divergences.length > 0) {
				output += `## 検出された乖離\n\n`;
				for (let i = 0; i < divergences.length; i++) {
					const d = divergences[i];
					output += `### ${i + 1}. [${d.severity.toUpperCase()}] ${d.type}\n\n`;
					output += `**意図** (${d.intention.source}):\n> ${d.intention.text}\n\n`;
					output += `**実態** (${d.reality.file}):\n> ${d.reality.text}\n\n`;
					output += `**理由**: ${d.reason}\n\n`;
					output += `---\n\n`;
				}
			} else {
				output += `## 検出結果\n\n`;
				output += `乖離は検出されませんでした。\n\n`;
			}

			output += `## 注意\n\n`;
			output += `- このツールは機械的検出を行い、偽陽性を含む可能性があります\n`;
			output += `- 人間による最終判断が必要です\n`;
			output += `- 検出結果はabdd_reviewツールで確認・記録できます\n`;

			if (verbose) {
				output += `\n## デバッグ情報\n\n`;
				output += `- philosophy.md: ${philosophyContent.length} bytes\n`;
				output += `- spec.md: ${specContent.length} bytes\n`;
				output += `- 実態記述ファイル数: ${realityFiles.length}\n`;
			}

			return {
				content: [{ type: "text" as const, text: output }],
				details: { success: true, divergences, summary, warnings },
			};
		},
	});

	console.log("ABDD extension loaded: abdd_generate, abdd_jsdoc, abdd_review, abdd_analyze");
}

// ============================================================================
// Helper Functions for abdd_analyze
// ============================================================================

/**
 * 指定ディレクトリ以下の.mdファイルを再帰的に検索
 */
function findAllMdFiles(dir: string): string[] {
	const files: string[] = [];
	const entries = fs.readdirSync(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...findAllMdFiles(fullPath));
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			files.push(fullPath);
		}
	}

	return files;
}

/**
 * 不変条件違反を検出
 * spec.mdの未チェック項目（- [ ]）を検出し、実態記述に対応する記述があるか確認
 */
function detectInvariantViolations(
	specContent: string,
	realityFiles: { path: string; content: string }[]
): Divergence[] {
	const divergences: Divergence[] = [];

	// 未チェックの不変条件を抽出
	const uncheckedPattern = /^- \[ \] \*\*(.+?)\*\*:\s*(.+)$/gm;
	let match;

	while ((match = uncheckedPattern.exec(specContent)) !== null) {
		const invariantName = match[1];
		const invariantDesc = match[2];

		// 実態記述内にこの不変条件への言及があるか確認
		let found = false;
		for (const file of realityFiles) {
			if (file.content.includes(invariantName) || file.content.includes(invariantDesc)) {
				found = true;
				break;
			}
		}

		if (!found) {
			divergences.push({
				type: "invariant_violation",
				severity: "medium",
				intention: {
					source: "spec.md",
					text: `${invariantName}: ${invariantDesc}`,
				},
				reality: {
					file: "ABDD/.pi/**/*.md",
					text: "対応する実装記述が見つかりません",
				},
				reason: "不変条件が実態記述に反映されているか確認が必要です",
			});
		}
	}

	return divergences;
}

/**
 * 価値観ミスマッチを検出
 * philosophy.mdの禁則パターンを実態記述から検索
 */
function detectValueMismatches(
	_philosophyContent: string,
	realityFiles: { path: string; content: string }[]
): Divergence[] {
	const divergences: Divergence[] = [];

	// 禁則パターンの定義
	const prohibitionPatterns = [
		{
			pattern: /git add \./g,
			name: "git add . の使用",
			philosophyRef: "git add .の安易な使用は禁止",
		},
		{
			pattern: /git add -A/g,
			name: "git add -A の使用",
			philosophyRef: "git add -Aの安易な使用は禁止",
		},
		{
			pattern: /git add --all/g,
			name: "git add --all の使用",
			philosophyRef: "git add --allの安易な使用は禁止",
		},
	];

	// 実態記述内のコードブロックを抽出して検査
	for (const file of realityFiles) {
		const codeBlocks = extractCodeBlocks(file.content);

		for (const block of codeBlocks) {
			for (const prohibition of prohibitionPatterns) {
				prohibition.pattern.lastIndex = 0; // リセット
				const matches = prohibition.pattern.exec(block.code);
				if (matches) {
					// ただし、コメントや説明文での言及は除外
					const isCommentContext =
						block.code.includes("禁止") ||
						block.code.includes("回避") ||
						block.code.includes("使用しない") ||
						block.code.includes("NG");

					if (!isCommentContext) {
						divergences.push({
							type: "value_mismatch",
							severity: "high",
							intention: {
								source: "philosophy.md",
								text: prohibition.philosophyRef,
							},
							reality: {
								file: file.path,
								text: `${prohibition.name}が検出されました: ${matches[0]}`,
							},
							reason: "哲学で禁止されているパターンが実装に含まれています",
						});
					}
				}
			}
		}
	}

	return divergences;
}

/**
 * JSDoc欠落を検出
 * 実態記述内の関数定義で説明がないものを検出
 */
function detectJSDocMissing(realityFiles: { path: string; content: string }[]): Divergence[] {
	const divergences: Divergence[] = [];

	for (const file of realityFiles) {
		// TypeScriptコードブロック内の関数定義を検索
		const codeBlocks = extractCodeBlocks(file.content);

		for (const block of codeBlocks) {
			if (!block.language || block.language.toLowerCase() !== "typescript") {
				continue;
			}

			// 関数定義パターン（export function, async function等）
			const funcPattern = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm;
			let match;

			while ((match = funcPattern.exec(block.code)) !== null) {
				const funcName = match[1];
				const funcStart = match.index;

				// 直前にJSDocコメントがあるか確認
				const beforeFunc = block.code.substring(Math.max(0, funcStart - 500), funcStart);
				const hasJSDoc = /\/\*\*[\s\S]*?\*\//.test(beforeFunc);

				if (!hasJSDoc) {
					divergences.push({
						type: "missing_jsdoc",
						severity: "low",
						intention: {
							source: "spec.md",
							text: "すべてのエクスポート関数にJSDocがあること",
						},
						reality: {
							file: file.path,
							text: `関数 \`${funcName}\` にJSDocがありません`,
						},
						reason: "契約で定義されたJSDoc要件を満たしていません",
					});
				}
			}
		}
	}

	// 重複を除去
	const uniqueDivergences = divergences.filter(
		(d, index, self) =>
			index === self.findIndex((d2) => d2.reality.text === d.reality.text && d2.reality.file === d.reality.file)
	);

	return uniqueDivergences;
}

/**
 * Markdownからコードブロックを抽出
 */
function extractCodeBlocks(content: string): { language: string | null; code: string }[] {
	const blocks: { language: string | null; code: string }[] = [];
	const codeBlockPattern = /```(\w*)\n([\s\S]*?)```/g;

	let match;
	while ((match = codeBlockPattern.exec(content)) !== null) {
		blocks.push({
			language: match[1] || null,
			code: match[2],
		});
	}

	return blocks;
}

// ============================================================================
// Test Patterns for abdd_analyze
// ============================================================================

/**
 * abdd_analyzeツールのテストパターン
 * 以下のパターンで検出ロジックの動作確認が可能:
 *
 * ## テストケース1: 不変条件違反の検出
 * spec.mdに以下を追加:
 * ```markdown
 * - [ ] **TEST_INVARIANT**: テスト用の未チェック不変条件
 * ```
 * 期待結果: invariant_violationが検出される（実態記述に該当記述がない場合）
 *
 * ## テストケース2: 価値観ミスマッチの検出
 * ABDD/.pi/test.mdに以下を追加:
 * ```markdown
 * \`\`\`bash
 * git add .
 * \`\`\`
 * ```
 * 期待結果: value_mismatchが検出される（コメントコンテキストを含まない場合）
 *
 * ## テストケース3: JSDoc欠落の検出
 * ABDD/.pi/test.mdに以下を追加:
 * ```markdown
 * \`\`\`typescript
 * export function testFunction() {
 *   return true;
 * }
 * \`\`\`
 * ```
 * 期待結果: missing_jsdocが検出される
 *
 * ## テストケース4: 偽陽性の除外
 * ABDD/.pi/test.mdに以下を追加:
 * ```markdown
 * \`\`\`bash
 * # git add . は使用禁止です
 * \`\`\`
 * ```
 * 期待結果: value_mismatchは検出されない（コメントコンテキストとして除外）
 */
export const ABDD_ANALYZE_TEST_PATTERNS = {
	invariantViolation: {
		input: "- [ ] **TEST_INVARIANT**: テスト用の未チェック不変条件",
		expectedType: "invariant_violation" as DivergenceType,
		description: "spec.mdの未チェック項目が実態記述にない場合に検出",
	},
	valueMismatch: {
		input: "```bash\ngit add .\n```",
		expectedType: "value_mismatch" as DivergenceType,
		description: "禁則パターンがコードブロックに含まれる場合に検出",
	},
	jsdocMissing: {
		input: "```typescript\nexport function testFunc() {}\n```",
		expectedType: "missing_jsdoc" as DivergenceType,
		description: "TypeScript関数にJSDocがない場合に検出",
	},
	falsePositive: {
		input: "```bash\n# git add . は禁止\n```",
		expectedType: null,
		description: "コメントコンテキストを含む場合は偽陽性として除外",
	},
};
