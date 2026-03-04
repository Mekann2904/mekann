/**
 * @abdd.meta
 * path: .pi/lib/plan-comparator.ts
 * role: plan.md（意図記述）と実装（実態記述）の比較ライブラリ
 * why: ULモードで作成されたplan.mdが実装と乖離していないかを検出するため
 * related: .pi/extensions/abdd.ts, .pi/ul-workflow/
 * public_api: PlanComparator, CompareResult, Divergence
 * invariants: planPathは存在する.mdファイルである, 結果はDivergence配列を含む
 * side_effects: ファイルシステム読み込み, gitコマンド実行
 * failure_modes: plan.mdが存在しない, gitリポジトリではない
 * @abdd.explain
 * overview: plan.mdをパースして構造化し、実装コードと比較して乖離を検出する
 * what_it_does:
 *   - plan.mdの目的・変更内容・Todoセクションを抽出
 *   - 実装ファイルの変更内容をgit diffから抽出
 *   - 目的と実装の整合性、Todo完了状況、考慮事項の反映を確認
 * why_it_exists:
 *   - 意図記述（plan）と実態記述（実装）の乖離を自動検出するため
 * scope:
 *   in: plan.mdパス, 比較対象のgitコミット範囲
 *   out: 乖離リスト（Divergence[]）とサマリー
 */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, basename } from "node:path";

// ============================================================================
// Types
// ============================================================================

export interface PlanSection {
	type: "objective" | "change" | "todo" | "consideration" | "procedure";
	title: string;
	content: string;
	items: string[];
	completed?: boolean;
}

export interface PlanInfo {
	title: string;
	createdAt: string;
	sections: PlanSection[];
	rawContent: string;
}

export interface Divergence {
	type: "missing_implementation" | "extra_implementation" | "incomplete_todo" | "unaddressed_concern" | "scope_drift";
	severity: "high" | "medium" | "low";
	planSection: string;
	description: string;
	evidence?: string;
}

export interface CompareResult {
	planPath: string;
	planTitle: string;
	divergences: Divergence[];
	summary: {
		total: number;
		high: number;
		medium: number;
		low: number;
		coverage: number;
	};
	implementedFiles: string[];
	planMentions: string[];
}

export interface CompareOptions {
	verbose?: boolean;
	baseCommit?: string;
	headCommit?: string;
}

// ============================================================================
// Plan Parser
// ============================================================================

/**
 * plan.mdをパースして構造化
 */
export function parsePlanMd(planPath: string): PlanInfo {
	if (!existsSync(planPath)) {
		throw new Error(`plan.md not found: ${planPath}`);
	}

	const content = readFileSync(planPath, "utf-8");
	const lines = content.split("\n");

	// タイトル抽出
	const titleMatch = content.match(/^#\s+(.+)$/m);
	const title = titleMatch ? titleMatch[1] : "Untitled Plan";

	// 作成日抽出
	const dateMatch = content.match(/\*\*作成日\*\*:\s*(.+)/);
	const createdAt = dateMatch ? dateMatch[1].trim() : "Unknown";

	// セクション抽出
	const sections: PlanSection[] = [];

	// 目的セクション
	const objectiveMatch = content.match(/##\s*目的\s*\n([\s\S]*?)(?=\n##|$)/);
	if (objectiveMatch) {
		sections.push({
			type: "objective",
			title: "目的",
			content: objectiveMatch[1].trim(),
			items: extractBulletItems(objectiveMatch[1]),
		});
	}

	// 変更内容セクション
	const changeMatch = content.match(/##\s*変更内容\s*\n([\s\S]*?)(?=\n##|$)/);
	if (changeMatch) {
		sections.push({
			type: "change",
			title: "変更内容",
			content: changeMatch[1].trim(),
			items: extractChangeItems(changeMatch[1]),
		});
	}

	// 手順セクション
	const procedureMatch = content.match(/##\s*手順\s*\n([\s\S]*?)(?=\n##|$)/);
	if (procedureMatch) {
		sections.push({
			type: "procedure",
			title: "手順",
			content: procedureMatch[1].trim(),
			items: extractNumberedItems(procedureMatch[1]),
		});
	}

	// 考慮事項セクション
	const considerationMatch = content.match(/##\s*考慮事項\s*\n([\s\S]*?)(?=\n##|$)/);
	if (considerationMatch) {
		sections.push({
			type: "consideration",
			title: "考慮事項",
			content: considerationMatch[1].trim(),
			items: extractBulletItems(considerationMatch[1]),
		});
	}

	// Todoセクション
	const todoMatch = content.match(/##\s*Todo\s*\n([\s\S]*?)(?=\n##|$)/);
	if (todoMatch) {
		const todoItems = extractTodoItems(todoMatch[1]);
		sections.push({
			type: "todo",
			title: "Todo",
			content: todoMatch[1].trim(),
			items: todoItems.map((t) => t.text),
			completed: todoItems.every((t) => t.completed),
		});
	}

	return {
		title,
		createdAt,
		sections,
		rawContent: content,
	};
}

/**
 * 箇条書きアイテムを抽出
 */
function extractBulletItems(text: string): string[] {
	const items: string[] = [];
	const lines = text.split("\n");
	for (const line of lines) {
		const match = line.match(/^[-*]\s+(.+)/);
		if (match) {
			items.push(match[1].trim());
		}
	}
	return items;
}

/**
 * 変更内容アイテムを抽出（番号付き）
 */
function extractChangeItems(text: string): string[] {
	const items: string[] = [];
	const lines = text.split("\n");
	let currentItem = "";

	for (const line of lines) {
		const match = line.match(/^###\s*(\d+)\.\s*(.+)/);
		if (match) {
			if (currentItem) items.push(currentItem);
			currentItem = match[2].trim();
		} else if (currentItem && line.trim()) {
			currentItem += " " + line.trim();
		}
	}
	if (currentItem) items.push(currentItem);

	return items;
}

/**
 * 番号付きアイテムを抽出
 */
function extractNumberedItems(text: string): string[] {
	const items: string[] = [];
	const lines = text.split("\n");

	for (const line of lines) {
		const match = line.match(/^\d+\.\s+(.+)/);
		if (match) {
			items.push(match[1].trim());
		}
	}
	return items;
}

/**
 * Todoアイテムを抽出
 */
function extractTodoItems(text: string): { text: string; completed: boolean }[] {
	const items: { text: string; completed: boolean }[] = [];
	const lines = text.split("\n");

	for (const line of lines) {
		const match = line.match(/^-\s*\[([ xX])\]\s*(.+)/);
		if (match) {
			items.push({
				completed: match[1].toLowerCase() === "x",
				text: match[2].trim(),
			});
		}
	}
	return items;
}

// ============================================================================
// Git Integration
// ============================================================================

/**
 * 指定コミット範囲の変更ファイルを取得
 */
export function getChangedFiles(baseCommit?: string, headCommit?: string): string[] {
	try {
		let cmd: string;
		if (baseCommit && headCommit) {
			cmd = `git diff --name-only ${baseCommit}..${headCommit}`;
		} else if (baseCommit) {
			cmd = `git diff --name-only ${baseCommit} HEAD`;
		} else {
			cmd = `git diff --name-only HEAD~1 HEAD`;
		}

		const result = execSync(cmd, { encoding: "utf-8" }).trim();
		return result ? result.split("\n") : [];
	} catch {
		return [];
	}
}

/**
 * 指定コミット範囲の差分を取得
 */
export function getDiffContent(baseCommit?: string, headCommit?: string): string {
	try {
		let cmd: string;
		if (baseCommit && headCommit) {
			cmd = `git diff ${baseCommit}..${headCommit}`;
		} else if (baseCommit) {
			cmd = `git diff ${baseCommit} HEAD`;
		} else {
			cmd = `git diff HEAD~1 HEAD`;
		}

		return execSync(cmd, { encoding: "utf-8" });
	} catch {
		return "";
	}
}

// ============================================================================
// Comparator
// ============================================================================

/**
 * plan.mdと実装を比較
 */
export function comparePlanWithImplementation(
	planPath: string,
	options: CompareOptions = {}
): CompareResult {
	const plan = parsePlanMd(planPath);
	const divergences: Divergence[] = [];
	const verbose = options.verbose ?? false;

	// 実装の変更を取得
	const changedFiles = getChangedFiles(options.baseCommit, options.headCommit);
	const diffContent = getDiffContent(options.baseCommit, options.headCommit);

	if (verbose) {
		console.error(`[compare] plan: ${plan.title}`);
		console.error(`[compare] sections: ${plan.sections.length}`);
		console.error(`[compare] changed files: ${changedFiles.length}`);
	}

	// planで言及されているファイルを抽出
	const planMentions = extractFileMentions(plan.rawContent);
	const implementedFiles = changedFiles.filter((f) => !f.endsWith(".md"));

	// 1. 変更内容セクションと実装の比較
	const changeSection = plan.sections.find((s) => s.type === "change");
	if (changeSection) {
		for (const item of changeSection.items) {
			const mentionedFiles = extractFileMentions(item);
			const implemented = mentionedFiles.some((f) =>
				implementedFiles.some((impl) => impl.includes(f) || f.includes(basename(impl)))
			);

			if (!implemented && mentionedFiles.length > 0) {
				divergences.push({
					type: "missing_implementation",
					severity: "high",
					planSection: "変更内容",
					description: `計画された変更が実装されていない: ${item.substring(0, 100)}`,
					evidence: `期待されるファイル: ${mentionedFiles.join(", ")}`,
				});
			}
		}
	}

	// 2. Todoセクションの完了確認
	const todoSection = plan.sections.find((s) => s.type === "todo");
	if (todoSection) {
		const todoItems = extractTodoItems(plan.rawContent.match(/##\s*Todo\s*\n([\s\S]*?)(?=\n##|$)/)?.[1] || "");
		for (const item of todoItems) {
			if (!item.completed) {
				divergences.push({
					type: "incomplete_todo",
					severity: "medium",
					planSection: "Todo",
					description: `未完了のTodo: ${item.text}`,
				});
			}
		}
	}

	// 3. 考慮事項の反映確認
	const considerationSection = plan.sections.find((s) => s.type === "consideration");
	if (considerationSection) {
		for (const item of considerationSection.items) {
			// キーワードを抽出してdiff内で検索
			const keywords = extractKeywords(item);
			const addressed = keywords.some((kw) => diffContent.includes(kw));

			if (!addressed && keywords.length > 0) {
				divergences.push({
					type: "unaddressed_concern",
					severity: "low",
					planSection: "考慮事項",
					description: `考慮事項が実装で言及されていない: ${item.substring(0, 80)}`,
				});
			}
		}
	}

	// 4. スコープドリフト検出
	for (const file of implementedFiles) {
		const mentioned = planMentions.some(
			(m) => file.includes(m) || m.includes(basename(file))
		);
		if (!mentioned) {
			divergences.push({
				type: "scope_drift",
				severity: "low",
				planSection: "全体",
				description: `planで言及されていないファイルが変更された: ${file}`,
			});
		}
	}

	// サマリー計算
	const summary = {
		total: divergences.length,
		high: divergences.filter((d) => d.severity === "high").length,
		medium: divergences.filter((d) => d.severity === "medium").length,
		low: divergences.filter((d) => d.severity === "low").length,
		coverage: implementedFiles.length > 0
			? (planMentions.filter((m) => implementedFiles.some((f) => f.includes(m))).length / Math.max(planMentions.length, 1)) * 100
			: 0,
	};

	return {
		planPath,
		planTitle: plan.title,
		divergences,
		summary,
		implementedFiles,
		planMentions,
	};
}

/**
 * テキストからファイルパスを抽出
 */
function extractFileMentions(text: string): string[] {
	const mentions: string[] = [];

	// `.pi/lib/xxx.ts` 形式
	const pathMatch1 = text.match(/\.pi\/[a-zA-Z0-9_\-/]+\.(ts|tsx|js|jsx)/g);
	if (pathMatch1) mentions.push(...pathMatch1);

	// `scripts/xxx.ts` 形式
	const pathMatch2 = text.match(/scripts\/[a-zA-Z0-9_\-/]+\.(ts|tsx|js|jsx)/g);
	if (pathMatch2) mentions.push(...pathMatch2);

	// バッククォート囲み
	const pathMatch3 = text.match(/`([^`]+\.(ts|tsx|js|jsx))`/g);
	if (pathMatch3) {
		mentions.push(...pathMatch3.map((m) => m.replace(/`/g, "")));
	}

	return Array.from(new Set(mentions));
}

/**
 * テキストからキーワードを抽出
 */
function extractKeywords(text: string): string[] {
	// 日本語の重要語句を抽出
	const keywords: string[] = [];

	// 「〜する」「〜の」などを除去してキーワード化
	const cleanText = text
		.replace(/する$/, "")
		.replace(/の$/, "")
		.replace(/を.*/, "")
		.replace(/が.*/, "");

	// 2文字以上の単語を抽出
	const words = cleanText.match(/[\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ff]{2,}/g);
	if (words) {
		keywords.push(...words);
	}

	return keywords;
}

/**
 * 比較結果をMarkdown形式で出力
 */
export function formatCompareResult(result: CompareResult): string {
	let md = `# Plan vs 実装 比較結果

## plan: ${result.planTitle}
**パス**: ${result.planPath}

---

## サマリー

| 項目 | 数値 |
|------|------|
| 乖離総数 | ${result.summary.total} |
| 高重要度 | ${result.summary.high} |
| 中重要度 | ${result.summary.medium} |
| 低重要度 | ${result.summary.low} |
| カバレッジ | ${result.summary.coverage.toFixed(1)}% |

---

## 実装ファイル (${result.implementedFiles.length}件)

`;
	if (result.implementedFiles.length > 0) {
		for (const f of result.implementedFiles.slice(0, 20)) {
			md += `- \`${f}\`\n`;
		}
		if (result.implementedFiles.length > 20) {
			md += `- ...and ${result.implementedFiles.length - 20} more\n`;
		}
	} else {
		md += "*変更ファイルなし*\n";
	}

	md += `
---

## plan言及ファイル (${result.planMentions.length}件)

`;
	if (result.planMentions.length > 0) {
		for (const f of result.planMentions) {
			md += `- \`${f}\`\n`;
		}
	} else {
		md += "*言及ファイルなし*\n";
	}

	if (result.divergences.length > 0) {
		md += `
---

## 乖離一覧

| 重大度 | タイプ | セクション | 説明 |
|--------|--------|-----------|------|
`;
		for (const d of result.divergences) {
			md += `| ${d.severity} | ${d.type} | ${d.planSection} | ${d.description.substring(0, 60)} |\n`;
		}

		// 詳細
		md += "\n### 詳細\n\n";
		for (const d of result.divergences) {
			md += `#### [${d.severity.toUpperCase()}] ${d.type}\n\n`;
			md += `- **セクション**: ${d.planSection}\n`;
			md += `- **説明**: ${d.description}\n`;
			if (d.evidence) {
				md += `- **証拠**: ${d.evidence}\n`;
			}
			md += "\n";
		}
	} else {
		md += "\n**乖離は検出されませんでした。**\n";
	}

	return md;
}
