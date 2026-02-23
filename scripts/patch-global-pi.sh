#!/bin/bash
# scripts/patch-global-pi.sh
# グローバルにインストールされたpi-coding-agentへパッチを適用する旧スクリプト（現在は既定で無効）。
# no patch方針により非推奨とし、グローバル配布物を直接改変しない運用へ移行したため履歴として保持する。
# 関連ファイル: .pi/extensions/pi-coding-agent-lock-fix.ts, package.json, docs/04-reference/03-troubleshooting.md

set -e

node <<'NODE'
const { existsSync, readFileSync, writeFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { execSync } = require("node:child_process");

function getCandidateCoreDirs() {
  const dirs = new Set();

  try {
    const npmRoot = execSync("npm root -g", { encoding: "utf-8" }).trim();
    if (npmRoot) {
      dirs.add(join(npmRoot, "@mariozechner", "pi-coding-agent", "dist", "core"));
    }
  } catch {}

  const nvmBase = join(process.env.HOME ?? "", ".config", "nvm", "versions", "node");
  if (existsSync(nvmBase)) {
    for (const version of readdirSync(nvmBase)) {
      dirs.add(
        join(
          nvmBase,
          version,
          "lib",
          "node_modules",
          "@mariozechner",
          "pi-coding-agent",
          "dist",
          "core"
        )
      );
    }
  }

  return [...dirs].filter((dir) => existsSync(dir));
}

function patchSettingsManager(filePath) {
  const src = readFileSync(filePath, "utf-8");
  let next = src;
  let changed = false;

  const repairBefore = `                release = lockfile.lockSync(path, {
                    realpath: false,
                    stale: 5000,
                    retries: { retries: 3, minTimeout: 50, maxTimeout: 250 },
                });`;
  const repairAfter = `                release = lockfile.lockSync(path, {
                    realpath: false,
                    stale: 5000,
                });`;
  const repaired = next.replace(repairBefore, repairAfter);
  if (repaired !== next) {
    next = repaired;
    changed = true;
  }

  if (!next.includes("Warning (${scope}): Settings file locked by another process")) {
    const beforeAcquire = "            release = lockfile.lockSync(path, { realpath: false });";
    const afterAcquire = `            try {
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
            }`;
    const withLocked = next.replace("        let release;\n", "        let release;\n        let locked = false;\n");
    if (withLocked !== next) {
      next = withLocked;
      changed = true;
    }
    const withAcquire = next.replace(beforeAcquire, afterAcquire);
    if (withAcquire !== next) {
      next = withAcquire;
      changed = true;
    }
    const withRelease = next.replace("            if (release) {\n                release();\n            }", "            if (release && locked) {\n                release();\n            }");
    if (withRelease !== next) {
      next = withRelease;
      changed = true;
    }
  }

  if (!changed) return "already";
  writeFileSync(filePath, next, "utf-8");
  return "patched";
}

function patchAuthStorage(filePath) {
  const src = readFileSync(filePath, "utf-8");
  let next = src;
  let changed = false;

  const repairBefore = `                release = lockfile.lockSync(this.authPath, {
                    realpath: false,
                    stale: 5000,
                    retries: { retries: 3, minTimeout: 50, maxTimeout: 250 },
                });`;
  const repairAfter = `                release = lockfile.lockSync(this.authPath, {
                    realpath: false,
                    stale: 5000,
                });`;
  const repaired = next.replace(repairBefore, repairAfter);
  if (repaired !== next) {
    next = repaired;
    changed = true;
  }

  if (!next.includes("Warning (auth): Auth file locked by another process")) {
    const beforeAcquire = "            release = lockfile.lockSync(this.authPath, { realpath: false });";
    const afterAcquire = `            try {
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
            }`;
    const withLocked = next.replace("        let release;\n", "        let release;\n        let locked = false;\n");
    if (withLocked !== next) {
      next = withLocked;
      changed = true;
    }
    const withAcquire = next.replace(beforeAcquire, afterAcquire);
    if (withAcquire !== next) {
      next = withAcquire;
      changed = true;
    }
    const withRelease = next.replace("            if (release) {\n                release();\n            }", "            if (release && locked) {\n                release();\n            }");
    if (withRelease !== next) {
      next = withRelease;
      changed = true;
    }
  }

  if (!changed) return "already";
  writeFileSync(filePath, next, "utf-8");
  return "patched";
}

const coreDirs = getCandidateCoreDirs();
if (coreDirs.length === 0) {
  console.log("pi-coding-agent not found in global npm packages");
  process.exit(0);
}

let patchedCount = 0;
let alreadyCount = 0;
let skipCount = 0;

for (const coreDir of coreDirs) {
  const settingsPath = join(coreDir, "settings-manager.js");
  const authPath = join(coreDir, "auth-storage.js");

  if (existsSync(settingsPath)) {
    const result = patchSettingsManager(settingsPath);
    if (result === "patched") patchedCount++;
    else if (result === "already") alreadyCount++;
    else skipCount++;
    console.log(`${result}: ${settingsPath}`);
  }

  if (existsSync(authPath)) {
    const result = patchAuthStorage(authPath);
    if (result === "patched") patchedCount++;
    else if (result === "already") alreadyCount++;
    else skipCount++;
    console.log(`${result}: ${authPath}`);
  }
}

console.log(
  `Global pi-coding-agent lock patch completed (patched=${patchedCount}, already=${alreadyCount}, skipped=${skipCount})`
);
NODE
