/**
 * @abdd.meta
 * path: .pi/extensions/rate-limit-retry-budget.ts
 * role: 429エラー発生時のリトライ回数を動的に拡張するランタイムパッチ適用モジュール（非推奨・履歴用）
 * why: node_modules内の依存コードを直接改変せずに、レート制限時のリトライ予算を拡張するための回避策として実装されたが、現在はno patch方針により非推奨
 * related: .pi/extensions/pi-coding-agent-rate-limit-fix.ts, .pi/extensions/rpm-throttle.ts, package.json
 * public_api: registerRateLimitRetryBudgetExtension(pi: ExtensionAPI): void
 * invariants: TARGET_MODULEの解決に失敗した場合パッチを適用しない、マーカー文字列が既に存在する場合は上書きしない
 * side_effects: node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session.js のソースコードを直接書き換える、標準エラー出力にログを出力する
 * failure_modes: ターゲットファイルのパス解決失敗、置換対象文字列の不一致によるパッチスキップ、ファイル書き込み時のI/Oエラー
 * @abdd.explain
 * overview: 旧ランタイムパッチ実装のアーカイブ。429系エラー時に環境変数に基づいてリトライ上限を引き上げるロジックを、実行時に依存モジュールへ埋め込む。
 * what_it_does:
 *   - セッション開始時にターゲットモジュール(agent-session.js)を解決し、ファイルを読み込む
 *   - 既定のリトライ判定ロジックを、429エラーと環境変数PI_RATE_LIMIT_MAX_RETRIESを考慮するロジックに置換する
 *   - maxAttempts参照箇所を、動的に計算されたrateLimitMaxRetriesを参照するように置換する
 *   - パッチ適用結果を標準エラー出力へ通知する
 * why_it_exists:
 *   - 本来の設定値(maxRetries)を越えて、APIのレート制限(429)に対してのみ堅牢なリトライを行う必要があったため
 *   - 依存パッケージの修正を待たずに、即座に挙動を変更するMonkey Patchとして機能したため
 * scope:
 *   in: ExtensionAPI(セッションハンドル)、process.env.PI_RATE_LIMIT_MAX_RETRIES
 *   out: @mariozechner/pi-coding-agent/dist/core/agent-session.js へのファイルシステム書き込み、stderrログ
 */

/**
 * .pi/extensions/rate-limit-retry-budget.ts
 * 429系のリトライ予算を拡張する旧ランタイムパッチ実装（現在は既定で無効）。
 * no patch方針により本実装は非推奨で、依存物の直接改変を避けるため履歴として保持する。
 * 関連: .pi/extensions/pi-coding-agent-rate-limit-fix.ts, .pi/extensions/rpm-throttle.ts, package.json
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type Replacement = {
  marker: string;
  beforeCandidates: string[];
  after: string;
};

const TARGET_MODULE = "@mariozechner/pi-coding-agent/dist/core/agent-session.js";

const REPLACEMENTS: Replacement[] = [
  {
    marker: "const rateLimitMaxRetries =",
    beforeCandidates: [
      "        if (this._retryAttempt > settings.maxRetries) {",
      "if (this._retryAttempt > settings.maxRetries) {",
    ],
    after:
      "        const isRateLimitRetry = /rate.?limit|too many requests|429|quota exceeded/i.test(message.errorMessage || \"\");\n" +
      "        const configuredRateLimitRetries = Number.parseInt(process.env.PI_RATE_LIMIT_MAX_RETRIES ?? \"8\", 10);\n" +
      "        const rateLimitMaxRetries = isRateLimitRetry\n" +
      "            ? Math.max(settings.maxRetries, Number.isFinite(configuredRateLimitRetries) && configuredRateLimitRetries > 0\n" +
      "                ? configuredRateLimitRetries\n" +
      "                : 8)\n" +
      "            : settings.maxRetries;\n" +
      "        if (this._retryAttempt > rateLimitMaxRetries) {",
  },
  {
    marker: "maxAttempts: rateLimitMaxRetries,",
    beforeCandidates: [
      "            maxAttempts: settings.maxRetries,",
      "maxAttempts: settings.maxRetries,",
    ],
    after: "            maxAttempts: rateLimitMaxRetries,",
  },
];

async function applyPatch(requireFn: NodeRequire): Promise<"patched" | "already" | "skip"> {
  let resolvedPath: string;
  try {
    resolvedPath = requireFn.resolve(TARGET_MODULE);
  } catch {
    return "skip";
  }

  const source = await readFile(resolvedPath, "utf-8");
  let patched = source;
  let changed = false;

  for (const replacement of REPLACEMENTS) {
    if (patched.includes(replacement.marker)) {
      continue;
    }
    let next = patched;
    let replaced = false;
    for (const before of replacement.beforeCandidates) {
      if (!next.includes(before)) continue;
      next = next.replace(before, replacement.after);
      replaced = true;
      break;
    }
    if (!replaced) {
      return "skip";
    }
    patched = next;
    changed = true;
  }

  if (!changed) {
    return "already";
  }

  await writeFile(resolvedPath, patched, "utf-8");
  return "patched";
}

/**
 * リトライ予算拡張登録
 * @summary リトライ予算を登録
 * @param pi 拡張API
 * @returns なし
 */
export default function registerRateLimitRetryBudgetExtension(pi: ExtensionAPI): void {
  let initialized = false;

  pi.on("session_start", async () => {
    if (initialized) return;
    initialized = true;

    const requireFn = createRequire(import.meta.url);
    let result: "patched" | "already" | "skip" = "skip";

    try {
      result = await applyPatch(requireFn);
    } catch {
      result = "skip";
    }

    if (result === "patched") {
      console.error("[rate-limit-retry-budget] applied runtime patch");
    } else if (result === "already") {
      console.error("[rate-limit-retry-budget] patch already applied");
    } else {
      console.error("[rate-limit-retry-budget] skipped (target changed or not found)");
    }
  });
}
