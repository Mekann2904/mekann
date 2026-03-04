#!/usr/bin/env npx tsx
/**
 * 進化履歴記録ツール
 *
 * バグ修正、テスト失敗、機能追加を記録し、
 * spec-ai.mdやinvariants.mdを更新する
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

/**
 * 日付をフォーマット
 */
function formatDate(date: Date, format: string): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	
	if (format === "yyyy-MM-dd") {
		return `${year}-${month}-${day}`;
	}
	
	return `${year}-${month}-${day}`;
}

const ROOT_DIR = process.cwd();
const EVOLUTION_DIR = join(ROOT_DIR, "ABDD", "evolution");
const AS_BUILT_DIR = join(ROOT_DIR, "ABDD", "as-built");

// ============================================================================
// Types
// ============================================================================

interface EvolutionEntry {
	type: "bug_fix" | "test_failure" | "feature_add" | "refactor" | "contract_breach";
	source: string;
	description: string;
	affectedFiles: string[];
	learnedInvariant?: string;
	timestamp: string;
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(args: string[]) {
	return {
		type: args.find((a) => a.startsWith("--type="))?.split("=")[1] as EvolutionEntry["type"],
		source: args.find((a) => a.startsWith("--source="))?.split("=")[1],
		description: args.find((a) => a.startsWith("--description="))?.split("=")[1],
		files: args.find((a) => a.startsWith("--files="))?.split("=")[1]?.split(","),
		invariant: args.find((a) => a.startsWith("--invariant="))?.split("=")[1],
		dryRun: args.includes("--dry-run"),
	};
}

// ============================================================================
// Main
// ============================================================================

async function main() {
	const args = process.argv.slice(2);
	const options = parseArgs(args);

	if (!options.type || !options.source) {
		console.log(`
進化履歴記録ツール

使用方法:
  npx tsx scripts/record-evolution.ts --type=bug_fix --source=issue-123 --description="..." [--files=...] [--invariant="..."]

オプション:
  --type=         エントリタイプ (bug_fix, test_failure, feature_add, refactor, contract_breach)
  --source=       ソース (issue番号, PR番号, test名など)
  --description=  説明
  --files=        関連ファイル (カンマ区切り)
  --invariant=    学習した不変条件
  --dry-run       ドライラン
`);
		process.exit(1);
	}

	const entry: EvolutionEntry = {
		type: options.type,
		source: options.source,
		description: options.description || "",
		affectedFiles: options.files || [],
		learnedInvariant: options.invariant,
		timestamp: new Date().toISOString(),
	};

	console.log(`=== 進化履歴記録 ===\n`);
	console.log(`タイプ: ${entry.type}`);
	console.log(`ソース: ${entry.source}`);
	console.log(`説明: ${entry.description}`);
	if (entry.learnedInvariant) {
		console.log(`学習した不変条件: ${entry.learnedInvariant}`);
	}

	if (options.dryRun) {
		console.log("\n[ドライラン] 記録をスキップします");
		return;
	}

	// 1. 日次のエントリーファイルを更新
	const today = formatDate(new Date(), "yyyy-MM-dd");
	const logPath = join(EVOLUTION_DIR, `${today}.md`);

	let logContent = "";
	if (existsSync(logPath)) {
		logContent = readFileSync(logPath, "utf-8");
	} else {
		logContent = `# 進化履歴 (${today})

このファイルは自動生成されています。実装変更に合わせて更新されます。

---
`;
	}

	// エントリーを追加
	const entrySection = `
## ${entry.type}

- **ソース**: ${entry.source}
- **日時**: ${entry.timestamp}
- **説明**: ${entry.description}
${entry.affectedFiles.length > 0 ? `- **関連ファイル**: ${entry.affectedFiles.join(", ")}\n` : ""}
${entry.learnedInvariant ? `- **学習した不変条件**: ${entry.learnedInvariant}\n` : ""}
---
`;

	logContent += entrySection + "\n";
	writeFileSync(logPath, logContent, "utf-8");
	console.log(`\n記録完了: ${logPath}`);

	// 2. 不変条件を学習した場合、invariants.mdを更新
	if (entry.learnedInvariant) {
		await updateInvariantsMd(entry);
	}

	// 3. spec-ai.mdの変更履歴を更新
	await updateSpecAiChangelog(entry);

	console.log("\n=== 完了 ===");
}

/**
 * invariants.mdを更新
 */
async function updateInvariantsMd(entry: EvolutionEntry): Promise<void> {
	const invariantsPath = join(AS_BUILT_DIR, "invariants.md");

	// 現在のinvariants.mdを読み込み（存在する場合）
	let content = "";
	if (existsSync(invariantsPath)) {
		content = readFileSync(invariantsPath, "utf-8");
	} else {
		content = `# 不変条件 (Auto-generated)

このファイルは実装コードと進化履歴から自動生成されます。
人間が定義した不変条件は intention/spec.md を参照してください。

---

## 検出された不変条件

| ID | 条件 | カテゴリ | 検出元 | 重要度 |
|----|------|---------|--------|--------|
`;
	}

	// 新しい不変条件を追加
	// 既存のIDの最大値を取得
	const idMatch = content.match(/INV-(\d+)/g);
	const maxId = idMatch
		? Math.max(...idMatch.map((m) => parseInt(m.match(/\d+/)?.[0] || "0")))
		: 0;
	const newId = `INV-${String(maxId + 1).padStart(3, "0")}`;

	const category = categorizeInvariant(entry.learnedInvariant!);
	const newRow = `| ${newId} | ${entry.learnedInvariant} | ${category} | ${entry.type} | medium |\n`;

	// テーブルに行を追加
	const lines = content.split("\n");
	const lastTableRowIndex = findLastIndex(lines, (line) => line.startsWith("|"));
	if (lastTableRowIndex >= 0) {
		lines.splice(lastTableRowIndex + 1, 0, newRow);
		content = lines.join("\n");
		writeFileSync(invariantsPath, content, "utf-8");
		console.log(`不変条件を追加: ${invariantsPath} (${newId})`);
	}
}

/**
 * 配列の最後のインデックスを見つける
 */
function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
	for (let i = arr.length - 1; i >= 0; i--) {
		if (predicate(arr[i])) {
			return i;
		}
	}
	return -1;
}

/**
 * spec-ai.mdの変更履歴を更新
 */
async function updateSpecAiChangelog(entry: EvolutionEntry): Promise<void> {
	const specAiPath = join(AS_BUILT_DIR, "spec-ai.md");

	if (!existsSync(specAiPath)) {
		console.log("spec-ai.mdが見つかりません。先にgenerate-spec-aiを実行してください。");
		return;
	}

	let content = readFileSync(specAiPath, "utf-8");

	// 変更履歴セクションを見つけて更新
	const today = formatDate(new Date(), "yyyy-MM-dd");
	const newEntry = `| ${today} | ${entry.description || entry.type} | ${entry.type} (${entry.source}) |\n`;

	// 最後のエントリの後ろに追加
	const lines = content.split("\n");
	const changelogEndIndex = findLastIndex(lines, (line) =>
		/^\| \d{4}-\d{2}-\d{2} \| .* \| .* \|/.test(line)
	);

	if (changelogEndIndex >= 0) {
		lines.splice(changelogEndIndex + 1, 0, newEntry);
		content = lines.join("\n");
		writeFileSync(specAiPath, content, "utf-8");
		console.log(`変更履歴を更新: ${specAiPath}`);
	}
}

/**
 * 不変条件をカテゴリ分類
 */
function categorizeInvariant(invariant: string): string {
	const lower = invariant.toLowerCase();

	if (lower.includes("error") || lower.includes("retry") || lower.includes("timeout")) {
		return "error_handling";
	}
	if (lower.includes("concurrent") || lower.includes("parallel") || lower.includes("lock")) {
		return "concurrency";
	}
	if (lower.includes("auth") || lower.includes("permission") || lower.includes("secret")) {
		return "security";
	}
	return "data_integrity";
}

main().catch((error) => {
	console.error("Error:", error);
	process.exit(1);
});
