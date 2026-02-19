/**
 * JSDoc配置の静的検査テスト
 *
 * 不正なJSDoc配置パターンを検出し、将来の回帰を防ぐ
 *
 * 検出対象パターン:
 * - インターフェース/型内のJSDocブロック（フィールド間）
 * - パラメータリスト内のJSDocブロック
 * - 関数本体内のJSDocブロック（式の前）
 * - 行頭にある型定義用JSDoc（@property等）で、直後に型定義がないもの
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT_DIR = join(import.meta.dirname, "../../../..");
const TARGET_DIRS = [".pi/extensions", ".pi/lib"];

interface JSDocIssue {
  file: string;
  line: number;
  type: string;
  snippet: string;
}

/**
 * インターフェース/型内でのJSDocブロックを検出
 * パターン: フィールド定義の直後にJSDocがある場合
 */
function detectJSDocInInterface(content: string, filePath: string): JSDocIssue[] {
  const issues: JSDocIssue[] = [];
  const lines = content.split("\n");

  let inInterface = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // インターフェース/型定義の開始を検出
    if (/^\s*(export\s+)?(interface|type)\s+\w+/.test(line)) {
      inInterface = true;
      braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      continue;
    }

    if (inInterface) {
      braceDepth += (line.match(/{/g) || []).length;
      braceDepth -= (line.match(/}/g) || []).length;

      // インターフェース内でJSDocブロックが見つかった場合
      if (line.trim().startsWith("/**") && !line.includes("*/")) {
        // 複数行JSDocの開始
        const snippet = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
        issues.push({
          file: filePath,
          line: lineNum,
          type: "jsdoc-in-interface",
          snippet: snippet.slice(0, 100),
        });
      }

      if (braceDepth <= 0) {
        inInterface = false;
      }
    }
  }

  return issues;
}

/**
 * パラメータリスト内のJSDocを検出
 * パターン: カンマの後にJSDocがある場合
 */
function detectJSDocInParameterList(content: string, filePath: string): JSDocIssue[] {
  const issues: JSDocIssue[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // カンマで終わる行の次がJSDocブロック
    if (/,\s*$/.test(line) && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      if (nextLine.startsWith("/**")) {
        const snippet = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
        issues.push({
          file: filePath,
          line: lineNum,
          type: "jsdoc-in-param-list",
          snippet: snippet.slice(0, 100),
        });
      }
    }
  }

  return issues;
}

/**
 * 関数本体内のJSDocを検出
 * パターン: 変数宣言や式の前にJSDocがあるが、関数宣言ではない場合
 */
function detectJSDocInFunctionBody(content: string, filePath: string): JSDocIssue[] {
  const issues: JSDocIssue[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // JSDocブロックの開始
    if (line.trim().startsWith("/**")) {
      // JSDocの終わりを見つける
      let jsdocEnd = i;
      while (jsdocEnd < lines.length && !lines[jsdocEnd].includes("*/")) {
        jsdocEnd++;
      }

      if (jsdocEnd + 1 < lines.length) {
        const afterJSDoc = lines[jsdocEnd + 1].trim();

        // const/let/var 宣言の前のJSDocは不正（関数内）
        if (/^(const|let|var)\s+\w+/.test(afterJSDoc)) {
          // ただし、exportや関数宣言の前はOK
          const prevCode = lines.slice(Math.max(0, i - 5), i).join("\n");
          if (/function\s+\w+|=>\s*{/.test(prevCode) && !/export\s+(async\s+)?function/.test(afterJSDoc)) {
            const snippet = lines.slice(i, Math.min(jsdocEnd + 3, lines.length)).join("\n");
            issues.push({
              file: filePath,
              line: lineNum,
              type: "jsdoc-in-function-body",
              snippet: snippet.slice(0, 100),
            });
          }
        }
      }
    }
  }

  return issues;
}

/**
 * 空のcatchブロックを検出（デバッグログが必要）
 */
function detectEmptyCatch(content: string, filePath: string): JSDocIssue[] {
  const issues: JSDocIssue[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // catchブロック内が空またはコメントのみ
    if (line.trim() === "catch" && i + 1 < lines.length) {
      // 次の行が { か、同じ行に { がある
      let braceStart = line.includes("{") ? i : i + 1;
      if (braceStart < lines.length && lines[braceStart].includes("{")) {
        // catchブロックの内容を確認
        let braceDepth = 1;
        let hasCode = false;
        for (let j = braceStart + 1; j < lines.length && braceDepth > 0; j++) {
          const innerLine = lines[j].trim();
          if (innerLine === "}") {
            braceDepth--;
          } else if (innerLine.startsWith("} else")) {
            braceDepth--;
          } else if (innerLine.includes("{")) {
            braceDepth++;
          }

          // コメントと空白以外に何かあるか
          if (innerLine && !innerLine.startsWith("//") && !innerLine.startsWith("*") && !innerLine.startsWith("/*")) {
            hasCode = true;
          }
        }

        if (!hasCode) {
          issues.push({
            file: filePath,
            line: lineNum,
            type: "empty-catch",
            snippet: line.slice(0, 100),
          });
        }
      }
    }

    // ワンライナー catch {} パターン
    const oneLinerMatch = line.match(/catch\s*\([^)]*\)\s*{\s*}/);
    if (oneLinerMatch) {
      issues.push({
        file: filePath,
        line: lineNum,
        type: "empty-catch",
        snippet: line.slice(0, 100),
      });
    }
  }

  return issues;
}

/**
 * ディレクトリを再帰的に走査してTypeScriptファイルを収集
 */
function collectTSFiles(dir: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
        files.push(...collectTSFiles(fullPath));
      } else if (entry.isFile() && extname(entry.name) === ".ts") {
        files.push(fullPath);
      }
    }
  } catch {
    // ディレクトリが存在しない場合はスキップ
  }

  return files;
}

describe("JSDoc配置の静的検査", () => {
  const allIssues: JSDocIssue[] = [];

  beforeAll(() => {
    for (const targetDir of TARGET_DIRS) {
      const fullPath = join(ROOT_DIR, targetDir);
      const files = collectTSFiles(fullPath);

      for (const file of files) {
        try {
          const content = readFileSync(file, "utf-8");
          const relativePath = file.replace(ROOT_DIR + "/", "");

          allIssues.push(...detectJSDocInInterface(content, relativePath));
          allIssues.push(...detectJSDocInParameterList(content, relativePath));
          allIssues.push(...detectJSDocInFunctionBody(content, relativePath));
          allIssues.push(...detectEmptyCatch(content, relativePath));
        } catch {
          // ファイル読み取りエラーはスキップ
        }
      }
    }
  });

  it("インターフェース/型内に不正なJSDocがないこと", () => {
    const interfaceIssues = allIssues.filter((i) => i.type === "jsdoc-in-interface");

    // 既知の例外（正当なパターン）を除外
    const actualIssues = interfaceIssues.filter((issue) => {
      // 型定義ファイル内の正当なJSDocは除外
      if (issue.file.includes("-types.ts") || issue.file.includes(".d.ts")) {
        return false;
      }
      return true;
    });

    expect(actualIssues).toHaveLength(0);
  });

  it("パラメータリスト内に不正なJSDocがないこと", () => {
    const paramIssues = allIssues.filter((i) => i.type === "jsdoc-in-param-list");
    expect(paramIssues).toHaveLength(0);
  });

  it("関数本体内に不正なJSDocがないこと", () => {
    const bodyIssues = allIssues.filter((i) => i.type === "jsdoc-in-function-body");
    expect(bodyIssues).toHaveLength(0);
  });

  it("空のcatchブロックにデバッグログがあること", () => {
    const emptyCatchIssues = allIssues.filter((i) => i.type === "empty-catch");

    // usage-tracker.ts 以外の空catchは許容しない
    const problematicEmptyCatches = emptyCatchIssues.filter(
      (i) => !i.file.includes("usage-tracker.ts")
    );

    // usage-tracker.ts 内の空catchも、console.debugがある場合はOK
    const usageTrackerIssues = emptyCatchIssues.filter((i) =>
      i.file.includes("usage-tracker.ts")
    );

    // usage-tracker.tsの空catch問題は、console.debugがある場合は除外
    // （この検出は簡易的なため、実際のファイル内容で確認が必要）
    const actualUsageTrackerIssues: JSDocIssue[] = [];
    for (const issue of usageTrackerIssues) {
      try {
        const fullPath = join(ROOT_DIR, issue.file);
        const content = readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");
        const startLine = issue.line - 1;

        // catchブロック内にconsole.debugがあるか確認
        let found = false;
        for (let i = startLine; i < Math.min(startLine + 10, lines.length); i++) {
          if (lines[i].includes("console.debug") || lines[i].includes("logger.debug")) {
            found = true;
            break;
          }
          if (lines[i].includes("}")) break;
        }

        if (!found) {
          actualUsageTrackerIssues.push(issue);
        }
      } catch {
        // 確認できない場合は問題として残す
        actualUsageTrackerIssues.push(issue);
      }
    }

    expect([...problematicEmptyCatches, ...actualUsageTrackerIssues]).toHaveLength(0);
  });

  it("全体的なJSDoc配置問題がないこと", () => {
    // 重大な問題のみを抽出
    const criticalIssues = allIssues.filter((i) =>
      ["jsdoc-in-interface", "jsdoc-in-param-list", "jsdoc-in-function-body"].includes(i.type)
    );

    if (criticalIssues.length > 0) {
      console.log("検出された問題:");
      for (const issue of criticalIssues) {
        console.log(`  ${issue.file}:${issue.line} [${issue.type}]`);
        console.log(`    ${issue.snippet.split("\n")[0].slice(0, 80)}...`);
      }
    }

    expect(criticalIssues).toHaveLength(0);
  });
});
