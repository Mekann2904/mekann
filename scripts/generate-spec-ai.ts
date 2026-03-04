#!/usr/bin/env npx tsx
/**
 * spec-ai.md Generator
 *
 * TypeScriptソースコードから全体フロー・仕様書（spec-ai.md）を自動生成する
 */

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import {
	analyzeCodebase,
	extractSubsystems,
	type SpecInfo,
	type SubsystemInfo,
	type DataFlow,
	type ContractInfo,
	type InvariantInfo,
} from "../.pi/lib/spec-analyzer.js";

const ROOT_DIR = process.cwd();
const ABDD_DIR = join(ROOT_DIR, "ABDD");
const AS_BUILT_DIR = join(ABDD_DIR, "as-built");

// ============================================================================
// CLI
// ============================================================================

function parseArgs(args: string[]) {
	return {
		dryRun: args.includes("--dry-run"),
		verbose: args.includes("--verbose") || args.includes("-v"),
	};
}

// ============================================================================
// Mermaid Diagram Generators
// ============================================================================

/**
 * サブシステム関係図を生成
 */
function generateSubsystemDiagram(subsystems: SubsystemInfo[]): string {
	let diagram = "flowchart TB\n\n";

	// サブシステムをグループ化
	const extensionSubsystems = subsystems.filter(s => s.name.startsWith("extensions/") && !s.name.includes("/"));
	const libSubsystems = subsystems.filter(s => s.name.startsWith("lib/"));
	const subdirs = subsystems.filter(s => !s.name.includes("/") && !s.name.startsWith("lib/") && !s.name.startsWith("extensions/"));

	// Extensions
	if (extensionSubsystems.length > 0) {
		diagram += "  subgraph Extensions[\"pi/extensions\"]\n";
		for (const s of extensionSubsystems.slice(0, 15)) { // 最大15個
			const id = sanitizeId(s.name);
			const label = truncateLabel(s.name.replace("extensions/", ""), 20);
			diagram += `    ${id}["${label}"]\n`;
		}
		if (extensionSubsystems.length > 15) {
			diagram += `    more_ext["...and ${extensionSubsystems.length - 15} more"]\n`;
		}
		diagram += "  end\n\n";
	}

	// Lib
	if (libSubsystems.length > 0) {
		diagram += "  subgraph Lib[\"pi/lib\"]\n";
		for (const s of libSubsystems.slice(0, 10)) {
			const id = sanitizeId(s.name);
			const label = truncateLabel(s.name.replace("lib/", ""), 20);
			diagram += `    ${id}["${label}"]\n`;
		}
		if (libSubsystems.length > 10) {
			diagram += `    more_lib["...and ${libSubsystems.length - 10} more"]\n`;
		}
		diagram += "  end\n\n";
	}

	// Extension subdirectories
	if (subdirs.length > 0) {
		diagram += "  subgraph Modules[\"Extension Modules\"]\n";
		for (const s of subdirs.slice(0, 10)) {
			const id = sanitizeId(s.name);
			const label = truncateLabel(s.name, 20);
			diagram += `    ${id}["${label}"]\n`;
		}
		if (subdirs.length > 10) {
			diagram += `    more_mod["...and ${subdirs.length - 10} more"]\n`;
		}
		diagram += "  end\n\n";
	}

	// 依存関係（最大20本）
	const allDeps: { from: string; to: string }[] = [];
	for (const s of subsystems) {
		for (const dep of s.dependencies) {
			allDeps.push({ from: s.name, to: dep });
		}
	}

	const depsToShow = allDeps.slice(0, 20);
	for (const dep of depsToShow) {
		const fromId = sanitizeId(dep.from);
		const toId = sanitizeId(dep.to);
		diagram += `  ${fromId} --> ${toId}\n`;
	}

	if (allDeps.length > 20) {
		diagram += `  %% ...and ${allDeps.length - 20} more dependencies\n`;
	}

	return diagram;
}

/**
 * データフロー図を生成
 */
function generateDataFlowDiagram(dataFlows: DataFlow[]): string {
	if (dataFlows.length === 0) {
		return "%% No data flows detected";
	}

	let diagram = "flowchart LR\n\n";

	// ユニークなノードを抽出
	const nodes = new Set<string>();
	for (const flow of dataFlows) {
		nodes.add(flow.from);
		nodes.add(flow.to);
	}

	// ノードを定義
	for (const node of nodes) {
		const id = sanitizeId(node);
		const label = truncateLabel(node, 15);
		diagram += `  ${id}["${label}"]\n`;
	}

	diagram += "\n";

	// フローを定義（最大15本）
	const flowsToShow = dataFlows.slice(0, 15);
	for (const flow of flowsToShow) {
		const fromId = sanitizeId(flow.from);
		const toId = sanitizeId(flow.to);
		diagram += `  ${fromId} -->|${flow.trigger}| ${toId}\n`;
	}

	if (dataFlows.length > 15) {
		diagram += `  %% ...and ${dataFlows.length - 15} more flows\n`;
	}

	return diagram;
}

function sanitizeId(name: string): string {
	return name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+|_+$/g, "");
}

function truncateLabel(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return text.substring(0, maxLength - 3) + "...";
}

// ============================================================================
// Markdown Assembly
// ============================================================================

function assembleSpecAiMd(specInfo: SpecInfo, verbose: boolean): string {
	const generatedAt = new Date().toISOString();

	let md = `---
title: System Specification (Auto-generated)
generated_at: ${generatedAt}
source: AST analysis + @abdd.meta headers
disclaimer: |
  このファイルは実装から自動生成されています。
  人間が書いた仕様書は intention/spec.md を参照してください。
  実装変更時に自動更新されます。
---

# System Specification (As-Built)

> **注意**: このドキュメントは実装コードから自動生成されています。
> 人間が記述した仕様書は \`ABDD/intention/spec.md\` を参照してください。

## 解析メタデータ

- **解析日時**: ${specInfo.metadata.analyzedAt}
- **ファイル数**: ${specInfo.metadata.fileCount}
- **サブシステム数**: ${specInfo.metadata.subsystemCount}

---

## 全体フロー

\`\`\`mermaid
${generateSubsystemDiagram(specInfo.subsystems)}
\`\`\`

---

## サブシステム一覧

| サブシステム | 責務 | 主要ファイル | エクスポート数 |
|-------------|------|-------------|---------------|
`;

	// サブシステム一覧
	for (const s of specInfo.subsystems) {
		const responsibility = s.responsibility || "-";
		const mainFile = s.mainFiles[0] || "-";
		const exportCount = s.exports.length;
		md += `| ${s.name} | ${truncateLabel(responsibility, 50)} | \`${mainFile}\` | ${exportCount} |\n`;
	}

	// データフロー
	if (specInfo.dataFlows.length > 0) {
		md += `
---

## データフロー

\`\`\`mermaid
${generateDataFlowDiagram(specInfo.dataFlows)}
\`\`\`

### データフロー一覧

| 送信元 | 受信先 | トリガー |
|--------|--------|---------|
`;
		for (const flow of specInfo.dataFlows.slice(0, 30)) {
			md += `| ${flow.from} | ${flow.to} | ${flow.trigger} |\n`;
		}
		if (specInfo.dataFlows.length > 30) {
			md += `| ... | ... | ... (${specInfo.dataFlows.length - 30} more) |\n`;
		}
	}

	// 契約一覧
	if (specInfo.contracts.length > 0) {
		md += `
---

## 契約一覧

| 契約名 | 種別 | 定義元 | 不変条件数 | 失敗モード数 |
|--------|------|--------|-----------|-------------|
`;
		for (const c of specInfo.contracts) {
			md += `| \`${c.name}\` | ${c.kind} | ${c.sourceFile} | ${c.invariants.length} | ${c.failureModes.length} |\n`;
		}

		// 契約詳細
		md += "\n### 契約詳細\n\n";
		for (const c of specInfo.contracts.slice(0, 10)) {
			md += `#### ${c.name}\n\n`;
			md += `**定義元**: ${c.sourceFile}\n\n`;
			if (c.invariants.length > 0) {
				md += "**不変条件**:\n";
				for (const inv of c.invariants) {
					md += `- ${inv}\n`;
				}
				md += "\n";
			}
			if (c.failureModes.length > 0) {
				md += "**失敗モード**:\n";
				for (const fm of c.failureModes) {
					md += `- ${fm}\n`;
				}
				md += "\n";
			}
		}
	}

	// 不変条件一覧
	if (specInfo.invariants.length > 0) {
		md += `
---

## 不変条件

| ID | 条件 | カテゴリ | 検出元 |
|----|------|---------|--------|
`;
		for (const inv of specInfo.invariants) {
			md += `| ${inv.id} | ${truncateLabel(inv.condition, 60)} | ${inv.category} | ${inv.detectedFrom} |\n`;
		}
	}

	// 変更履歴（プレースホルダー）
	md += `
---

## 変更履歴

このセクションは自動更新されます。バグ修正や機能追加が反映されます。

| 日付 | 変更内容 | トリガー |
|------|---------|---------|
| ${generatedAt.split("T")[0]} | 初回生成 | spec-ai.md生成ツール実行 |

---

*このドキュメントは ABDD (As-Built Driven Development) システムにより自動生成されています。*
`;

	return md;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
	const args = process.argv.slice(2);
	const options = parseArgs(args);

	console.log("=== ABDD spec-ai.md Generator ===\n");

	if (options.dryRun) {
		console.log("ドライランモード: ファイルは書き込まれません\n");
	}

	// 1. コードベースを解析
	console.log("Analyzing codebase...");
	const specInfo = await analyzeCodebase({
		verbose: options.verbose,
	});

	console.log(`\n解析結果:`);
	console.log(`  - サブシステム: ${specInfo.subsystems.length}`);
	console.log(`  - データフロー: ${specInfo.dataFlows.length}`);
	console.log(`  - 契約: ${specInfo.contracts.length}`);
	console.log(`  - 不変条件: ${specInfo.invariants.length}`);

	// 2. Markdownを生成
	console.log("\nGenerating spec-ai.md...");
	const markdown = assembleSpecAiMd(specInfo, options.verbose);

	// 3. 出力
	if (options.dryRun) {
		console.log("\n=== Generated spec-ai.md (dry-run) ===\n");
		console.log(markdown);
	} else {
		// ディレクトリを作成
		if (!existsSync(AS_BUILT_DIR)) {
			mkdirSync(AS_BUILT_DIR, { recursive: true });
		}

		const outputPath = join(AS_BUILT_DIR, "spec-ai.md");
		writeFileSync(outputPath, markdown, "utf-8");
		console.log(`\nGenerated: ${outputPath}`);
	}

	console.log("\n=== Done ===");
}

main().catch((error) => {
	console.error("Error:", error);
	process.exit(1);
});
