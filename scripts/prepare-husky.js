#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

if (process.env.CI === "true") {
  process.exit(0);
}

const command = process.platform === "win32" ? "husky.cmd" : "husky";
const result = spawnSync(command, { stdio: "inherit", shell: process.platform === "win32" });

if (result.error?.code === "ENOENT") {
  console.warn("husky not found; skipping git hooks installation");
  process.exit(0);
}

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);
