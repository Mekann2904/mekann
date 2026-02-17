/**
 * CLI Execution Utilities
 *
 * Provides spawn wrapper with:
 * - Timeout handling
 * - Abort signal support
 * - Output size limits
 * - Consistent error handling
 * - Default exclusion patterns
 */

import { spawn } from "node:child_process";
import type { CliOptions, CliResult, CliError, ToolAvailability, ToolVersion } from "../types";
import { DEFAULT_EXCLUDES, DEFAULT_LIMIT, DEFAULT_CODE_SEARCH_LIMIT, DEFAULT_IGNORE_CASE } from "./constants.js";

// Default timeout: 30 seconds
const DEFAULT_TIMEOUT = 30_000;

// Maximum output size: 10MB
const DEFAULT_MAX_OUTPUT_SIZE = 10 * 1024 * 1024;

/**
 * Execute a command and return structured result.
 *
 * @param command - Command to execute
 * @param args - Command arguments
 * @param options - Execution options
 * @returns Promise<CliResult>
 */
export async function execute(
  command: string,
  args: string[] = [],
  options: CliOptions = {}
): Promise<CliResult> {
  const {
    cwd = process.cwd(),
    timeout = DEFAULT_TIMEOUT,
    signal,
    maxOutputSize = DEFAULT_MAX_OUTPUT_SIZE,
    env = {},
  } = options;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let killed = false;
    let timedOut = false;

    const proc = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Handle abort signal
    const abortHandler = () => {
      killed = true;
      proc.kill("SIGTERM");
    };

    if (signal) {
      if (signal.aborted) {
        proc.kill("SIGTERM");
        resolve({
          code: 1,
          stdout: "",
          stderr: "Operation aborted",
          timedOut: false,
          killed: true,
        });
        return;
      }
      signal.addEventListener("abort", abortHandler);
    }

    // Timeout handler
    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, timeout);

    // Collect stdout
    proc.stdout.on("data", (data: Buffer) => {
      if (!truncated && stdout.length < maxOutputSize) {
        const remaining = maxOutputSize - stdout.length;
        if (data.length <= remaining) {
          stdout += data.toString();
        } else {
          stdout += data.subarray(0, remaining).toString();
          truncated = true;
        }
      }
    });

    // Collect stderr
    proc.stderr.on("data", (data: Buffer) => {
      if (!truncated && stderr.length < maxOutputSize) {
        const remaining = maxOutputSize - stderr.length;
        if (data.length <= remaining) {
          stderr += data.toString();
        } else {
          stderr += data.subarray(0, remaining).toString();
        }
      }
    });

    // Handle process exit
    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener("abort", abortHandler);
      }

      resolve({
        code: code ?? 1,
        stdout,
        stderr,
        timedOut,
        killed,
      });
    });

    // Handle process error
    proc.on("error", (err) => {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener("abort", abortHandler);
      }

      resolve({
        code: 1,
        stdout,
        stderr: err.message,
        timedOut: false,
        killed: false,
      });
    });
  });
}

/**
 * Execute a command and throw on non-zero exit.
 *
 * @param command - Command to execute
 * @param args - Command arguments
 * @param options - Execution options
 * @returns Promise<string> - stdout content
 * @throws CliError on failure
 */
export async function executeOrThrow(
  command: string,
  args: string[] = [],
  options: CliOptions = {}
): Promise<string> {
  const result = await execute(command, args, options);

  if (result.code !== 0) {
    const error = new Error(
      `Command failed: ${command} ${args.join(" ")}\n${result.stderr}`
    ) as CliError;
    error.code = result.code;
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    error.command = `${command} ${args.join(" ")}`;
    throw error;
  }

  return result.stdout;
}

/**
 * Check if a command is available in PATH.
 * Works on both Unix (which) and Windows (where).
 *
 * @param command - Command name to check
 * @returns boolean
 */
export async function isAvailable(command: string): Promise<boolean> {
  const whichCommand = process.platform === "win32" ? "where" : "which";
  const result = await execute(whichCommand, [command], { timeout: 5000 });
  return result.code === 0 && result.stdout.trim().length > 0;
}

/**
 * Get version info for a command.
 *
 * @param command - Command name
 * @param versionFlag - Flag to get version (default: "--version")
 * @returns ToolVersion or null
 */
export async function getVersion(
  command: string,
  versionFlag = "--version"
): Promise<ToolVersion | null> {
  const pathResult = await execute("which", [command], { timeout: 5000 });
  if (pathResult.code !== 0) return null;

  const versionResult = await execute(command, [versionFlag], { timeout: 5000 });
  if (versionResult.code !== 0) return null;

  return {
    name: command,
    version: versionResult.stdout.trim().split("\n")[0],
    path: pathResult.stdout.trim(),
  };
}

/**
 * Check availability of all search tools.
 * Caches results for the session.
 * @param force - Force refresh cache (default: false)
 */
let cachedAvailability: ToolAvailability | null = null;

export async function checkToolAvailability(force = false): Promise<ToolAvailability> {
  if (cachedAvailability && !force) return cachedAvailability;

  const [fd, rg, ctagsPath] = await Promise.all([
    isAvailable("fd"),
    isAvailable("rg"),
    execute("which", ["ctags"], { timeout: 5000 }),
  ]);

  let ctags = ctagsPath.code === 0;
  let ctagsJson = false;

  // Check if ctags supports JSON output (universal-ctags)
  if (ctags) {
    const ctagsHelp = await execute("ctags", ["--help"], { timeout: 5000 });
    ctagsJson = ctagsHelp.stdout.includes("--output-format");
  }

  cachedAvailability = { fd, rg, ctags, ctagsJson };
  return cachedAvailability;
}

/**
 * Build fd command arguments from input options.
 * Applies DEFAULT_EXCLUDES when no exclude patterns are specified.
 */
export function buildFdArgs(input: import("../types").FileCandidatesInput): string[] {
  const args: string[] = [];

  // Type filter: fd uses short form -t f or -t d
  const typeMap: Record<string, string> = { file: "f", dir: "d", directory: "d" };
  const fdType = typeMap[input.type || "file"] || "f";
  args.push("-t", fdType);

  // Pattern (must always provide a pattern before the search path)
  // fd syntax: fd [OPTIONS] [PATTERN] [PATH]
  // If pattern is omitted, the search path would be interpreted as a pattern
  args.push(input.pattern || ".");

  // Extensions: fd requires -e for each extension
  if (input.extension && input.extension.length > 0) {
    for (const ext of input.extension) {
      args.push("-e", ext);
    }
  }

  // Exclusions: Apply DEFAULT_EXCLUDES when not explicitly specified
  // User can pass empty array `exclude: []` to disable default excludes
  const excludes = input.exclude ?? [...DEFAULT_EXCLUDES];
  for (const exc of excludes) {
    args.push("--exclude", exc);
  }

  // Depth
  if (input.maxDepth !== undefined) {
    args.push("--max-depth", String(input.maxDepth));
  }

  // Limit (fd has --max-results)
  const limit = input.limit ?? DEFAULT_LIMIT;
  args.push("--max-results", String(limit));

  // Pattern is positional - search path is provided via execute cwd option
  // Do NOT add path as positional argument to avoid conflict with cwd option

  return args;
}

/**
 * Build ripgrep command arguments from input options.
 * Uses default values from constants when not specified.
 * Applies DEFAULT_EXCLUDES when no exclude patterns are specified.
 */
export function buildRgArgs(input: import("../types").CodeSearchInput): string[] {
  const args: string[] = ["--json"];

  // Case sensitivity (default: true from DEFAULT_IGNORE_CASE)
  const ignoreCase = input.ignoreCase ?? DEFAULT_IGNORE_CASE;
  if (ignoreCase) {
    args.push("--ignore-case");
  }

  // Literal search
  if (input.literal) {
    args.push("--fixed-strings");
  }

  // File type
  if (input.type) {
    args.push("--type", input.type);
  }

  // Context
  if (input.context !== undefined && input.context > 0) {
    args.push("--context", String(input.context));
  }

  // Exclusions: Apply DEFAULT_EXCLUDES when not explicitly specified
  // User can pass empty array `exclude: []` to disable default excludes
  // ripgrep uses --glob '!pattern' format for exclusions
  const excludes = input.exclude ?? [...DEFAULT_EXCLUDES];
  for (const exc of excludes) {
    args.push("--glob", `!${exc}`);
  }

  // Pattern (required)
  args.push("--", input.pattern);

  // Path
  if (input.path) {
    args.push(input.path);
  }

  return args;
}

/**
 * Build ctags command arguments for JSON output.
 */
export function buildCtagsArgs(targetPath: string, cwd: string): string[] {
  return [
    "--output-format=json",
    "--fields=+n+s+S+k",
    "--extras=+q",
    "--sort=no",
    "-R",
    targetPath,
  ];
}
