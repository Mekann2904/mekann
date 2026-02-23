/**
 * @abdd.meta
 * path: .pi/extensions/pi-coding-agent-lock-fix.ts
 * role: ランタイムパッチ実装
 * why: pi-coding-agentのファイルロック競合による処理停止を回避し、ロックエラー時に警告を表示して続行させるため
 * related: scripts/patch-global-pi.sh, .pi/extensions/pi-coding-agent-rate-limit-fix.ts, package.json
 * public_api: patchFile
 * invariants: 変更対象はnode_modules内の特定パスである、ELOCKED時のみロックをスキップする
 * side_effects: node_modules内のソースコードを書き換える、標準エラー出力に警告を出力する
 * failure_modes: 対象モジュールが存在しない場合スキップする、リトライ設定等の既存パッチと干渍する場合は修正処理が失敗する
 * @abdd.explain
 * overview: pi-coding-agentのロック機設定を動的書き換えし、競合時の挙動を「待機リトライ」から「警告出力＆ロックなし継続」へ変更する非推奨のパッチ処理
 * what_it_does:
 *   - settings-manager.jsおよびauth-storage.jsのロック取得ロジックを検索する
 *   - リトライ設定の削除（repairs）と、ロック失敗時のtry-catchブロック追加（steps）をソースコードに適用する
 *   - ELOCKEDエラー発生時、標準エラー出力へ警告を出力し、処理を続行する
 *   - 対象ファイルが見つからない場合は処理をスキップする
 * why_it_exists:
 *   - エージェント同時実行時等にロックファイル競合が発生し、プロセスが停止する問題を緩和するため
 *   - 依存物を直接改変しない運用への統一に伴い、現在は本実装は無効化され履歴として保持されている
 * scope:
 *   in: PATCH_TARGETS定数（モジュールパス、検索文字列、置換ルール）
 *   out: パッチ適用済みのnode_modules内ファイル、コンソール警告メッセージ
 */

/**
 * .pi/extensions/pi-coding-agent-lock-fix.ts
 * pi-coding-agentのlock問題を緩和する旧ランタイムパッチ実装（現在は既定で無効）。
 * no patch方針により本実装は非推奨で、依存物を直接改変しない運用に統一するため履歴として保持する。
 * 関連ファイル: scripts/patch-global-pi.sh, .pi/extensions/pi-coding-agent-rate-limit-fix.ts, package.json
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type PatchTarget = {
  modulePath: string;
  marker: string;
  repairs?: Array<{
    before: string;
    after: string;
  }>;
  steps: Array<{
    before: string;
    after: string;
  }>;
};

const PATCH_TARGETS: PatchTarget[] = [
  {
    modulePath: "@mariozechner/pi-coding-agent/dist/core/settings-manager.js",
    marker: "Warning (${scope}): Settings file locked by another process",
    repairs: [
      {
        before:
          "                release = lockfile.lockSync(path, {\n                    realpath: false,\n                    stale: 5000,\n                    retries: { retries: 3, minTimeout: 50, maxTimeout: 250 },\n                });",
        after:
          "                release = lockfile.lockSync(path, {\n                    realpath: false,\n                    stale: 5000,\n                });",
      },
    ],
    steps: [
      {
        before: "        let release;\n",
        after: "        let release;\n        let locked = false;\n",
      },
      {
        before: "            release = lockfile.lockSync(path, { realpath: false });",
        after: `            try {
                release = lockfile.lockSync(path, {
                    realpath: false,
                    stale: 5000,
                });
                locked = true;
            }
            catch (e) {
                if (e && e.code === "ELOCKED") {
                    console.error(\`Warning (\${scope}): Settings file locked by another process, proceeding without lock\`);
                }
                else {
                    throw e;
                }
            }`,
      },
      {
        before: "            if (release) {\n                release();\n            }",
        after: "            if (release && locked) {\n                release();\n            }",
      },
    ],
  },
  {
    modulePath: "@mariozechner/pi-coding-agent/dist/core/auth-storage.js",
    marker: "Warning (auth): Auth file locked by another process",
    repairs: [
      {
        before:
          "                release = lockfile.lockSync(this.authPath, {\n                    realpath: false,\n                    stale: 5000,\n                    retries: { retries: 3, minTimeout: 50, maxTimeout: 250 },\n                });",
        after:
          "                release = lockfile.lockSync(this.authPath, {\n                    realpath: false,\n                    stale: 5000,\n                });",
      },
    ],
    steps: [
      {
        before: "        let release;\n",
        after: "        let release;\n        let locked = false;\n",
      },
      {
        before: "            release = lockfile.lockSync(this.authPath, { realpath: false });",
        after: `            try {
                release = lockfile.lockSync(this.authPath, {
                    realpath: false,
                    stale: 5000,
                });
                locked = true;
            }
            catch (e) {
                if (e && e.code === "ELOCKED") {
                    console.error("Warning (auth): Auth file locked by another process, proceeding without lock");
                }
                else {
                    throw e;
                }
            }`,
      },
      {
        before: "            if (release) {\n                release();\n            }",
        after: "            if (release && locked) {\n                release();\n            }",
      },
    ],
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
  let patched = source;
  let changed = false;

  for (const repair of target.repairs ?? []) {
    const next = patched.replace(repair.before, repair.after);
    if (next !== patched) {
      patched = next;
      changed = true;
    }
  }

  if (patched.includes(target.marker) && !changed) {
    return "already";
  }

  for (const step of target.steps) {
    const next = patched.replace(step.before, step.after);
    if (next === patched) {
      continue;
    }
    patched = next;
    changed = true;
  }

  if (!changed) {
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

    if (patchedCount > 0) {
      console.error("[pi-coding-agent-lock-fix] applied runtime patch");
    }

    pi.events.emit("pi-coding-agent-lock-fix:status", {
      patchedCount,
      alreadyCount,
      skipCount,
    });
  });
}
