/**
 * path: scripts/rebuild-better-sqlite3-for-pi.js
 * role: 現在の Node.js 実行系で better-sqlite3 を再ビルドする
 * why: pi と同じ Node 22 ABI に native addon を揃えて SQLite を正常動作させるため
 * related: package.json, scripts/ensure-node-for-pi.js, .npmrc, README.md
 */

const { spawnSync } = require("node:child_process");
const { dirname, join } = require("node:path");

const REQUIRED_MAJOR = 22;
const currentMajor = Number.parseInt(process.versions.node.split(".")[0] || "", 10);

if (currentMajor !== REQUIRED_MAJOR) {
  process.stderr.write(
    [
      `[rebuild-better-sqlite3] Node ${process.versions.node} is not supported.`,
      `[rebuild-better-sqlite3] Switch to Node 22 before rebuilding.`,
    ].join("\n") + "\n",
  );
  process.exit(1);
}

const nodeDir = dirname(process.execPath);
const npmCliPath = join(nodeDir, "../lib/node_modules/npm/bin/npm-cli.js");
const nodeGypDir = join(process.env.HOME || "", "Library", "Caches", "node-gyp", process.versions.node);

const result = spawnSync(
  process.execPath,
  [
    npmCliPath,
    "rebuild",
    "better-sqlite3",
    "--build-from-source",
    "--foreground-scripts",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PATH: `${nodeDir}:${process.env.PATH || ""}`,
      npm_config_nodedir: nodeGypDir,
    },
  },
);

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
