/**
 * .pi/extensions/pi-ai-abort-fix.ts
 * pi-aiのstop reason変換にabort対応を追加する旧ランタイムパッチ実装（現在は既定で無効）。
 * no patch方針により本実装は非推奨で、例外経路のハンドリングで代替するために履歴として保持する。
 * 関連: docs/patches/pi-ai-abort-fix.md, .pi/lib/error-utils.ts, package.json
 */
/**
 * @abdd.meta
 * path: .pi/extensions/pi-ai-abort-fix.ts
 * role: deprecated pi-ai runtime patch
 * why: 過去互換のために保持するが、現在はno patch方針で非推奨
 * related: docs/patches/pi-ai-abort-fix.md
 * public_api: default function
 * invariants: セッション開始時に1回だけパッチ適用
 * side_effects: pi-aiパッケージの配布JSをテキスト置換
 * failure_modes: 置換対象コードが変更された場合は未適用のままになる
 */

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type PatchTarget = {
  modulePath: string;
  marker: string;
  before: string;
  after: string;
};

const PATCH_TARGETS: PatchTarget[] = [
  {
    modulePath: "@mariozechner/pi-ai/dist/providers/anthropic.js",
    marker: 'case "abort":',
    before: '        case "sensitive": // Content flagged by safety filters (not yet in SDK types)\n            return "error";',
    after:
      '        case "sensitive": // Content flagged by safety filters (not yet in SDK types)\n            return "error";\n        case "abort":\n            return "aborted";',
  },
  {
    modulePath: "@mariozechner/pi-ai/dist/providers/openai-completions.js",
    marker: 'case "abort":',
    before: '        case "content_filter":\n            return "error";',
    after: '        case "content_filter":\n            return "error";\n        case "abort":\n            return "aborted";',
  },
  {
    modulePath: "@mariozechner/pi-ai/dist/providers/openai-responses-shared.js",
    marker: 'case "abort":',
    before: '        case "failed":\n        case "cancelled":\n            return "error";',
    after:
      '        case "failed":\n        case "cancelled":\n            return "error";\n        case "abort":\n            return "aborted";',
  },
];

async function patchFile(requireFn: NodeRequire, target: PatchTarget): Promise<"patched" | "already" | "skip"> {
  let resolvedPath: string;
  try {
    resolvedPath = requireFn.resolve(target.modulePath);
  } catch {
    return "skip";
  }

  const source = await readFile(resolvedPath, "utf-8");
  if (source.includes(target.marker)) {
    return "already";
  }

  const patched = source.replace(target.before, target.after);
  if (patched === source) {
    return "skip";
  }

  await writeFile(resolvedPath, patched, "utf-8");
  return "patched";
}

export default function (pi: ExtensionAPI) {
  let initialized = false;

  pi.on("session_start", async () => {
    if (initialized) return;
    initialized = true;

    const requireFn = createRequire(import.meta.url);
    let patchedCount = 0;
    let alreadyCount = 0;
    let skipCount = 0;

    for (const target of PATCH_TARGETS) {
      try {
        const result = await patchFile(requireFn, target);
        if (result === "patched") patchedCount++;
        else if (result === "already") alreadyCount++;
        else skipCount++;
      } catch {
        skipCount++;
      }
    }

    pi.events.emit("pi-ai-abort-fix:status", {
      patchedCount,
      alreadyCount,
      skipCount,
    });
  });
}
