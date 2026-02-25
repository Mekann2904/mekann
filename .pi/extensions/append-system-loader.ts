/**
 * @abdd.meta
 * path: .pi/extensions/append-system-loader.ts
 * role: APPEND_SYSTEM.mdの内容をロードし、エージェントのシステムプロンプトへ注入するエクステンション
 * why: プロジェクト固有の指示やルールをAPPEND_SYSTEM.mdで一元管理し、エージェントの起動時に動的に適用するため
 * related: @mariozechner/pi-coding-agent, .pi/APPEND_SYSTEM.md
 * public_api: loadAppendSystemContent(), default extension function
 * invariants:
 *   - APPEND_SYSTEM.mdのパスはパッケージルートからの相対パスで固定される
 *   - システムプロンプトへの追加はプロセスごとに1回のみ行われる（マーカーによる重複チェック）
 *   - ファイル内容はプロセス内でキャッシュされ、再読み込みされない
 * side_effects:
 *   - ファイルシステムへの読み取りアクセスが発生する
 *   - 標準出力（console.log/warn）へのログ出力が行われる
 *   - エージェントのsystemPromptを書き換える
 * failure_modes:
 *   - APPEND_SYSTEM.mdが存在しない場合、何もせず処理を終了する
 *   - ファイル読み込みに失敗した場合、警告を出力し処理を終了する
 * @abdd.explain
 * overview: .pi/APPEND_SYSTEM.md という静的ファイルを読み込み、その内容をPIエージェントのシステムプロンプト末尾に自動的に付加するエクステンション実装。
 * what_it_does:
 *   - パッケージルートディレクトリを算出する
 *   - .pi/APPEND_SYSTEM.md の存在確認と内容読み取りを行い、メモリ上にキャッシュする
 *   - before_agent_startイベントフックを利用して、システムプロンプトにファイル内容を追加する
 *   - 追加時に重複を防ぐため、HTMLコメント形式のマーカーで既存プロンプトをチェックする
 * why_it_exists:
 *   - システムプロンプトをコードベースに含めることで、設定のバージョン管理と共有を容易にする
 *   - エージェントの挙動をプロジェクトディレクトリ内のファイル制御下に置くため
 * scope:
 *   in: .pi/APPEND_SYSTEM.md (ファイルパス), @mariozechner/pi-coding-agent (ExtensionAPI)
 *   out: 更新されたシステムプロンプト (systemPrompt), コンソールログ
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
  } catch (error: unknown) {
    console.warn("[append-system-loader] Failed to read APPEND_SYSTEM.md:", error instanceof Error ? error.message : String(error));
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
