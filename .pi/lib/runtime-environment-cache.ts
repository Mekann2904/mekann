// Path: .pi/lib/runtime-environment-cache.ts
// Role: セッション中に再利用する軽量な環境スナップショットを保持する
// Why: repo検出や主要ツール判定の重複実行を減らし、promptへ短く注入するため
// Related: .pi/extensions/startup-context.ts, .pi/lib/tool-policy-engine.ts, .pi/lib/tool-telemetry-store.ts

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface RuntimeEnvironmentSnapshot {
  repoRoot: string;
  gitBranch?: string;
  packageManager?: "npm" | "pnpm" | "yarn" | "bun";
  testFramework?: string;
  mainLanguage?: string;
  buildSystem?: string;
  largeDirectoriesToAvoid: string[];
  frequentFiles: string[];
  lastSuccessfulCommandByTool: Record<string, string>;
  detectedAtMs: number;
}

function safeExec(command: string): string {
  try {
    return execSync(command, {
      cwd: process.cwd(),
      encoding: "utf-8",
      timeout: 500,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function detectPackageManager(cwd: string): RuntimeEnvironmentSnapshot["packageManager"] {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) return "bun";
  if (existsSync(join(cwd, "package-lock.json"))) return "npm";
  return undefined;
}

function detectTestFramework(cwd: string): string | undefined {
  if (existsSync(join(cwd, "vitest.config.ts")) || existsSync(join(cwd, "vitest.config.mjs"))) return "vitest";
  if (existsSync(join(cwd, "jest.config.js")) || existsSync(join(cwd, "jest.config.ts"))) return "jest";
  if (existsSync(join(cwd, "pytest.ini")) || existsSync(join(cwd, "pyproject.toml"))) return "pytest";
  return undefined;
}

function detectMainLanguage(cwd: string): string | undefined {
  if (existsSync(join(cwd, "tsconfig.json"))) return "typescript";
  if (existsSync(join(cwd, "package.json"))) return "javascript";
  if (existsSync(join(cwd, "pyproject.toml")) || existsSync(join(cwd, "requirements.txt"))) return "python";
  if (existsSync(join(cwd, "Cargo.toml"))) return "rust";
  if (existsSync(join(cwd, "go.mod"))) return "go";
  return undefined;
}

function detectBuildSystem(cwd: string): string | undefined {
  if (existsSync(join(cwd, "Makefile"))) return "make";
  if (existsSync(join(cwd, "package.json"))) return "package-scripts";
  if (existsSync(join(cwd, "Cargo.toml"))) return "cargo";
  if (existsSync(join(cwd, "go.mod"))) return "go";
  return undefined;
}

function collectFrequentFiles(cwd: string): string[] {
  const candidates = [
    "README.md",
    "package.json",
    "tsconfig.json",
    "vitest.config.ts",
    "vitest.config.mjs",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
  ];
  return candidates.filter((file) => existsSync(join(cwd, file)));
}

function collectLargeDirectories(): string[] {
  return ["node_modules", "dist", "build", "coverage", ".git"];
}

class RuntimeEnvironmentCache {
  private snapshot: RuntimeEnvironmentSnapshot | null = null;

  reset(): void {
    this.snapshot = null;
  }

  getSnapshot(forceRefresh = false): RuntimeEnvironmentSnapshot {
    if (this.snapshot && !forceRefresh) {
      return this.snapshot;
    }

    const cwd = process.cwd();
    const repoRoot = safeExec("git rev-parse --show-toplevel") || cwd;
    const gitBranch = safeExec("git branch --show-current") || undefined;
    this.snapshot = {
      repoRoot,
      gitBranch,
      packageManager: detectPackageManager(repoRoot),
      testFramework: detectTestFramework(repoRoot),
      mainLanguage: detectMainLanguage(repoRoot),
      buildSystem: detectBuildSystem(repoRoot),
      largeDirectoriesToAvoid: collectLargeDirectories(),
      frequentFiles: collectFrequentFiles(repoRoot),
      lastSuccessfulCommandByTool: this.snapshot?.lastSuccessfulCommandByTool ?? {},
      detectedAtMs: Date.now(),
    };

    return this.snapshot;
  }

  rememberSuccessfulCommand(toolName: string, command: string): void {
    const snapshot = this.getSnapshot();
    snapshot.lastSuccessfulCommandByTool[toolName] = command;
  }

  formatForPrompt(): string {
    const snapshot = this.getSnapshot();
    const lines = [
      "# Runtime Environment Cache",
      `repo_root=${snapshot.repoRoot}`,
      `package_manager=${snapshot.packageManager ?? "unknown"}`,
      `test_framework=${snapshot.testFramework ?? "unknown"}`,
      `main_language=${snapshot.mainLanguage ?? "unknown"}`,
      `build_system=${snapshot.buildSystem ?? "unknown"}`,
      `avoid_dirs=${snapshot.largeDirectoriesToAvoid.join(", ")}`,
    ];
    if (snapshot.frequentFiles.length > 0) {
      lines.push(`frequent_files=${snapshot.frequentFiles.join(", ")}`);
    }
    const successfulTools = Object.entries(snapshot.lastSuccessfulCommandByTool).slice(0, 5);
    if (successfulTools.length > 0) {
      lines.push(
        `last_successful_commands=${successfulTools.map(([tool, command]) => `${tool}:${command}`).join(" | ")}`
      );
    }
    return lines.join("\n");
  }
}

let sharedCache: RuntimeEnvironmentCache | null = null;

export function getRuntimeEnvironmentCache(): RuntimeEnvironmentCache {
  if (!sharedCache) {
    sharedCache = new RuntimeEnvironmentCache();
  }
  return sharedCache;
}
