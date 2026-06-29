#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

if (process.env.CI === "true") {
  process.exit(0);
}

const command = process.platform === "win32" ? "husky.cmd" : "husky";
const result = spawnSync(command, { stdio: "inherit", shell: process.platform === "win32" });

if (result.error?.code === "ENOENT") {
  // Do NOT fail (`npm install` must stay green): husky is a devDependency and
  // is normally installed before `prepare` runs. If it is missing here, the
  // pre-push hook is silently left uninstalled, so type/test failures slip
  // through to the remote (see issue #171 / IC-051). Surface the consequence
  // and the recovery step instead of a bare one-liner.
  console.warn(
    "husky not found; git hooks (pre-push) were NOT installed.\n" +
      "  Re-run `npm install` (without --omit=dev) so devDependencies are present,\n" +
      "  then hooks install automatically on the next prepare."
  );
  process.exit(0);
}

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);
