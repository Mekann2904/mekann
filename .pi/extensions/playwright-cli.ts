/**
 * path: .pi/extensions/playwright-cli.ts
 * role: playwright-cli を PI から呼び出す最小ラッパー拡張
 * why: ブラウザ自動化を CLI ベースで安全に実行するため
 * related: package.json, tests/unit/extensions/playwright-cli.test.ts, docs/02-user-guide/01-extensions.md
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { toError } from "../lib/core/error-utils.js";

const execFileAsync = promisify(execFile);

const PlaywrightCliParams = Type.Object({
  command: Type.String({ description: "playwright-cli subcommand (e.g. open, goto, click, snapshot)" }),
  args: Type.Optional(Type.Array(Type.String(), { description: "subcommand arguments" })),
  session: Type.Optional(Type.String({ description: "session name for -s=<name>" })),
  config: Type.Optional(Type.String({ description: "path to config file (--config)" })),
  timeout_ms: Type.Optional(Type.Integer({ minimum: 1000, maximum: 300000, description: "process timeout in milliseconds" })),
  cwd: Type.Optional(Type.String({ description: "working directory override" })),
});

type PlaywrightCliParamsType = {
  command: string;
  args?: string[];
  session?: string;
  config?: string;
  timeout_ms?: number;
  cwd?: string;
};

export function buildPlaywrightCliArgs(params: PlaywrightCliParamsType): string[] {
  const built: string[] = [];

  if (params.session) {
    built.push(`-s=${params.session}`);
  }

  if (params.config) {
    built.push("--config", params.config);
  }

  built.push(params.command);

  if (params.args && params.args.length > 0) {
    built.push(...params.args);
  }

  return built;
}

function toTextOutput(stdout: string, stderr: string): string {
  const out = stdout.trim();
  const err = stderr.trim();

  if (out && err) {
    return `${out}\n\n[stderr]\n${err}`;
  }

  return out || err || "No output.";
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "playwright_cli",
    label: "Playwright CLI",
    description: "Run playwright-cli commands from PI extension.",
    parameters: PlaywrightCliParams,

    async execute(_toolCallId, params: PlaywrightCliParamsType, signal, _onUpdate, ctx) {
      if (!params.command || !params.command.trim()) {
        return {
          content: [{ type: "text" as const, text: "Error: 'command' is required." }],
          details: {},
        };
      }

      const args = buildPlaywrightCliArgs(params);
      const timeoutMs = params.timeout_ms ?? 120000;
      const targetCwd = params.cwd ?? ctx?.cwd ?? process.cwd();
      const command = "playwright-cli";
      const commandArgs = args;

      try {
        const { stdout, stderr } = await execFileAsync(command, commandArgs, {
          cwd: targetCwd,
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024,
          signal,
        });

        return {
          content: [{ type: "text" as const, text: toTextOutput(stdout, stderr) }],
          details: {
            command,
            args: commandArgs,
            cwd: targetCwd,
          },
        };
      } catch (error: unknown) {
        const err = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
        const normalized = toError(error);
        return {
          content: [{
            type: "text" as const,
            text: `Error executing playwright-cli: ${normalized.message}\nStderr: ${err.stderr ?? ""}`,
          }],
          details: {
            command,
            args: commandArgs,
            cwd: targetCwd,
            stdout: err.stdout ?? "",
            stderr: err.stderr ?? "",
          },
        };
      }
    },
  });
}
