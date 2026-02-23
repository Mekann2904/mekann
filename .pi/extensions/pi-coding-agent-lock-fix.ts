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
