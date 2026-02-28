/**
 * @abdd.meta
 * path: .pi/extensions/inject-system-prompt.ts
 * role: Extension
 * why: .pi/docs/の内容をシステムプロンプトに注入し、piパッケージとして配布可能にする
 * related: .pi/docs/ul-mode-guide.md, .pi/docs/dag-execution-guide.md, .pi/APPEND_SYSTEM.md
 * public_api: default function
 * invariants: docsファイルが存在しない場合はスキップする
 * side_effects: なし（読み込みのみ）
 * failure_modes: ファイル読み込みエラー時は警告して続行
 *
 * @abdd.explain
 * overview: before_agent_startイベントでシステムプロンプトを拡張する
 * what_it_does: .pi/docs/のUL Mode GuidelineとDAG Execution Guideをシステムプロンプトに追加
 * why_it_exists: APPEND_SYSTEM.mdの外部参照問題を解決し、piパッケージとして配布可能にする
 * scope(in): .pi/docs/ul-mode-guide.md, .pi/docs/dag-execution-guide.md
 * scope(out): 変更されたシステムプロンプト
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * docsディレクトリからガイドファイルを読み込む
 * @param filename - ファイル名
 * @returns ファイルの内容、または空文字
 */
function readGuideFile(filename: string): string {
  const docsDir = join(__dirname, "..", "docs");
  const filePath = join(docsDir, filename);

  if (!existsSync(filePath)) {
    return "";
  }

  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

// モジュールレベルのフラグ（reload時のリスナー重複登録防止）
let isInitialized = false;

export default function (pi: ExtensionAPI) {
  if (isInitialized) return;
  isInitialized = true;

  pi.on("before_agent_start", async (event, ctx) => {
    let additionalPrompt = "";

    // UL Mode Guideline
    const ulModeGuide = readGuideFile("ul-mode-guide.md");
    if (ulModeGuide) {
      additionalPrompt += "\n\n---\n\n# UL Mode Guideline\n\n" + ulModeGuide;
    }

    // DAG Execution Guide
    const dagGuide = readGuideFile("dag-execution-guide.md");
    if (dagGuide) {
      additionalPrompt += "\n\n---\n\n# DAG Execution Guide\n\n" + dagGuide;
    }

    if (additionalPrompt) {
      return {
        systemPrompt: event.systemPrompt + additionalPrompt,
      };
    }
    return undefined;
  });

  // セッション終了時にリスナー重複登録防止フラグをリセット
  pi.on("session_shutdown", async () => {
    isInitialized = false;
  });
}
