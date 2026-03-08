/**
 * path: scripts/ensure-node-for-pi.js
 * role: npm install 前に Node.js の major version を検証する
 * why: better-sqlite3 を pi と互換のある Node 22 ABI でビルドさせるため
 * related: package.json, .npmrc, scripts/rebuild-better-sqlite3-for-pi.js, README.md
 */

const REQUIRED_MAJOR = 22;
const RECOMMENDED_VERSION = "22.12.0";

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const currentMajor = Number.parseInt(process.versions.node.split(".")[0] || "", 10);

if (currentMajor !== REQUIRED_MAJOR) {
  fail(
    [
      `[node-check] Node ${process.versions.node} is not supported for this workspace.`,
      `[node-check] Use Node ${RECOMMENDED_VERSION} (major ${REQUIRED_MAJOR}) before running npm install.`,
      "[node-check] Example: nvm use 22.12.0",
      "[node-check] Reason: pi currently runs on Node 22, and better-sqlite3 must be built for the same ABI.",
    ].join("\n"),
  );
}

process.stdout.write(`[node-check] Node ${process.versions.node} is compatible with pi.\n`);
