/**
 * @abdd.meta
 * path: .pi/extensions/append-system-loader.ts
 * role: パッケージバンドルのAPPEND_SYSTEM.mdをシステムプロンプトに注入
 * why: pi install後、パッケージ内の.pi/APPEND_SYSTEM.mdが自動読み込みされないため
 * related: .pi/APPEND_SYSTEM.md, @mariozechner/pi-coding-agent
 * public_api: default (extension factory)
 * invariants: APPEND_SYSTEM.mdが存在する場合のみ処理を実行
 * side_effects: before_agent_startイベントでシステムプロンプトを変更
 * failure_modes: ファイル読み込みエラー時は警告ログを出力して処理をスキップ
 * @abdd.explain
 * overview: パッケージバンドルされたAPPEND_SYSTEM.mdの内容を、pi起動時にシステムプロンプトへ追加する拡張機能
 * what_it_does:
 *   - 拡張機能と同じパッケージルートにある.pi/APPEND_SYSTEM.mdを検出
 *   - before_agent_startイベントでシステムプロンプト末尾に内容を追加
 * why_it_exists:
 *   - pi install後、パッケージ内のAPPEND_SYSTEM.mdが自動読み込みされない問題を回避
 * scope:
 *   in: なし（ファイルパスは自動解決）
 *   out: システムプロンプトへのテキスト追加
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// パッケージルートを取得（このファイルから3階層上）
const getPackageRoot = (): string => {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  // .pi/extensions/ -> .pi/ -> package-root/
  return dirname(dirname(currentDir));
};

const PACKAGE_ROOT = getPackageRoot();
const APPEND_SYSTEM_PATH = join(PACKAGE_ROOT, ".pi", "APPEND_SYSTEM.md");

// ファイル内容をキャッシュ（再読み込み防止）
let cachedContent: string | null = null;
let cacheLoaded = false;

/**
 * APPEND_SYSTEM.mdの内容を読み込む
 */
const loadAppendSystemContent = (): string | null => {
  if (cacheLoaded) {
    return cachedContent;
  }

  cacheLoaded = true;

  if (!existsSync(APPEND_SYSTEM_PATH)) {
    console.log("[append-system-loader] APPEND_SYSTEM.md not found at:", APPEND_SYSTEM_PATH);
    return null;
  }

  try {
    const content = readFileSync(APPEND_SYSTEM_PATH, "utf-8");
    cachedContent = content.trim();
    console.log("[append-system-loader] Loaded APPEND_SYSTEM.md from package:", APPEND_SYSTEM_PATH);
    return cachedContent;
  } catch (error) {
    console.warn("[append-system-loader] Failed to read APPEND_SYSTEM.md:", error);
    return null;
  }
};

export default function (pi: ExtensionAPI) {
  // 起動時に内容をロード
  const appendContent = loadAppendSystemContent();

  if (!appendContent) {
    return;
  }

  // before_agent_startでシステムプロンプトに追加
  pi.on("before_agent_start", async (event, _ctx) => {
    // 既存のシステムプロンプトに追加
    // 重複追加を防ぐため、既に含まれている場合はスキップ
    if (event.systemPrompt && event.systemPrompt.includes("<!-- APPEND_SYSTEM.md -->")) {
      return;
    }

    // マーカー付きで追加（重複検出用）
    const markedContent = `\n\n<!-- APPEND_SYSTEM.md (from package) -->\n${appendContent}`;

    return {
      systemPrompt: event.systemPrompt + markedContent,
    };
  });
}
