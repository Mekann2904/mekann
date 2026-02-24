/**
 * @abdd.meta
 * path: .pi/extensions/abdd.ts
 * role: ABDDツール統合エントリーポイント
 * why: 実態コードとの乖離確認、JSDoc生成、ワークフロー実行を行うPI拡張機能として
 * related: .pi/extensions/abdd-types.ts, scripts/generate_abdd.ts, scripts/jsdoc_generator.ts
 * public_api: AbddGenerateParams, AbddJsdocParams, AbddReviewParams, AbddAnalyzeParams, AbddWorkflowParams
 * invariants: スクリプトディレクトリとABDDディレクトリはROOT_DIR配下に存在する, spawn出力はMAX_SPAWN_STDIO_BYTES以内に収まる
 * side_effects: ファイルシステムへの読み書き、外部プロセス(spawn)の実行
 * failure_modes: スクリプトファイル不在による実行失敗, タイムアウトによるプロセス強制終了, バッファ上限超過による出力の欠落
 * @abdd.explain
 * overview: ABDDツールセットのメイン拡張機能。外部スクリプトの実行管理とパラメータ定義を担当する。
 * what_it_does:
 *   - 実態ドキュメント生成スクリプト、JSDoc生成スクリプト、レビュー・分析ツールのパラメータ定義
 *   - 外部Nodeプロセスの起動と標準入出力のバッファリング
 *   - ワークフロー実行の設定管理（タイムアウト、エラー時挙動など）
 *   - 乖離分析の型定義（Divergence, Severity）
 * why_it_exists:
 *   - PIエージェントからABDDツール群を統一的に呼び出すため
 *   - プロセス実行時のリソース制限とエラーハンドリングを集約するため
 * scope:
 *   in: ExtensionAPI経由のコマンド呼び出し、TypeBoxスキーマ定義
 *   out: 標準出力への結果返却、AbddError例外のスロー
 */

/**
 * ABDD (As-Built Driven Development) Extension
 *
 * ABDDツール統合拡張機能。実態ドキュメント生成、JSDoc自動生成、
 * 乖離確認を行うためのツールセットを提供する。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { Type, Static } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as ts from "typescript";
import {
	AbddError,
	AbddErrorCodes,
	DEFAULT_TIMEOUT_MS,
	JSDOC_TIMEOUT_MS,
	WORKFLOW_DEFAULT_TIMEOUT_MS,
	validateFilePath,
} from "../lib/abdd-types";

// ============================================================================
// Constants (local only, not duplicated from abdd-types.ts)
// ============================================================================

const ROOT_DIR = process.cwd();
const SCRIPTS_DIR = path.join(ROOT_DIR, "scripts");
const ABDD_DIR = path.join(ROOT_DIR, "ABDD");
const EXTENSIONS_DIR = path.join(ROOT_DIR, ".pi", "extensions");
const MAX_SPAWN_STDIO_BYTES = 256 * 1024;

function appendBoundedOutput(current: string, incoming: string, maxBytes: number): string {
	const next = current + incoming;
	if (Buffer.byteLength(next, "utf-8") <= maxBytes) {
		return next;
	}

	const target = maxBytes - 128;
	let tail = next.slice(-Math.max(target, 1));
	while (Buffer.byteLength(tail, "utf-8") > target && tail.length > 1) {
		tail = tail.slice(1);
	}
	return `...[truncated]\n${tail}`;
}

// ============================================================================
// Path Validation
// ============================================================================

// validateFilePath は abdd-types.ts からインポート

// ============================================================================
// TypeBox Parameter Types with Static inference
// ============================================================================

const AbddGenerateParams = Type.Object({
	dryRun: Type.Optional(Type.Boolean({ description: "ドライラン" })),
	verbose: Type.Optional(Type.Boolean({ description: "詳細ログ" })),
});
type AbddGenerateParamsType = Static<typeof AbddGenerateParams>;

const AbddJsdocParams = Type.Object({
	dryRun: Type.Optional(Type.Boolean({ description: "ドライラン" })),
	check: Type.Optional(Type.Boolean({ description: "CI用チェック" })),
	verbose: Type.Optional(Type.Boolean({ description: "詳細ログ" })),
	limit: Type.Optional(Type.Number({ description: "処理上限" })),
	batchSize: Type.Optional(Type.Number({ description: "バッチ処理サイズ" })),
	file: Type.Optional(Type.String({ description: "特定ファイル" })),
	regenerate: Type.Optional(Type.Boolean({ description: "再生成" })),
	force: Type.Optional(Type.Boolean({ description: "強制再生成" })),
	noCache: Type.Optional(Type.Boolean({ description: "キャッシュ不使用" })),
	metrics: Type.Optional(Type.Boolean({ description: "品質メトリクス" })),
});
type AbddJsdocParamsType = Static<typeof AbddJsdocParams>;

const AbddReviewParams = Type.Object({
	date: Type.Optional(Type.String({ description: "レビュー日付（YYYY-MM-DD）" })),
	showChecklist: Type.Optional(Type.Boolean({ description: "チェックリスト表示" })),
	createRecord: Type.Optional(Type.Boolean({ description: "記録ファイル作成" })),
});
type AbddReviewParamsType = Static<typeof AbddReviewParams>;

const AbddAnalyzeParams = Type.Object({
	verbose: Type.Optional(Type.Boolean({ description: "詳細ログを出力" })),
	checkInvariants: Type.Optional(Type.Boolean({ description: "不変条件チェックを実行（デフォルト: true）" })),
	checkValues: Type.Optional(Type.Boolean({ description: "価値観チェックを実行（デフォルト: true）" })),
	checkJSDoc: Type.Optional(Type.Boolean({ description: "JSDoc欠落チェックを実行（デフォルト: true）" })),
	useAST: Type.Optional(Type.Boolean({ description: "ASTベースの検出を使用（デフォルト: true）" })),
});
type AbddAnalyzeParamsType = Static<typeof AbddAnalyzeParams>;

const AbddWorkflowParams = Type.Object({
	mode: Type.Optional(Type.String({ description: "実行モード: fast（デフォルト）または strict" })),
	dryRun: Type.Optional(Type.Boolean({ description: "ドライラン" })),
	verbose: Type.Optional(Type.Boolean({ description: "詳細ログ" })),
	timeoutMs: Type.Optional(Type.Number({ description: "各ステップのタイムアウト（ミリ秒、デフォルト: 300000 = 5分）" })),
	continueOnError: Type.Optional(Type.Boolean({ description: "エラー時も続行する（デフォルト: true）" })),
});
type AbddWorkflowParamsType = Static<typeof AbddWorkflowParams>;

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

/** spawn実行結果 */
interface SpawnResult {
	success: boolean;
	stdout: string;
	stderr: string;
	timedOut?: boolean;
	exitCode?: number;
}

/**
 * spawnを使用した安全なスクリプト実行関数
 * execSync(args.join(" "))のコマンドインジェクション脆弱性を回避
 */
function runScriptAsync(
	scriptPath: string,
	args: string[],
	options: { timeoutMs?: number; cwd?: string } = {}
): Promise<SpawnResult> {
	const { timeoutMs = DEFAULT_TIMEOUT_MS, cwd = ROOT_DIR } = options;

	return new Promise((resolve) => {
		if (!fs.existsSync(scriptPath)) {
			resolve({
				success: false,
				stdout: "",
				stderr: new AbddError(
					`スクリプトが見つかりません: ${scriptPath}`,
					AbddErrorCodes.SCRIPT_NOT_FOUND
				).message,
			});
			return;
		}

		// shell: falseでコマンドインジェクションを防止
		const fullArgs = ["tsx", scriptPath, ...args];
		const childProcess = spawn("npx", fullArgs, {
			cwd,
			shell: false,
			stdio: ["pipe", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let timedOut = false;

		const timeoutId = setTimeout(() => {
			timedOut = true;
			childProcess.kill("SIGTERM");
		}, timeoutMs);

		childProcess.stdout?.on("data", (data: Buffer) => {
			stdout = appendBoundedOutput(stdout, data.toString(), MAX_SPAWN_STDIO_BYTES);
		});

		childProcess.stderr?.on("data", (data: Buffer) => {
			stderr = appendBoundedOutput(stderr, data.toString(), MAX_SPAWN_STDIO_BYTES);
		});

		childProcess.on("close", (code) => {
			clearTimeout(timeoutId);
			resolve({
				success: code === 0 && !timedOut,
				stdout,
				stderr,
				timedOut,
				exitCode: code ?? undefined,
			});
		});

		childProcess.on("error", (error) => {
			clearTimeout(timeoutId);
			resolve({
				success: false,
				stdout,
				stderr: error.message,
			});
		});
	});
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
		parameters: AbddGenerateParams,
		async execute(_toolCallId, params: AbddGenerateParamsType, _signal, _onUpdate, _ctx) {
			const scriptPath = path.join(SCRIPTS_DIR, "generate-abdd.ts");

			// 引数を構築（安全に配列として渡す）
			const args: string[] = [];
			if (params.dryRun === true) args.push("--dry-run");
			if (params.verbose === true) args.push("--verbose");

			const result = await runScriptAsync(scriptPath, args, { timeoutMs: DEFAULT_TIMEOUT_MS });

			if (!result.success) {
				const errorMsg = result.timedOut
					? `タイムアウト (${DEFAULT_TIMEOUT_MS / 1000}秒)`
					: result.stderr || `終了コード: ${result.exitCode}`;
				return {
					content: [{
						type: "text" as const,
						text: `エラー: ${errorMsg}\n\nヒント: mmdc (Mermaid CLI) がインストールされているか確認してください: npm install -g @mermaid-js/mermaid-cli`
					}],
					details: { success: false, error: errorMsg },
				};
			}

			return {
				content: [{
					type: "text" as const,
					text: `実態ドキュメントの生成が完了しました\n\n出力先: ${ABDD_DIR}\n\n${result.stdout}`
				}],
				details: { success: true, output: result.stdout, outputDir: ABDD_DIR },
			};
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
		parameters: AbddJsdocParams,
		async execute(_toolCallId, params: AbddJsdocParamsType, _signal, _onUpdate, _ctx) {
			const scriptPath = path.join(SCRIPTS_DIR, "add-jsdoc.ts");

			// 引数を構築（安全に配列として渡す）
			const args: string[] = [];
			if (params.dryRun === true) args.push("--dry-run");
			if (params.check === true) args.push("--check");
			if (params.verbose === true) args.push("--verbose");
			if (params.limit !== undefined) args.push("--limit", String(params.limit));
			if (params.batchSize !== undefined) args.push("--batch-size", String(params.batchSize));
			// パストラバーサル対策: fileパラメータを検証
			if (params.file !== undefined) {
				const validatedPath = validateFilePath(params.file, EXTENSIONS_DIR);
				args.push("--file", validatedPath);
			}
			if (params.regenerate === true) args.push("--regenerate");
			if (params.force === true) args.push("--force");
			if (params.noCache === true) args.push("--no-cache");
			if (params.metrics === true) args.push("--metrics");

			const result = await runScriptAsync(scriptPath, args, { timeoutMs: JSDOC_TIMEOUT_MS });

			if (!result.success) {
				const errorMsg = result.timedOut
					? `タイムアウト (${JSDOC_TIMEOUT_MS / 1000}秒)`
					: result.stderr || result.stdout || `終了コード: ${result.exitCode}`;

				if (params.check === true) {
					return {
						content: [{
							type: "text" as const,
							text: `JSDocがない要素が見つかりました\n\n${errorMsg}\n\nヒント: npx tsx scripts/add-jsdoc.ts --dry-run で詳細を確認してください`
						}],
						details: { success: false, error: "JSDoc missing", output: errorMsg },
					};
				}

				return {
					content: [{
						type: "text" as const,
						text: `エラー: ${errorMsg}\n\nヒント: APIキーが設定されているか確認してください（~/.pi/agent/auth.json）`
					}],
					details: { success: false, error: errorMsg },
				};
			}

			return {
				content: [{
					type: "text" as const,
					text: `JSDoc生成が完了しました\n\n${result.stdout}`
				}],
				details: { success: true, output: result.stdout },
			};
		},
	});

	// Tool: abdd_review - 乖離確認
	pi.registerTool({
		name: "abdd_review",
		label: "ABDD Review",
		description: `ABDD乖離確認ツール。意図記述と実態記述の乖離を確認するためのチェックリストを表示・作成。

確認項目: philosophy.mdの価値観、spec.mdの不変条件、契約、境界条件
レビュー記録: createRecord: true で ABDD/reviews/YYYY-MM-DD.md に記録を作成`,
		parameters: AbddReviewParams,
		async execute(_toolCallId, params: AbddReviewParamsType, _signal, _onUpdate, _ctx) {
			const showChecklist = params.showChecklist !== false;
			const createRecord = params.createRecord === true;
			const dateStr = params.date || new Date().toISOString().split("T")[0];

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
		description: `ABDD乖離分析ツール。意図記述（philosophy.md、spec.md）と実態記述（ABDD/.pi/**/*.md）およびソースコードを比較し、乖離候補を抽出。

検出パターン:
1. 不変条件違反: spec.mdの未チェック項目と実装の不一致
2. 価値観ミスマッチ: philosophy.mdの禁則パターンの検出
   - テキストベース: ドキュメント内のコードブロックを検査
   - ASTベース: ソースコードを直接AST解析（高精度）
3. 契約違反: インターフェースの約束と実装の不一致

AST検出の特徴:
- exec/spawn系の呼び出しを構文的に検出
- テストコード・モックを自動除外
- 偽陽性を大幅に削減

出力形式:
\`\`\`typescript
{
  divergences: { type, severity, intention, reality, reason }[],
  summary: { total, high, medium, low }
}
\`\`\`

注意: テキストベース検出は偽陽性を含む可能性があります。AST検出（useAST: true）を推奨。`,
		parameters: AbddAnalyzeParams,
		async execute(_toolCallId, params: AbddAnalyzeParamsType, _signal, _onUpdate, _ctx) {
			const verbose = params.verbose === true;
			const checkInvariants = params.checkInvariants !== false;
			const checkValues = params.checkValues !== false;
			const checkJSDoc = params.checkJSDoc !== false;

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

			// 2. 価値観ミスマッチの検出（テキストベース）
			if (checkValues && philosophyContent) {
				const valueDivergences = detectValueMismatches(philosophyContent, realityFiles);
				divergences.push(...valueDivergences);
			}

			// 3. JSDoc欠落の検出
			if (checkJSDoc && realityFiles.length > 0) {
				const jsdocDivergences = detectJSDocMissing(realityFiles);
				divergences.push(...jsdocDivergences);
			}

			// 4. ASTベースの価値観ミスマッチ検出（高精度）
			if (params.useAST !== false && checkValues) {
				try {
					const astDivergences = runASTDetection(verbose);
					// テキストベースと重複する可能性があるため、フィルタリング
					for (const astDiv of astDivergences) {
						const isDuplicate = divergences.some(
							(existing) =>
								existing.type === astDiv.type &&
								existing.reality.text === astDiv.reality.text
						);
						if (!isDuplicate) {
							divergences.push(astDiv);
						}
					}
				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : String(error);
					warnings.push(`AST検出でエラーが発生しました: ${errorMsg}`);
				}
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

	// Tool: abdd_workflow - 統合実行フロー
	pi.registerTool({
		name: "abdd_workflow",
		label: "ABDD Workflow",
		description: `ABDD実行フローを統合実行。通常モード（fast）と厳格モード（strict）の2系統を提供。

fast（通常）: generate-abddのみ実行。日常運用向け。高速。
strict（厳格）: add-abdd-header --regenerate → add-jsdoc --regenerate → generate-abdd。PR前・大規模変更向け。

注意: 各ステップにはタイムアウト（デフォルト5分）が設定されています。LLM応答がない場合は自動的に次のステップに進みます。`,
		parameters: AbddWorkflowParams,
		async execute(_toolCallId, params: AbddWorkflowParamsType, _signal, _onUpdate, _ctx) {
			const mode = params.mode || "fast";

			if (mode !== "fast" && mode !== "strict") {
				return {
					content: [{ type: "text" as const, text: `エラー: modeは 'fast' または 'strict' を指定してください（指定値: ${mode}）` }],
					details: { success: false, error: "Invalid mode" },
				};
			}

			const dryRun = params.dryRun === true;
			const verbose = params.verbose === true;
			const timeoutMs = params.timeoutMs || WORKFLOW_DEFAULT_TIMEOUT_MS;
			const continueOnError = params.continueOnError !== false;
			const baseArgs: string[] = [];
			if (dryRun) baseArgs.push("--dry-run");
			if (verbose) baseArgs.push("--verbose");

			const results: { step: string; success: boolean; output: string; timedOut?: boolean }[] = [];

			// spawnを使用したタイムアウト付き実行関数
			const runStepAsync = (stepName: string, scriptName: string, extraArgs: string[] = []): Promise<boolean> => {
				return new Promise((resolve) => {
					const scriptPath = path.join(SCRIPTS_DIR, scriptName);
					if (!fs.existsSync(scriptPath)) {
						results.push({ step: stepName, success: false, output: `スクリプトが見つかりません: ${scriptPath}` });
						resolve(false);
						return;
					}

					const args = ["tsx", scriptPath, ...baseArgs, ...extraArgs];
					let stdout = "";
					let stderr = "";

					const childProcess = spawn("npx", args, {
						cwd: ROOT_DIR,
						shell: false,
						stdio: ["pipe", "pipe", "pipe"],
					});

					const timeoutId = setTimeout(() => {
						childProcess.kill("SIGTERM");
						results.push({
							step: stepName,
							success: false,
							output: `タイムアウト (${timeoutMs / 1000}秒) - プロセスを終了しました\n${stdout.slice(-1000)}`,
							timedOut: true,
						});
						resolve(false);
					}, timeoutMs);

					childProcess.stdout?.on("data", (data: Buffer) => {
						stdout = appendBoundedOutput(stdout, data.toString(), MAX_SPAWN_STDIO_BYTES);
					});

					childProcess.stderr?.on("data", (data: Buffer) => {
						stderr = appendBoundedOutput(stderr, data.toString(), MAX_SPAWN_STDIO_BYTES);
					});

					childProcess.on("close", (code) => {
						clearTimeout(timeoutId);
						if (code === 0) {
							results.push({ step: stepName, success: true, output: stdout.slice(-2000) });
							resolve(true);
						} else {
							results.push({
								step: stepName,
								success: false,
								output: `終了コード: ${code}\n${stdout.slice(-1000)}\n${stderr.slice(-500)}`,
							});
							resolve(false);
						}
					});

					childProcess.on("error", (error) => {
						clearTimeout(timeoutId);
						results.push({ step: stepName, success: false, output: `プロセスエラー: ${error.message}` });
						resolve(false);
					});
				});
			};

			if (mode === "fast") {
				// 通常モード: generate-abddのみ
				await runStepAsync("generate-abdd", "generate-abdd.ts");
			} else {
				// 厳格モード: header → jsdoc → generate
				const headerOk = await runStepAsync("add-abdd-header", "add-abdd-header.ts", ["--regenerate"]);
				if (continueOnError || headerOk) {
					const jsdocOk = await runStepAsync("add-jsdoc", "add-jsdoc.ts", ["--regenerate"]);
					if (continueOnError || jsdocOk) {
						await runStepAsync("generate-abdd", "generate-abdd.ts");
					}
				}
			}

			const allSuccess = results.every(r => r.success);
			const summary = results.map(r => `${r.step}: ${r.success ? "成功" : "失敗"}${r.timedOut ? " (タイムアウト)" : ""}`).join("\n");

			let output = `ABDD workflow (${mode}) 完了\n\n${summary}\n\n`;
			if (verbose) {
				output += "=== 詳細ログ ===\n";
				for (const r of results) {
					output += `\n--- ${r.step} ---\n${r.output}\n`;
				}
			}

			return {
				content: [{ type: "text" as const, text: output }],
				details: { success: allSuccess, mode, results, timeoutMs },
			};
		},
	});

	console.log("ABDD extension loaded: abdd_generate, abdd_jsdoc, abdd_review, abdd_analyze, abdd_workflow");
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

// ============================================================================
// AST-Based Divergence Detection
// ============================================================================

/** AST検出用パターン定義 */
interface ASTDetectionPattern {
	type: DivergenceType;
	severity: Severity;
	pattern: RegExp;
	description: string;
	philosophyRef: string;
}

/** AST検出用コンテキスト */
interface ASTNodeContext {
	isInTest: boolean;
	isInMock: boolean;
	isInTypeDefinition: boolean;
	parentFunctionName: string | null;
	parentClassName: string | null;
	sourceFile: ts.SourceFile;
}

/** AST検出結果 */
interface ASTDetectionResult {
	divergence: Divergence;
	location: {
		file: string;
		line: number;
		column: number;
	};
	context: ASTNodeContext;
}

/** 禁止パターン定義（AST検出用） */
const AST_PROHIBITION_PATTERNS: ASTDetectionPattern[] = [
	// Git関連
	{
		type: "value_mismatch",
		severity: "high",
		pattern: /\bgit\s+add\s+\./,
		description: "git add . の使用",
		philosophyRef: "git add .の安易な使用は禁止",
	},
	{
		type: "value_mismatch",
		severity: "high",
		pattern: /\bgit\s+add\s+-A\b/,
		description: "git add -A の使用",
		philosophyRef: "git add -Aの安易な使用は禁止",
	},
	{
		type: "value_mismatch",
		severity: "high",
		pattern: /\bgit\s+add\s+--all\b/,
		description: "git add --all の使用",
		philosophyRef: "git add --allの安易な使用は禁止",
	},
	// セキュリティ関連
	{
		type: "invariant_violation",
		severity: "high",
		pattern: /\bpassword\s*[:=]\s*["'][^"']+["']/i,
		description: "パスワードのハードコード",
		philosophyRef: "機密情報は環境変数で管理",
	},
	{
		type: "invariant_violation",
		severity: "high",
		pattern: /\bapi[_-]?key\s*[:=]\s*["'][^"']+["']/i,
		description: "APIキーのハードコード",
		philosophyRef: "機密情報は環境変数で管理",
	},
	{
		type: "invariant_violation",
		severity: "high",
		pattern: /\bsecret[_-]?key\s*[:=]\s*["'][^"']+["']/i,
		description: "シークレットキーのハードコード",
		philosophyRef: "機密情報は環境変数で管理",
	},
	{
		type: "invariant_violation",
		severity: "high",
		pattern: /\bprivate[_-]?key\s*[:=]\s*["']-----BEGIN/i,
		description: "秘密鍵のハードコード",
		philosophyRef: "機密情報は環境変数で管理",
	},
	{
		type: "invariant_violation",
		severity: "high",
		pattern: /\btoken\s*[:=]\s*["'][a-zA-Z0-9_-]{20,}["']/i,
		description: "トークンのハードコード",
		philosophyRef: "機密情報は環境変数で管理",
	},
	// 危険な関数
	{
		type: "value_mismatch",
		severity: "medium",
		pattern: /\beval\s*\(/,
		description: "eval()の使用",
		philosophyRef: "evalの使用はセキュリティリスクがあるため避ける",
	},
	{
		type: "value_mismatch",
		severity: "medium",
		pattern: /\bFunction\s*\(/,
		description: "Function()コンストラクタの使用",
		philosophyRef: "動的コード生成はセキュリティリスクがあるため避ける",
	},
];

/** コマンド実行関数のリスト */
const COMMAND_EXEC_FUNCTIONS = [
	"exec",
	"execSync",
	"spawn",
	"spawnSync",
	"execFile",
	"execFileSync",
	"execa",
	"execaSync",
	"$",
	"run",
];

/** テスト関数パターン */
const TEST_FUNCTION_PATTERNS = [
	"describe",
	"it",
	"test",
	"beforeEach",
	"afterEach",
	"beforeAll",
	"afterAll",
	"expect",
];

/**
 * ASTベースの乖離検出器
 * ソースコードを直接AST解析し、価値観・不変条件の違反を高精度で検出する
 * 
 * データフロー解析により、変数経由の実行も検出可能:
 * - const cmd = "git add ."; execSync(cmd); → 検出可能
 * - const flag = "."; execSync(`git add ${flag}`); → 部分検出
 */
export class ASTDivergenceDetector {
	private divergences: ASTDetectionResult[] = [];
	
	/** 変数の値を追跡するマップ（スコープ単位） */
	private variableValues: Map<string, string> = new Map();

	/**
	 * ファイルを解析して乖離を検出
	 */
	analyzeFile(filePath: string): ASTDetectionResult[] {
		if (!fs.existsSync(filePath)) {
			return [];
		}

		const sourceCode = fs.readFileSync(filePath, "utf-8");
		const sourceFile = ts.createSourceFile(
			filePath,
			sourceCode,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TSX
		);

		this.divergences = [];
		this.variableValues = new Map(); // ファイルごとにリセット
		this.visitNode(sourceFile, sourceFile, this.createInitialContext(sourceFile));
		return this.divergences;
	}

	/**
	 * 複数ファイルを一括解析
	 */
	analyzeFiles(filePaths: string[]): ASTDetectionResult[] {
		const allResults: ASTDetectionResult[] = [];
		for (const filePath of filePaths) {
			try {
				const results = this.analyzeFile(filePath);
				allResults.push(...results);
			} catch (error) {
				// エラーが発生したファイルはスキップ
				console.warn(`[AST] 解析エラー: ${filePath}`, error);
			}
		}
		return allResults;
	}

	/**
	 * 初期コンテキスト作成
	 */
	private createInitialContext(sourceFile: ts.SourceFile): ASTNodeContext {
		return {
			isInTest: false,
			isInMock: false,
			isInTypeDefinition: false,
			parentFunctionName: null,
			parentClassName: null,
			sourceFile,
		};
	}

	/**
	 * ASTノードを再帰的に訪問
	 */
	private visitNode(
		node: ts.Node,
		sourceFile: ts.SourceFile,
		context: ASTNodeContext
	): void {
		// コンテキストを更新
		const updatedContext = this.updateContext(node, context);

		// ノードタイプ別の処理
		if (ts.isCallExpression(node)) {
			this.checkCallExpression(node, sourceFile, updatedContext);
		} else if (ts.isPropertyAssignment(node)) {
			this.checkPropertyAssignment(node, sourceFile, updatedContext);
		} else if (ts.isVariableDeclaration(node)) {
			// 変数宣言を追跡（データフロー解析）
			this.trackVariableDeclaration(node);
		}

		// 子ノードを再帰的に訪問
		ts.forEachChild(node, (child) => {
			this.visitNode(child, sourceFile, updatedContext);
		});
	}

	/**
	 * コンテキストを更新
	 */
	private updateContext(node: ts.Node, context: ASTNodeContext): ASTNodeContext {
		const newContext = { ...context };

		// 関数内かどうか
		if (ts.isFunctionDeclaration(node) && node.name) {
			newContext.parentFunctionName = node.name.text;
			newContext.isInTest = this.isTestFunction(node.name.text);
		}

		// メソッド内かどうか
		if (ts.isMethodDeclaration(node)) {
			const methodName = (node.name as ts.Identifier).text;
			newContext.parentFunctionName = methodName;
			newContext.isInTest = this.isTestFunction(methodName);
		}

		// アロー関数の変数宣言
		if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
			newContext.parentFunctionName = node.name.text;
			newContext.isInTest = this.isTestFunction(node.name.text);
		}

		// クラス内かどうか
		if (ts.isClassDeclaration(node) && node.name) {
			newContext.parentClassName = node.name.text;
		}

		// 型定義内かどうか
		if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
			newContext.isInTypeDefinition = true;
		}

		// モック内かどうか
		if (ts.isCallExpression(node) && this.isMockContext(node)) {
			newContext.isInMock = true;
		}

		return newContext;
	}

	/**
	 * テスト関数かどうか判定
	 */
	private isTestFunction(name: string): boolean {
		return TEST_FUNCTION_PATTERNS.some(
			(pattern) =>
				name === pattern ||
				name.startsWith(pattern) ||
				name.endsWith(pattern)
		);
	}

	/**
	 * モックコンテキストかどうか判定
	 */
	private isMockContext(node: ts.CallExpression): boolean {
		const callee = node.expression;
		if (ts.isIdentifier(callee)) {
			const name = callee.text;
			return (
				name.includes("mock") ||
				name.includes("stub") ||
				name.includes("fake") ||
				name === "jest.fn" ||
				name === "vi.fn" ||
				name === "sinon"
			);
		}
		if (ts.isPropertyAccessExpression(callee)) {
			const fullText = callee.getText();
			return (
				fullText.includes("mock") ||
				fullText.includes("stub") ||
				fullText.includes("fn")
			);
		}
		return false;
	}

	/**
	 * CallExpression をチェック
	 */
	private checkCallExpression(
		node: ts.CallExpression,
		sourceFile: ts.SourceFile,
		context: ASTNodeContext
	): void {
		// テスト・モック内はスキップ
		if (context.isInTest || context.isInMock) return;

		const callee = node.expression;
		const functionName = this.getFunctionName(callee);

		// コマンド実行関数かチェック
		if (functionName && COMMAND_EXEC_FUNCTIONS.includes(functionName)) {
			const args = node.arguments;
			if (args.length > 0) {
				const firstArg = args[0];
				this.checkCommandArgument(firstArg, sourceFile, context);
			}
		}
	}

	/**
	 * 関数名を取得
	 */
	private getFunctionName(expr: ts.Expression): string | null {
		if (ts.isIdentifier(expr)) {
			return expr.text;
		}
		if (ts.isPropertyAccessExpression(expr)) {
			return expr.name.text;
		}
		return null;
	}

	/**
	 * コマンド引数をチェック
	 */
	private checkCommandArgument(
		arg: ts.Expression,
		sourceFile: ts.SourceFile,
		context: ASTNodeContext
	): void {
		if (ts.isStringLiteral(arg)) {
			// 直接文字列リテラル
			this.checkStringForPatterns(arg.text, arg, sourceFile, context);
		} else if (ts.isNoSubstitutionTemplateLiteral(arg)) {
			// テンプレートリテラル（変数なし）
			this.checkStringForPatterns(arg.text, arg, sourceFile, context);
		} else if (ts.isTemplateExpression(arg)) {
			// テンプレート式（変数展開あり）
			const resolvedText = this.resolveTemplateExpression(arg);
			this.checkStringForPatterns(resolvedText, arg, sourceFile, context);
		} else if (ts.isIdentifier(arg)) {
			// 変数参照 → データフロー解析で解決
			const resolvedValue = this.resolveVariable(arg.text);
			if (resolvedValue) {
				this.checkStringForPatterns(resolvedValue, arg, sourceFile, context);
			}
		} else if (ts.isPropertyAccessExpression(arg)) {
			// オブジェクトプロパティアクセス (例: commands.stage)
			const resolvedValue = this.resolvePropertyAccess(arg);
			if (resolvedValue) {
				this.checkStringForPatterns(resolvedValue, arg, sourceFile, context);
			}
		}
	}

	/**
	 * 変数宣言を追跡（データフロー解析）
	 */
	private trackVariableDeclaration(node: ts.VariableDeclaration): void {
		if (!node.name || !ts.isIdentifier(node.name)) return;

		const varName = node.name.text;
		const initializer = node.initializer;
		if (!initializer) return;

		// 文字列リテラルの場合
		if (ts.isStringLiteral(initializer)) {
			this.variableValues.set(varName, initializer.text);
			return;
		}

		// テンプレートリテラルの場合
		if (ts.isNoSubstitutionTemplateLiteral(initializer)) {
			this.variableValues.set(varName, initializer.text);
			return;
		}

		// テンプレート式の場合（部分的に追跡）
		if (ts.isTemplateExpression(initializer)) {
			const resolvedText = this.resolveTemplateExpression(initializer);
			this.variableValues.set(varName, resolvedText);
			return;
		}

		// 他の変数への参照の場合
		if (ts.isIdentifier(initializer)) {
			const resolvedValue = this.variableValues.get(initializer.text);
			if (resolvedValue) {
				this.variableValues.set(varName, resolvedValue);
			}
		}
	}

	/**
	 * 変数の値を解決
	 */
	private resolveVariable(varName: string): string | undefined {
		return this.variableValues.get(varName);
	}

	/**
	 * テンプレート式を解決（変数展開を試みる）
	 */
	private resolveTemplateExpression(node: ts.TemplateExpression): string {
		let result = node.head.text;

		for (const span of node.templateSpans) {
			const expr = span.expression;
			let resolvedValue = "";

			if (ts.isIdentifier(expr)) {
				resolvedValue = this.variableValues.get(expr.text) || `\${${expr.text}}`;
			} else if (ts.isStringLiteral(expr)) {
				resolvedValue = expr.text;
			} else if (ts.isPropertyAccessExpression(expr)) {
				resolvedValue = this.resolvePropertyAccess(expr) || `\${${expr.getText()}}`;
			} else {
				resolvedValue = `\${${expr.getText()}}`;
			}

			result += resolvedValue + span.literal.text;
		}

		return result;
	}

	/**
	 * プロパティアクセスを解決 (例: obj.prop)
	 */
	private resolvePropertyAccess(node: ts.PropertyAccessExpression): string | undefined {
		// obj.prop の形式のみサポート
		if (!ts.isIdentifier(node.expression)) return undefined;

		const objName = node.expression.text;
		const propName = node.name.text;

		// オブジェクト変数の値を取得（例: "stage:git add ."のような形式で保存されている場合）
		const objValue = this.variableValues.get(objName);
		if (!objValue) return undefined;

		// 簡易的な解析: "propName:value" の形式を探す
		const propPattern = new RegExp(`${propName}\\s*:\\s*["']?([^,"'}]+)["']?`);
		const match = objValue.match(propPattern);
		if (match) {
			return match[1].trim();
		}

		return undefined;
	}

	/**
	 * StringLiteral をチェック（CallExpressionの引数の場合のみ）
	 */
	private checkStringLiteral(
		node: ts.StringLiteral,
		sourceFile: ts.SourceFile,
		context: ASTNodeContext
	): void {
		// 親がCallExpressionで、それがコマンド実行関数の場合のみチェック
		const parent = node.parent;
		if (parent && ts.isCallExpression(parent)) {
			const functionName = this.getFunctionName(parent.expression);
			if (functionName && COMMAND_EXEC_FUNCTIONS.includes(functionName)) {
				this.checkStringForPatterns(node.text, node, sourceFile, context);
			}
		}
	}

	/**
	 * TemplateLiteral をチェック
	 */
	private checkTemplateLiteral(
		node: ts.NoSubstitutionTemplateLiteral,
		sourceFile: ts.SourceFile,
		context: ASTNodeContext
	): void {
		// 親がCallExpressionで、それがコマンド実行関数の場合のみチェック
		const parent = node.parent;
		if (parent && ts.isCallExpression(parent)) {
			const functionName = this.getFunctionName(parent.expression);
			if (functionName && COMMAND_EXEC_FUNCTIONS.includes(functionName)) {
				this.checkStringForPatterns(node.text, node, sourceFile, context);
			}
		}
	}

	/**
	 * PropertyAssignment をチェック
	 */
	private checkPropertyAssignment(
		node: ts.PropertyAssignment,
		sourceFile: ts.SourceFile,
		context: ASTNodeContext
	): void {
		const initializer = node.initializer;

		// 文字列リテラルの場合 - すべてのプロパティをチェック
		if (ts.isStringLiteral(initializer)) {
			this.checkStringForPatterns(
				initializer.text,
				node,
				sourceFile,
				context
			);
			return;
		}

		// テンプレートリテラルの場合
		if (ts.isTemplateExpression(initializer)) {
			const resolvedText = this.resolveTemplateExpression(initializer);
			this.checkStringForPatterns(
				resolvedText,
				node,
				sourceFile,
				context
			);
			return;
		}

		// 他の変数への参照の場合
		if (ts.isIdentifier(initializer)) {
			const resolvedValue = this.resolveVariable(initializer.text);
			if (resolvedValue) {
				this.checkStringForPatterns(
					resolvedValue,
					node,
					sourceFile,
					context
				);
			}
		}
	}

	/**
	 * 文字列をパターンと照合
	 */
	private checkStringForPatterns(
		text: string,
		node: ts.Node,
		sourceFile: ts.SourceFile,
		context: ASTNodeContext
	): void {
		for (const pattern of AST_PROHIBITION_PATTERNS) {
			pattern.pattern.lastIndex = 0; // リセット
			if (pattern.pattern.test(text)) {
				// 除外条件をチェック
				if (this.shouldExclude(text, context)) continue;

				const location = this.getNodeLocation(node, sourceFile);

				this.divergences.push({
					divergence: {
						type: pattern.type,
						severity: pattern.severity,
						intention: {
							source: "philosophy.md",
							text: pattern.philosophyRef,
						},
						reality: {
							file: sourceFile.fileName,
							text: text,
						},
						reason: `禁止パターン「${pattern.description}」が検出されました`,
					},
					location,
					context,
				});
			}
		}
	}

	/**
	 * 除外すべきか判定
	 */
	private shouldExclude(text: string, context: ASTNodeContext): boolean {
		// テスト内は除外
		if (context.isInTest) return true;

		// モック内は除外
		if (context.isInMock) return true;

		// 型定義内は除外
		if (context.isInTypeDefinition) return true;

		// コメント的な文字列（例示を示す）は除外
		const commentaryIndicators = [
			"例:",
			"例示",
			"NG:",
			"禁止",
			"使用しない",
			"avoid",
			"do not",
			"don't",
		];
		if (commentaryIndicators.some((ind) => text.toLowerCase().includes(ind.toLowerCase()))) {
			return true;
		}

		return false;
	}

	/**
	 * ノードの位置情報を取得
	 */
	private getNodeLocation(
		node: ts.Node,
		sourceFile: ts.SourceFile
	): { file: string; line: number; column: number } {
		const { line, character } = sourceFile.getLineAndCharacterOfPosition(
			node.getStart()
		);
		return {
			file: path.relative(ROOT_DIR, sourceFile.fileName),
			line: line + 1,
			column: character + 1,
		};
	}
}

/**
 * TypeScriptファイルを再帰的に収集
 */
function collectTypeScriptFiles(dir: string): string[] {
	const files: string[] = [];

	if (!fs.existsSync(dir)) return files;

	const entries = fs.readdirSync(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectTypeScriptFiles(fullPath));
		} else if (
			entry.isFile() &&
			(entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
			!entry.name.endsWith(".d.ts")
		) {
			files.push(fullPath);
		}
	}

	return files;
}

/**
 * AST検出を実行して乖離リストを返す
 */
function runASTDetection(verbose: boolean): Divergence[] {
	const detector = new ASTDivergenceDetector();

	// 解析対象ファイルを収集
	const files = [
		...collectTypeScriptFiles(EXTENSIONS_DIR),
		...collectTypeScriptFiles(path.join(ROOT_DIR, ".pi", "lib")),
	];

	if (verbose) {
		console.log(`[AST] 解析対象: ${files.length} ファイル`);
	}

	// 解析実行
	const results = detector.analyzeFiles(files);

	if (verbose && results.length > 0) {
		console.log(`[AST] 検出結果: ${results.length} 件`);
		for (const result of results) {
			console.log(
				`  - ${result.location.file}:${result.location.line} - ${result.divergence.reason}`
			);
		}
	}

	return results.map((r) => r.divergence);
}
