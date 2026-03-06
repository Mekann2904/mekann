/**
 * @abdd.meta
 * path: .pi/lib/startup-context-collectors.ts
 * role: セッションスタートアップコンテキストの情報収集モジュール
 * why: 各層の環境情報を効率的かつ安全に収集するため
 * related: .pi/lib/startup-context-types.ts, .pi/extensions/startup-context.ts
 * public_api: collectSessionStartContext, collectUserPromptDelta, formatAsShellOutput
 * invariants:
 *   - 各コマンドはタイムアウト付きで実行される
 *   - 秘密情報は必ずマスクされる
 *   - 失敗したコマンドはスキップして続行する
 * side_effects:
 *   - 子プロセス実行（各種コマンド）
 *   - ファイルシステム読み取り
 * failure_modes:
 *   - コマンドタイムアウト
 *   - 権限不足による情報取得失敗
 *   - 非Unix環境でのコマンド不在
 * @abdd.explain
 * overview: 20層の環境情報を収集・フォーマットする関数群
 * what_it_does:
 *   - SessionStart用のベースライン情報を収集
 *   - UserPromptSubmit用の差分情報を収集
 *   - オンデマンド深掘り情報を収集
 *   - シェル形式での出力フォーマット
 * why_it_exists:
 *   - エージェントが環境情報を重複収集することを防ぐ
 *   - トークン効率の良い情報提供を実現
 * scope:
 *   in: なし（環境から収集）
 *   out: 構造化された環境情報
 */

import { execSync, type ExecSyncOptions } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import type {
  SessionStartContext,
  UserPromptSubmitDelta,
  ContextMetadata,
  OsInfo,
  UserInfo,
  ShellInfo,
  EnvInfo,
  DateTimeInfo,
  ResourceInfo,
  RuntimeInfo,
  ToolInfo,
  PythonInfo,
  GitInfo,
  StructureInfo,
  PlatformInfo,
  SecurityInfo,
  EntryPointsInfo,
  ProjectContextInfo,
  CollectionPolicyInfo,
  ContextOutputSection,
  SectionTruncationInfo,
  NetworkInfo,
  ProcessInfo,
  FailureTracesInfo,
} from "./startup-context-types.js";
import {
  MASK_PATTERNS,
  SAFE_ENV_VARS,
  CI_ENV_VARS,
  FAILURE_SIGNAL_FILES,
  SESSION_START_TTL_SECONDS,
  USER_PROMPT_TTL_SECONDS,
} from "./startup-context-types.js";

// ============================================================================
// Constants
// ============================================================================

/** デフォルトのタイムアウト（ミリ秒） */
const DEFAULT_TIMEOUT_MS = 500;

/** 長いタイムアウト（ミリ秒） */
const LONG_TIMEOUT_MS = 2000;

/** 最大エントリ数 */
const MAX_ENTRIES = 20;

/** 最大コミット数 */
const MAX_COMMITS = 5;

/** 最大PATH エントリ表示数 */
const MAX_PATH_ENTRIES = 3;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * @summary コマンドを安全に実行
 * @param command 実行コマンド
 * @param options 実行オプション
 * @returns 出力（失敗時は空文字）
 */
function safeExec(command: string, options?: ExecSyncOptions): string {
  try {
    const result = execSync(command, {
      encoding: "utf-8",
      timeout: DEFAULT_TIMEOUT_MS,
      cwd: process.cwd(),
      ...options,
    });
    // execSync with encoding returns string, but TypeScript doesn't know that
    return typeof result === "string" ? result.trim() : "";
  } catch {
    return "";
  }
}

/**
 * @summary CPUコア数取得コマンドをOSごとに返す
 * @returns CPUコア数取得用コマンド
 */
function getCpuCoreCountCommand(): string {
  if (process.platform === "darwin") {
    return "sysctl -n hw.ncpu";
  }

  return "nproc";
}

/**
 * @summary 秘密情報かどうかを判定
 * @param key 環境変数名
 * @returns 秘密情報の場合true
 */
function isSecretKey(key: string): boolean {
  return MASK_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * @summary CI環境かどうかを判定
 * @returns CI環境の場合true
 */
function isCiEnvironment(): boolean {
  return CI_ENV_VARS.some((varName) => Boolean(process.env[varName]));
}

/**
 * @summary CIプラットフォーム名を取得
 * @returns CIプラットフォーム名
 */
function getCiPlatform(): string | undefined {
  if (process.env.GITHUB_ACTIONS) return "github-actions";
  if (process.env.GITLAB_CI) return "gitlab-ci";
  if (process.env.CIRCLECI) return "circleci";
  if (process.env.TRAVIS) return "travis";
  if (process.env.JENKINS_URL) return "jenkins";
  if (process.env.BUILDKITE) return "buildkite";
  if (process.env.DRONE) return "drone";
  if (process.env.TEAMCITY_VERSION) return "teamcity";
  if (process.env.CI) return "generic-ci";
  return undefined;
}

/**
 * @summary Docker環境内かどうかを判定
 * @returns Docker環境内の場合true
 */
function isDockerEnvironment(): boolean {
  // /.dockerenv ファイルの存在チェック
  if (existsSync("/.dockerenv")) return true;

  // cgroup に docker 文字列が含まれるか
  try {
    if (existsSync("/proc/1/cgroup")) {
      const cgroup = readFileSync("/proc/1/cgroup", "utf-8");
      if (cgroup.includes("docker") || cgroup.includes("kubepods")) return true;
    }
  } catch {
    // ignore
  }

  return false;
}

/**
 * @summary WSLかどうかを判定
 * @returns WSLの場合true
 */
function isWslEnvironment(): boolean {
  try {
    if (existsSync("/proc/version")) {
      const version = readFileSync("/proc/version", "utf-8");
      return version.toLowerCase().includes("microsoft");
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * @summary Kubernetes環境内かどうかを判定
 * @returns Kubernetes環境内の場合true
 */
function isKubernetesEnvironment(): boolean {
  return Boolean(process.env.KUBERNETES_SERVICE_HOST);
}

/**
 * @summary 現在の日時メタデータを生成
 * @param ttlSeconds TTL秒数
 * @returns メタデータ
 */
function createMetadata(ttlSeconds: number): ContextMetadata {
  return {
    captured_at: new Date().toISOString(),
    ttl_seconds: ttlSeconds,
  };
}

// ============================================================================
// Layer Collectors
// ============================================================================

/**
 * @summary 層1: OS/Kernel/Host情報を収集
 */
function collectOsInfo(): OsInfo {
  const uname = safeExec("uname -a");
  const arch = safeExec("uname -m") || process.arch;
  const hostname = safeExec("hostname") || "unknown";

  let distro = "";
  if (process.platform === "darwin") {
    distro = safeExec("sw_vers 2>/dev/null | head -5");
  } else if (existsSync("/etc/os-release")) {
    distro = safeExec("cat /etc/os-release 2>/dev/null | head -5");
  }

  return { uname, distro: distro || undefined, arch, hostname };
}

/**
 * @summary 層2: User/Permissions情報を収集
 */
function collectUserInfo(): UserInfo {
  const whoami = safeExec("whoami") || process.env.USER || "unknown";
  const uid_gid = safeExec("id");
  const groups = safeExec("groups");
  const cwd = process.cwd();

  return { whoami, uid_gid, groups, cwd };
}

/**
 * @summary 層3: Shell/Session情報を収集
 */
function collectShellInfo(): ShellInfo {
  const shell = process.env.SHELL || "unknown";
  const term = process.env.TERM || "unknown";
  const parentProcess = safeExec("ps -p $PPID -o comm=") || "unknown";
  const isInteractive = process.stdout.isTTY === true;
  const isCi = isCiEnvironment();

  return {
    shell,
    term,
    parent_process: parentProcess,
    is_interactive: isInteractive,
    is_ci: isCi,
  };
}

/**
 * @summary 層4: Environment Variables情報を収集（サニタイズ済み）
 */
function collectEnvInfo(): EnvInfo {
  // PATH の先頭N件
  const pathEnv = process.env.PATH || "";
  const pathEntries = pathEnv.split(":").slice(0, MAX_PATH_ENTRIES);
  const pathSummary = pathEntries.join(":") + (pathEnv.split(":").length > MAX_PATH_ENTRIES ? ":..." : "");

  // 安全な環境変数のみ収集
  const safeVars: Record<string, string> = {};
  const maskedKeys: string[] = [];

  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;

    if (isSecretKey(key)) {
      maskedKeys.push(key);
    } else if (SAFE_ENV_VARS.includes(key as (typeof SAFE_ENV_VARS)[number])) {
      safeVars[key] = value;
    }
  }

  return {
    path_summary: pathSummary,
    home: process.env.HOME || "",
    shell: process.env.SHELL || "",
    lang: process.env.LANG || "",
    safe_vars: safeVars,
    masked_keys: maskedKeys.slice(0, 10), // 最大10件まで表示
  };
}

/**
 * @summary 層5: Date/Time/Locale情報を収集
 */
function collectDateTimeInfo(): DateTimeInfo {
  const now = new Date().toISOString();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = process.env.LANG || process.env.LC_ALL || "unknown";

  return { now, timezone, locale };
}

/**
 * @summary 層6: CPU/Memory/Disk情報を収集（要約）
 */
function collectResourceInfo(): ResourceInfo {
  const cpuCoreCountCommand = getCpuCoreCountCommand();
  const cpuCores = Number.parseInt(safeExec(cpuCoreCountCommand) || "1", 10);

  // メモリ情報
  let memoryTotal = "unknown";
  let memoryAvailable = "unknown";

  if (process.platform === "darwin") {
    memoryTotal = safeExec("sysctl -n hw.memsize | awk '{print $1/1024/1024/1024 \" GB\"}'");
    memoryAvailable = safeExec("vm_stat | head -10 | grep 'free' | awk '{print $3}'");
  } else if (existsSync("/proc/meminfo")) {
    const memInfo = safeExec("cat /proc/meminfo | grep -E 'MemTotal|MemAvailable'");
    const totalMatch = memInfo.match(/MemTotal:\s*(\d+)/);
    const availMatch = memInfo.match(/MemAvailable:\s*(\d+)/);
    if (totalMatch) memoryTotal = `${Math.round(Number(totalMatch[1]) / 1024 / 1024)} GB`;
    if (availMatch) memoryAvailable = `${Math.round(Number(availMatch[1]) / 1024 / 1024)} GB`;
  }

  // ディスク使用率
  const diskRoot = collectDiskUsage("/");
  const diskProject = collectDiskUsage(process.cwd());

  return {
    cpu_cores: cpuCores,
    memory_total: memoryTotal,
    memory_available: memoryAvailable,
    disk_root: diskRoot,
    disk_project: diskProject,
  };
}

/**
 * @summary ディスク使用率を収集
 */
function collectDiskUsage(path: string): { path: string; used_percent: number } {
  const dfOutput = safeExec(`df -h "${path}" 2>/dev/null | tail -1`);
  const match = dfOutput.match(/(\d+)%/);
  const usedPercent = match ? Number.parseInt(match[1], 10) : 0;

  return { path, used_percent: usedPercent };
}

/**
 * @summary 層7: ネットワーク基礎情報を収集（オンデマンド）
 */
export function collectNetworkInfo(): NetworkInfo {
  // プライマリIP
  let primaryIp = "";
  if (process.platform === "darwin") {
    primaryIp = safeExec("ifconfig | grep 'inet ' | grep -v 127.0.0.1 | head -1 | awk '{print $2}'");
  } else {
    primaryIp = safeExec("ip route get 1 | awk '{print $7; exit}'");
  }

  // デフォルトゲートウェイ
  let defaultGateway = "";
  if (process.platform === "darwin") {
    defaultGateway = safeExec("route -n get default | grep gateway | awk '{print $2}'");
  } else {
    defaultGateway = safeExec("ip route | grep default | awk '{print $3}'");
  }

  // 外部通信可否
  let externalConnectivity = false;
  try {
    execSync("ping -c 1 -W 2 8.8.8.8", { timeout: 3000 });
    externalConnectivity = true;
  } catch {
    externalConnectivity = false;
  }

  // LISTEN中のポート
  const listeningPortsRaw = safeExec(
    "netstat -tln 2>/dev/null | awk 'NR>1 {print $4}' | grep -oE '[0-9]+$' | sort -nu | head -20",
    { timeout: LONG_TIMEOUT_MS }
  );
  const listeningPorts = listeningPortsRaw
    .split("\n")
    .filter((p) => p.trim())
    .map((p) => p.trim());

  return {
    primary_ip: primaryIp || undefined,
    default_gateway: defaultGateway || undefined,
    external_connectivity: externalConnectivity,
    listening_ports: listeningPorts,
  };
}

/**
 * @summary 層8: 利用可能なプログラミング言語・ランタイムを収集
 */
function collectRuntimes(): RuntimeInfo[] {
  const runtimes: RuntimeInfo[] = [];

  // Node.js
  const nodeVersion = safeExec("node --version");
  const nodePath = safeExec("which node");
  if (nodeVersion) {
    runtimes.push({ name: "node", version: nodeVersion, path: nodePath || "unknown" });
  }

  // Python
  const pythonVersion = safeExec("python3 --version");
  const pythonPath = safeExec("which python3");
  if (pythonVersion) {
    runtimes.push({ name: "python3", version: pythonVersion, path: pythonPath || "unknown" });
  }

  // Go
  const goVersion = safeExec("go version");
  const goPath = safeExec("which go");
  if (goVersion) {
    runtimes.push({ name: "go", version: goVersion.replace("go version ", ""), path: goPath || "unknown" });
  }

  // Rust
  const rustVersion = safeExec("rustc --version");
  const rustPath = safeExec("which rustc");
  if (rustVersion) {
    runtimes.push({ name: "rustc", version: rustVersion, path: rustPath || "unknown" });
  }

  // Java
  const javaVersion = safeExec("java -version 2>&1 | head -1");
  const javaPath = safeExec("which java");
  if (javaVersion) {
    runtimes.push({ name: "java", version: javaVersion, path: javaPath || "unknown" });
  }

  return runtimes;
}

/**
 * @summary 層9: パッケージマネージャとビルドツールを収集
 */
function collectTools(): ToolInfo[] {
  const tools: ToolInfo[] = [];

  const toolCommands = [
    { name: "npm", versionCmd: "npm --version" },
    { name: "pnpm", versionCmd: "pnpm --version" },
    { name: "yarn", versionCmd: "yarn --version" },
    { name: "pip", versionCmd: "pip --version" },
    { name: "pip3", versionCmd: "pip3 --version" },
    { name: "cargo", versionCmd: "cargo --version" },
    { name: "make", versionCmd: "make --version | head -1" },
    { name: "cmake", versionCmd: "cmake --version | head -1" },
    { name: "gcc", versionCmd: "gcc --version | head -1" },
    { name: "clang", versionCmd: "clang --version | head -1" },
    { name: "docker", versionCmd: "docker --version" },
    { name: "git", versionCmd: "git --version" },
  ];

  for (const tool of toolCommands) {
    const version = safeExec(tool.versionCmd);
    tools.push({
      name: tool.name,
      version: version || "not available",
      available: Boolean(version),
    });
  }

  return tools;
}

/**
 * @summary 層10a: Python環境情報を収集（軽量版・条件付き）
 */
function collectPythonInfo(): PythonInfo | undefined {
  // Pythonマーカーファイルの存在チェック
  const cwd = process.cwd();
  const hasPyproject = existsSync(join(cwd, "pyproject.toml"));
  const hasRequirements = existsSync(join(cwd, "requirements.txt"));
  const hasSetup = existsSync(join(cwd, "setup.py"));
  const hasPythonVersion = existsSync(join(cwd, ".python-version"));

  // Python関連ファイルがない場合はスキップ
  if (!hasPyproject && !hasRequirements && !hasSetup && !hasPythonVersion) {
    return undefined;
  }

  const executable = safeExec("which python3") || safeExec("which python") || "";
  const version = safeExec("python3 --version 2>/dev/null") || safeExec("python --version 2>/dev/null");

  // venv検出
  const venvActive = Boolean(process.env.VIRTUAL_ENV);
  const venvPath = process.env.VIRTUAL_ENV;

  return {
    executable,
    version,
    venv_active: venvActive,
    venv_path: venvPath,
    has_pyproject: hasPyproject,
    has_requirements: hasRequirements,
  };
}

/**
 * @summary 層11: Gitリポジトリ情報を収集
 */
function collectGitInfo(): GitInfo {
  const isRepo = safeExec("git rev-parse --is-inside-work-tree") === "true";

  if (!isRepo) {
    return {
      is_repo: false,
      status_summary: "N/A",
      recent_commits: [],
      is_dirty: false,
    };
  }

  const root = safeExec("git rev-parse --show-toplevel");
  const branch = safeExec("git branch --show-current") || safeExec("git rev-parse --short HEAD");
  const remote = safeExec("git remote get-url origin 2>/dev/null");

  // ステータス要約
  const statusShort = safeExec("git status --short");
  const statusLines = statusShort.split("\n").filter((l) => l.trim());
  const staged = statusLines.filter((l) => l.match(/^[MADRC]/)).length;
  const modified = statusLines.filter((l) => l.match(/^.[MADRC]/)).length;
  const untracked = statusLines.filter((l) => l.startsWith("??")).length;
  const statusSummary = `staged:${staged} modified:${modified} untracked:${untracked}`;

  // 直近コミット
  const gitLog = safeExec(`git log -${MAX_COMMITS} --oneline --no-merges`);
  const recentCommits = gitLog.split("\n").filter((l) => l.trim());

  const isDirty = staged > 0 || modified > 0 || untracked > 0;

  return {
    is_repo: true,
    root,
    branch,
    remote: remote || undefined,
    status_summary: statusSummary,
    recent_commits: recentCommits,
    is_dirty: isDirty,
  };
}

/**
 * @summary 層12: ディレクトリ構造を収集（要約）
 */
function collectStructureInfo(): StructureInfo {
  const cwd = process.cwd();

  // ルート直下のエントリ
  let rootEntries: string[] = [];
  try {
    rootEntries = readdirSync(cwd)
      .filter((name) => !name.startsWith("."))
      .slice(0, MAX_ENTRIES);
  } catch {
    rootEntries = [];
  }

  // README検出
  const readmeCandidates = ["README.md", "README.txt", "README"];
  const readme = readmeCandidates.find((name) => existsSync(join(cwd, name)));

  // 設定ファイル検出
  const configCandidates = [
    "package.json",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
    "tsconfig.json",
    "Makefile",
    "docker-compose.yml",
    "Dockerfile",
  ];
  const configFiles = configCandidates.filter((name) => existsSync(join(cwd, name)));

  // CI設定検出
  let ciConfig: string | undefined;
  if (existsSync(join(cwd, ".github", "workflows"))) {
    ciConfig = ".github/workflows/";
  } else if (existsSync(join(cwd, ".gitlab-ci.yml"))) {
    ciConfig = ".gitlab-ci.yml";
  } else if (existsSync(join(cwd, ".circleci"))) {
    ciConfig = ".circleci/";
  }

  return {
    root_entries: rootEntries,
    readme: readme,
    config_files: configFiles,
    ci_config: ciConfig,
  };
}

/**
 * @summary 層13: プロセス情報を収集（オンデマンド）
 */
export function collectProcessInfo(): ProcessInfo {
  const processes: Array<{ pid: number; name: string; command: string }> = [];

  // 開発関連プロセスを検出
  const devProcessOutput = safeExec(
    "ps aux | grep -E 'node|python|java|go|cargo|npm|yarn|pnpm' | grep -v grep | head -20",
    { timeout: LONG_TIMEOUT_MS }
  );

  for (const line of devProcessOutput.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 11) {
      const pid = Number.parseInt(parts[1], 10);
      const name = parts[10];
      const command = parts.slice(10).join(" ").slice(0, 100);
      processes.push({ pid, name, command });
    }
  }

  // 開発サーバー検出
  const devServers: string[] = [];
  if (devProcessOutput.includes("vite")) devServers.push("vite");
  if (devProcessOutput.includes("webpack")) devServers.push("webpack");
  if (devProcessOutput.includes("next-server")) devServers.push("next");
  if (devProcessOutput.includes("uvicorn")) devServers.push("uvicorn");
  if (devProcessOutput.includes("gunicorn")) devServers.push("gunicorn");
  if (devProcessOutput.includes("flask")) devServers.push("flask");

  return { processes, dev_servers: devServers };
}

/**
 * @summary 層14: Container/VM/CI Platform情報を収集
 */
function collectPlatformInfo(): PlatformInfo {
  return {
    is_docker: isDockerEnvironment(),
    is_wsl: isWslEnvironment(),
    is_kubernetes: isKubernetesEnvironment(),
    ci_platform: getCiPlatform(),
  };
}

/**
 * @summary 層15: セキュリティ制約を収集
 */
function collectSecurityInfo(): SecurityInfo {
  // ulimit
  const ulimitSoft = safeExec("ulimit -Sn 2>/dev/null || ulimit -n 2>/dev/null");
  const ulimitHard = safeExec("ulimit -Hn 2>/dev/null || ulimit -n 2>/dev/null");

  // SELinux
  let selinux: string | undefined;
  if (existsSync("/usr/sbin/getenforce")) {
    selinux = safeExec("getenforce 2>/dev/null");
  }

  // 読み取り専用マウント
  const readOnlyMounts: string[] = [];
  const mountOutput = safeExec("mount | grep 'ro,' | awk '{print $3}' | head -10");
  if (mountOutput) {
    readOnlyMounts.push(...mountOutput.split("\n").filter((m) => m.trim()));
  }

  return {
    ulimit_soft: ulimitSoft || "unknown",
    ulimit_hard: ulimitHard || "unknown",
    selinux: selinux || undefined,
    read_only_mounts: readOnlyMounts,
  };
}

/**
 * @summary 層16: Test/Build/Run エントリポイントを収集
 */
function collectEntryPointsInfo(): EntryPointsInfo {
  const cwd = process.cwd();
  let testCommand: string | undefined;
  let buildCommand: string | undefined;
  let runCommand: string | undefined;
  let detectedFrom = "none";

  // package.json から検出
  const packageJsonPath = join(cwd, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      const scripts = packageJson.scripts || {};
      testCommand = scripts.test;
      buildCommand = scripts.build;
      runCommand = scripts.start || scripts.dev;
      detectedFrom = "package.json#scripts";
    } catch {
      // ignore
    }
  }

  // pyproject.toml から検出
  if (!testCommand && existsSync(join(cwd, "pyproject.toml"))) {
    testCommand = "pytest";
    detectedFrom = "pyproject.toml (inferred)";
  }

  // Makefile から検出
  if (!testCommand && existsSync(join(cwd, "Makefile"))) {
    const makeContent = safeExec("cat Makefile | grep -E '^[a-z]+:' | head -5");
    if (makeContent.includes("test:")) {
      testCommand = "make test";
      detectedFrom = "Makefile";
    }
    if (makeContent.includes("build:")) {
      buildCommand = "make build";
    }
  }

  return {
    test_command: testCommand,
    build_command: buildCommand,
    run_command: runCommand,
    detected_from: detectedFrom,
  };
}

/**
 * @summary 層18: 失敗痕跡を検出（オンデマンド）
 */
export function collectFailureTraces(): FailureTracesInfo {
  const cwd = process.cwd();
  const signals: Array<{ type: string; path: string; timestamp?: string }> = [];

  for (const signalFile of FAILURE_SIGNAL_FILES) {
    const fullPath = join(cwd, signalFile);
    if (existsSync(fullPath)) {
      try {
        const stats = statSync(fullPath);
        signals.push({
          type: signalFile.includes("junit") || signalFile.includes("test-results") ? "test-failure" : "build-failure",
          path: signalFile,
          timestamp: stats.mtime.toISOString(),
        });
      } catch {
        signals.push({
          type: "unknown",
          path: signalFile,
        });
      }
    }
  }

  // 最新ログの末尾（存在する場合）
  let recentLogTail: string | undefined;
  const logCandidates = ["npm-debug.log", "yarn-error.log", "pnpm-debug.log"];
  for (const logFile of logCandidates) {
    const fullPath = join(cwd, logFile);
    if (existsSync(fullPath)) {
      try {
        const content = readFileSync(fullPath, "utf-8");
        const lines = content.split("\n").slice(-10);
        recentLogTail = lines.join("\n");
        break;
      } catch {
        // ignore
      }
    }
  }

  return {
    signals_detected: signals.length > 0,
    signals,
    recent_log_tail: recentLogTail,
  };
}

/**
 * @summary 層19: プロジェクト固有前提を収集
 */
function collectProjectContext(): ProjectContextInfo | undefined {
  const cwd = process.cwd();

  // 明示的な設定ファイルを探す
  const explicitPaths = [
    join(cwd, ".factory", "startup-context.json"),
    join(cwd, ".factory", "project-context.yaml"),
    join(cwd, ".pi", "startup-context.json"),
  ];

  for (const path of explicitPaths) {
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, "utf-8");
        if (path.endsWith(".json")) {
          const config = JSON.parse(content);
          return { ...config, source: "explicit" };
        }
        // YAML は簡易パース（完全なパーサーが必要な場合は別途実装）
        // ここでは JSON のみサポート
      } catch {
        // ignore
      }
    }
  }

  // 自動推論
  const inferred: ProjectContextInfo = { source: "inferred" };

  // モノレポ検出
  if (existsSync(join(cwd, "turbo.json")) || existsSync(join(cwd, "nx.json"))) {
    inferred.monorepo = true;
  }

  // パッケージマネージャ検出
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) {
    inferred.package_manager = "pnpm";
  } else if (existsSync(join(cwd, "yarn.lock"))) {
    inferred.package_manager = "yarn";
  } else if (existsSync(join(cwd, "package-lock.json"))) {
    inferred.package_manager = "npm";
  } else if (existsSync(join(cwd, "Cargo.lock"))) {
    inferred.package_manager = "cargo";
  } else if (existsSync(join(cwd, "go.sum"))) {
    inferred.package_manager = "go modules";
  }

  // コード生成検出
  if (existsSync(join(cwd, "graphql"))) {
    inferred.code_generation_required = true;
  }

  // DBマイグレーション検出
  if (
    existsSync(join(cwd, "migrations")) ||
    existsSync(join(cwd, "prisma", "migrations")) ||
    existsSync(join(cwd, "alembic"))
  ) {
    inferred.db_migration_required = true;
  }

  // 必須SDK検出
  const requiredSdks: string[] = [];
  if (existsSync(join(cwd, "android"))) requiredSdks.push("Android SDK");
  if (existsSync(join(cwd, "ios"))) requiredSdks.push("iOS SDK");
  if (existsSync(join(cwd, "CMakeLists.txt")) && contentIncludes(join(cwd, "CMakeLists.txt"), "cuda"))
    requiredSdks.push("CUDA");
  if (requiredSdks.length > 0) {
    inferred.required_sdks = requiredSdks;
  }

  return inferred;
}

/**
 * @summary ファイル内容に特定文字列が含まれるかチェック
 */
function contentIncludes(filePath: string, searchString: string): boolean {
  try {
    const content = readFileSync(filePath, "utf-8");
    return content.includes(searchString);
  } catch {
    return false;
  }
}

/**
 * @summary 層20: 収集ポリシーを生成
 */
function collectPolicyInfo(): CollectionPolicyInfo {
  return {
    session_start_layers: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 14, 15, 16, 19],
    user_prompt_layers: [2, 4, 5, 11],
    on_demand_layers: [7, 10, 13, 17, 18],
    mask_patterns: MASK_PATTERNS.map((p) => p.source),
    max_lines_per_section: {
      "git-status": 20,
      "git-log": 5,
      "directory": 20,
      "processes": 20,
    },
  };
}

// ============================================================================
// Main Collection Functions
// ============================================================================

/**
 * @summary SessionStart ベースラインコンテキストを収集
 * @returns SessionStartContext
 */
export function collectSessionStartContext(): SessionStartContext {
  return {
    metadata: createMetadata(SESSION_START_TTL_SECONDS),
    os: collectOsInfo(),
    user: collectUserInfo(),
    shell: collectShellInfo(),
    env: collectEnvInfo(),
    datetime: collectDateTimeInfo(),
    resources: collectResourceInfo(),
    runtimes: collectRuntimes(),
    tools: collectTools(),
    python: collectPythonInfo(),
    git: collectGitInfo(),
    structure: collectStructureInfo(),
    platform: collectPlatformInfo(),
    security: collectSecurityInfo(),
    entry_points: collectEntryPointsInfo(),
    project_context: collectProjectContext(),
    policy: collectPolicyInfo(),
  };
}

/**
 * @summary UserPromptSubmit 差分コンテキストを収集
 * @param previousContext 前回のコンテキスト
 * @returns UserPromptSubmitDelta
 */
export function collectUserPromptDelta(
  previousContext?: Partial<SessionStartContext>
): UserPromptSubmitDelta {
  const currentCwd = process.cwd();
  const currentGit = collectGitInfo();
  const currentEnv = collectEnvInfo();
  const currentDateTime = collectDateTimeInfo();

  const delta: UserPromptSubmitDelta = {
    metadata: {
      ...createMetadata(USER_PROMPT_TTL_SECONDS),
      session_elapsed_ms: previousContext?.metadata?.captured_at
        ? Date.now() - new Date(previousContext.metadata.captured_at).getTime()
        : 0,
    },
    datetime: currentDateTime,
  };

  // CWD 変更検出
  if (previousContext?.user?.cwd && previousContext.user.cwd !== currentCwd) {
    delta.cwd_changed = {
      from: previousContext.user.cwd,
      to: currentCwd,
    };
  }

  // 環境変数差分
  if (previousContext?.env) {
    const envDelta = detectEnvDelta(previousContext.env, currentEnv);
    if (envDelta) {
      delta.env_delta = envDelta;
    }
  }

  // Git 差分
  if (currentGit?.is_repo && previousContext?.git) {
    const gitDelta = detectGitDelta(previousContext.git, currentGit);
    if (gitDelta) {
      delta.git_delta = gitDelta;
    }
  }

  // 失敗シグナル検出
  const failureTraces = collectFailureTraces();
  if (failureTraces.signals_detected) {
    delta.failure_signals = {
      detected: true,
      signals: failureTraces.signals.map((s) => s.path),
    };
  }

  return delta;
}

/**
 * @summary 環境変数差分を検出
 */
function detectEnvDelta(
  previous: EnvInfo,
  current: EnvInfo
): UserPromptSubmitDelta["env_delta"] | null {
  const changed: Record<string, { old?: string; new: string }> = {};
  const added: string[] = [];
  const removed: string[] = [];

  // 前回の安全な変数との比較
  for (const [key, value] of Object.entries(current.safe_vars)) {
    if (previous.safe_vars[key] !== value) {
      if (previous.safe_vars[key]) {
        changed[key] = { old: previous.safe_vars[key], new: value };
      } else {
        added.push(key);
      }
    }
  }

  // 削除された変数
  for (const key of Object.keys(previous.safe_vars)) {
    if (!(key in current.safe_vars)) {
      removed.push(key);
    }
  }

  if (Object.keys(changed).length === 0 && added.length === 0 && removed.length === 0) {
    return null;
  }

  return { changed, added, removed };
}

/**
 * @summary Git 差分を検出
 */
function detectGitDelta(previous: GitInfo, current: GitInfo): UserPromptSubmitDelta["git_delta"] | null {
  if (!current.is_repo) return null;

  const delta: UserPromptSubmitDelta["git_delta"] = {
    dirty_state: {
      staged: 0,
      modified: 0,
      untracked: 0,
    },
    commits_since_last: 0,
  };

  // ブランチ変更
  if (previous.branch && current.branch && previous.branch !== current.branch) {
    delta.branch_changed = { from: previous.branch, to: current.branch };
  }

  // Dirty state 解析
  const statusMatch = current.status_summary.match(/staged:(\d+) modified:(\d+) untracked:(\d+)/);
  if (statusMatch) {
    delta.dirty_state = {
      staged: Number.parseInt(statusMatch[1], 10),
      modified: Number.parseInt(statusMatch[2], 10),
      untracked: Number.parseInt(statusMatch[3], 10),
    };
  }

  // コミット差分
  if (previous.recent_commits && current.recent_commits) {
    const prevFirst = previous.recent_commits[0]?.split(" ")[0];
    const currFirst = current.recent_commits[0]?.split(" ")[0];
    if (prevFirst && currFirst && prevFirst !== currFirst) {
      // 新しいコミット数を計算（簡易）
      delta.commits_since_last = current.recent_commits.findIndex(
        (c) => c.split(" ")[0] === prevFirst
      );
      if (delta.commits_since_last === -1) {
        delta.commits_since_last = current.recent_commits.length;
      }
    }
  }

  return delta;
}

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * @summary SessionStartContext をシェル形式でフォーマット
 */
export function formatSessionStartAsShell(context: SessionStartContext): string {
  const sections: ContextOutputSection[] = [];

  // 層1: OS/Kernel/Host
  sections.push({
    title: "1. OS/Kernel/Host",
    content: formatOsSection(context.os),
    metadata: context.metadata,
    truncation: { truncated: false, secrets_masked: false },
  });

  // 層2: User/Permissions
  sections.push({
    title: "2. User/Permissions",
    content: formatUserSection(context.user),
    metadata: context.metadata,
    truncation: { truncated: false, secrets_masked: false },
  });

  // 層3: Shell/Session
  sections.push({
    title: "3. Shell/Session",
    content: formatShellSection(context.shell),
    metadata: context.metadata,
    truncation: { truncated: false, secrets_masked: false },
  });

  // 層4: Environment Variables
  const envTruncation: SectionTruncationInfo = {
    truncated: context.env.masked_keys.length > 0,
    secrets_masked: context.env.masked_keys.length > 0,
    masked_count: context.env.masked_keys.length,
  };
  sections.push({
    title: "4. Environment Variables (sanitized)",
    content: formatEnvSection(context.env),
    metadata: context.metadata,
    truncation: envTruncation,
  });

  // 層5: Date/Time/Locale
  sections.push({
    title: "5. Date/Time/Locale",
    content: formatDateTimeSection(context.datetime),
    metadata: context.metadata,
    truncation: { truncated: false, secrets_masked: false },
  });

  // 層6: CPU/Memory/Disk
  sections.push({
    title: "6. CPU/Memory/Disk",
    content: formatResourceSection(context.resources),
    metadata: context.metadata,
    truncation: { truncated: false, secrets_masked: false },
  });

  // 層8: Available Runtimes
  sections.push({
    title: "8. Available Runtimes",
    content: formatRuntimesSection(context.runtimes),
    metadata: context.metadata,
    truncation: { truncated: context.runtimes.length > 5, max_lines: 10, secrets_masked: false },
  });

  // 層9: Package Managers/Build Tools
  sections.push({
    title: "9. Package Managers/Build Tools",
    content: formatToolsSection(context.tools),
    metadata: context.metadata,
    truncation: { truncated: context.tools.length > 10, max_lines: 15, secrets_masked: false },
  });

  // 層10a: Python Environment (conditional)
  if (context.python) {
    sections.push({
      title: "10. Python Environment",
      content: formatPythonSection(context.python),
      metadata: context.metadata,
      truncation: { truncated: false, secrets_masked: false },
    });
  }

  // 層11: Git Repository
  if (context.git) {
    const gitTruncation: SectionTruncationInfo = {
      truncated: context.git.recent_commits.length >= MAX_COMMITS,
      max_lines: MAX_COMMITS,
      secrets_masked: false,
    };
    sections.push({
      title: `11. Git Repository [captured_at=${context.metadata.captured_at}, ttl=${context.metadata.ttl_seconds}s]`,
      content: formatGitSection(context.git),
      metadata: context.metadata,
      truncation: gitTruncation,
    });
  }

  // 層12: Directory Structure
  const structTruncation: SectionTruncationInfo = {
    truncated: context.structure.root_entries.length >= MAX_ENTRIES,
    max_lines: MAX_ENTRIES,
    secrets_masked: false,
  };
  sections.push({
    title: "12. Directory Structure",
    content: formatStructureSection(context.structure),
    metadata: context.metadata,
    truncation: structTruncation,
  });

  // 層14: Container/VM/CI Platform
  sections.push({
    title: "14. Container/VM/CI Platform",
    content: formatPlatformSection(context.platform),
    metadata: context.metadata,
    truncation: { truncated: false, secrets_masked: false },
  });

  // 層15: Security Constraints
  sections.push({
    title: "15. Security Constraints",
    content: formatSecuritySection(context.security),
    metadata: context.metadata,
    truncation: { truncated: false, secrets_masked: false },
  });

  // 層16: Test/Build/Run Entry Points
  sections.push({
    title: "16. Test/Build/Run Entry Points",
    content: formatEntryPointsSection(context.entry_points),
    metadata: context.metadata,
    truncation: { truncated: false, secrets_masked: false },
  });

  // 層19: Project-Specific Assumptions
  if (context.project_context) {
    sections.push({
      title: "19. Project-Specific Assumptions",
      content: formatProjectContextSection(context.project_context),
      metadata: context.metadata,
      truncation: { truncated: false, secrets_masked: false },
    });
  }

  // 層20: Collection Policy
  sections.push({
    title: "20. Collection Policy",
    content: formatPolicySection(context.policy),
    metadata: context.metadata,
    truncation: { truncated: false, secrets_masked: false },
  });

  return renderSections(sections);
}

/**
 * @summary セクション配列をレンダリング
 */
function renderSections(sections: ContextOutputSection[]): string {
  const header = `# Session Startup Context

> captured_at: ${sections[0]?.metadata.captured_at || "unknown"} | ttl: ${sections[0]?.metadata.ttl_seconds || 0}s

This context is automatically injected at session start to help you understand
the project's current state, recent changes, and overall structure.

Each section shows the shell commands you would run to get this information.
This prevents redundant execution of similar commands during the session.

---`;

  const body = sections
    .map((section) => {
      const truncationNote = formatTruncationNote(section.truncation);
      return `## ${section.title}
\`\`\`bash
${section.content}
\`\`\`
${truncationNote}`;
    })
    .join("\n\n");

  return `${header}\n\n${body}\n\n---\n_End of startup context._`;
}

/**
 * @summary 省略ノートをフォーマット
 */
function formatTruncationNote(truncation: SectionTruncationInfo): string {
  const notes: string[] = [];

  if (truncation.truncated && truncation.max_lines) {
    notes.push(`truncated after ${truncation.max_lines} lines`);
  }
  if (truncation.secrets_masked) {
    if (truncation.masked_count) {
      notes.push(`${truncation.masked_count} secrets redacted`);
    } else {
      notes.push("secrets redacted");
    }
  }

  if (notes.length === 0) {
    return "> truncation: none | secrets: none";
  }

  return `> ${notes.join(" | ")}`;
}

// ============================================================================
// Section Formatters
// ============================================================================

function formatOsSection(os: OsInfo): string {
  let content = `$ uname -a\n${os.uname}\n`;
  if (os.distro) {
    content += `\n$ sw_vers 2>/dev/null || cat /etc/os-release 2>/dev/null | head -5\n${os.distro}`;
  }
  return content;
}

function formatUserSection(user: UserInfo): string {
  return `$ whoami && id && groups
${user.whoami}
${user.uid_gid}
${user.groups}

$ pwd
${user.cwd}`;
}

function formatShellSection(shell: ShellInfo): string {
  return `$ echo "SHELL=$SHELL TERM=$TERM"
SHELL=${shell.shell} TERM=${shell.term}

$ ps -p $PPID -o comm=
${shell.parent_process}

# Interactive: ${shell.is_interactive} | CI: ${shell.is_ci}`;
}

function formatEnvSection(env: EnvInfo): string {
  let content = `$ echo "PATH=${env.path_summary.split(":")[0]}:..."  # first entry only
PATH=${env.path_summary}

$ echo "HOME=$HOME SHELL=$SHELL LANG=$LANG"
HOME=${env.home} SHELL=${env.shell} LANG=${env.lang}`;

  if (env.masked_keys.length > 0) {
    content += `\n\n# Masked variables (keys only): ${env.masked_keys.join(", ")}`;
  }

  return content;
}

function formatDateTimeSection(datetime: DateTimeInfo): string {
  return `$ date
${datetime.now}

$ timedatectl show 2>/dev/null | head -3 || echo "timezone: ${datetime.timezone}"
Timezone=${datetime.timezone}
Locale=${datetime.locale}`;
}

function formatResourceSection(resources: ResourceInfo): string {
  const cpuCoreCountCommand = getCpuCoreCountCommand();

  return `$ ${cpuCoreCountCommand}
${resources.cpu_cores}

$ free -h 2>/dev/null || vm_stat
Total: ${resources.memory_total}
Available: ${resources.memory_available}

$ df -h / "${resources.disk_project.path}"
/: ${resources.disk_root.used_percent}% used
Project: ${resources.disk_project.used_percent}% used`;
}

function formatRuntimesSection(runtimes: RuntimeInfo[]): string {
  if (runtimes.length === 0) {
    return "# No runtimes detected";
  }

  const lines = runtimes.map((r) => `# ${r.name}: ${r.version}\n#   path: ${r.path}`);
  return lines.join("\n");
}

function formatToolsSection(tools: ToolInfo[]): string {
  const available = tools.filter((t) => t.available);
  const unavailable = tools.filter((t) => !t.available);

  let content = "# Available:\n";
  content += available.map((t) => `# ${t.name}: ${t.version}`).join("\n");

  if (unavailable.length > 0) {
    content += `\n\n# Not available:\n`;
    content += unavailable.map((t) => `# ${t.name}`).join(", ");
  }

  return content;
}

function formatPythonSection(python: PythonInfo): string {
  let content = `$ which python3 && python3 --version
${python.executable}
${python.version}

# venv active: ${python.venv_active}`;
  if (python.venv_path) {
    content += ` (${python.venv_path})`;
  }
  content += `\n# pyproject.toml: ${python.has_pyproject} | requirements.txt: ${python.has_requirements}`;
  return content;
}

function formatGitSection(git: GitInfo): string {
  if (!git.is_repo) {
    return "# Not a git repository";
  }

  let content = `$ git rev-parse --show-toplevel && git branch --show-current
${git.root}
${git.branch}`;

  if (git.remote) {
    content += `\n\n$ git remote get-url origin
${git.remote}`;
  }

  content += `\n\n$ git status --short | head -20
${git.recent_commits.length > 0 ? "(status output)" : "clean"}`;

  content += `\n\n$ git log -5 --oneline --no-merges
${git.recent_commits.join("\n") || "(no commits)"}`;

  content += `\n\n# dirty: ${git.is_dirty} | ${git.status_summary}`;
  return content;
}

function formatStructureSection(structure: StructureInfo): string {
  let content = `$ ls -1 | head -20
${structure.root_entries.join("\n")}`;

  if (structure.config_files.length > 0) {
    content += `\n\n# Detected config files: ${structure.config_files.join(", ")}`;
  }

  if (structure.ci_config) {
    content += `\n# Detected CI: ${structure.ci_config}`;
  }

  if (structure.readme) {
    content += `\n# README: ${structure.readme}`;
  }

  return content;
}

function formatPlatformSection(platform: PlatformInfo): string {
  const flags: string[] = [];
  if (platform.is_docker) flags.push("Docker");
  if (platform.is_wsl) flags.push("WSL");
  if (platform.is_kubernetes) flags.push("Kubernetes");

  let content = `# Docker: ${platform.is_docker} | WSL: ${platform.is_wsl} | K8s: ${platform.is_kubernetes}`;
  if (platform.ci_platform) {
    content += `\n# CI Platform: ${platform.ci_platform}`;
  }

  if (flags.length > 0) {
    content += `\n# Detected: ${flags.join(", ")}`;
  }

  return content;
}

function formatSecuritySection(security: SecurityInfo): string {
  let content = `$ ulimit -Sn && ulimit -Hn
${security.ulimit_soft} (soft)
${security.ulimit_hard} (hard)`;

  if (security.selinux) {
    content += `\n\n# SELinux: ${security.selinux}`;
  }

  if (security.read_only_mounts.length > 0) {
    content += `\n\n# Read-only mounts:\n# ${security.read_only_mounts.join("\n# ")}`;
  }

  return content;
}

function formatEntryPointsSection(entryPoints: EntryPointsInfo): string {
  let content = `# Detected from: ${entryPoints.detected_from}\n`;

  if (entryPoints.test_command) {
    content += `# Test: ${entryPoints.test_command}\n`;
  }
  if (entryPoints.build_command) {
    content += `# Build: ${entryPoints.build_command}\n`;
  }
  if (entryPoints.run_command) {
    content += `# Run: ${entryPoints.run_command}\n`;
  }

  if (!entryPoints.test_command && !entryPoints.build_command && !entryPoints.run_command) {
    content += "# No entry points detected\n";
  }

  return content.trim();
}

function formatProjectContextSection(context: ProjectContextInfo): string {
  const lines: string[] = [`# Source: ${context.source}`];

  if (context.monorepo !== undefined) {
    lines.push(`# Monorepo: ${context.monorepo}`);
  }
  if (context.package_manager) {
    lines.push(`# Package Manager: ${context.package_manager}`);
  }
  if (context.code_generation_required !== undefined) {
    lines.push(`# Code Generation Required: ${context.code_generation_required}`);
  }
  if (context.db_migration_required !== undefined) {
    lines.push(`# DB Migration Required: ${context.db_migration_required}`);
  }
  if (context.required_sdks && context.required_sdks.length > 0) {
    lines.push(`# Required SDKs: ${context.required_sdks.join(", ")}`);
  }
  if (context.custom_notes && context.custom_notes.length > 0) {
    lines.push(`# Notes:`);
    context.custom_notes.forEach((note) => lines.push(`#   - ${note}`));
  }

  return lines.join("\n");
}

function formatPolicySection(policy: CollectionPolicyInfo): string {
  return `# SessionStart layers: ${policy.session_start_layers.join(", ")}
# UserPromptSubmit layers: ${policy.user_prompt_layers.join(", ")}
# On-Demand layers: ${policy.on_demand_layers.join(", ")}

# Mask patterns: ${policy.mask_patterns.slice(0, 5).join(", ")}...
# Max lines per section: ${JSON.stringify(policy.max_lines_per_section)}`;
}

/**
 * @summary UserPromptSubmitDelta をシェル形式でフォーマット
 */
export function formatDeltaAsShell(delta: UserPromptSubmitDelta): string {
  const lines: string[] = [];

  lines.push(`# Context Delta [elapsed: ${delta.metadata.session_elapsed_ms || 0}ms, ttl: ${delta.metadata.ttl_seconds}s]`);

  if (delta.cwd_changed) {
    lines.push(`\n## CWD Changed`);
    lines.push(`$ pwd`);
    lines.push(`${delta.cwd_changed.to}`);
    lines.push(`# Previous: ${delta.cwd_changed.from}`);
  }

  if (delta.env_delta) {
    lines.push(`\n## Environment Delta`);
    if (Object.keys(delta.env_delta.changed).length > 0) {
      lines.push(`# Changed:`);
      for (const [key, val] of Object.entries(delta.env_delta.changed)) {
        lines.push(`#   ${key}: ${val.old || "(unset)"} -> ${val.new}`);
      }
    }
    if (delta.env_delta.added.length > 0) {
      lines.push(`# Added: ${delta.env_delta.added.join(", ")}`);
    }
    if (delta.env_delta.removed.length > 0) {
      lines.push(`# Removed: ${delta.env_delta.removed.join(", ")}`);
    }
  }

  lines.push(`\n## Current Time`);
  lines.push(`$ date`);
  lines.push(delta.datetime.now);

  if (delta.git_delta) {
    lines.push(`\n## Git Delta`);
    if (delta.git_delta.branch_changed) {
      lines.push(`# Branch: ${delta.git_delta.branch_changed.from} -> ${delta.git_delta.branch_changed.to}`);
    }
    lines.push(
      `# Dirty state: staged=${delta.git_delta.dirty_state.staged}, modified=${delta.git_delta.dirty_state.modified}, untracked=${delta.git_delta.dirty_state.untracked}`
    );
    if (delta.git_delta.commits_since_last > 0) {
      lines.push(`# New commits: ${delta.git_delta.commits_since_last}`);
    }
  }

  if (delta.failure_signals?.detected) {
    lines.push(`\n## Failure Signals Detected`);
    lines.push(`# Signals: ${delta.failure_signals.signals.join(", ")}`);
    lines.push(`# Consider running on-demand failure trace collection`);
  }

  return lines.join("\n");
}

// ============================================================================
// Re-export Types
// ============================================================================

export type {
  SessionStartContext,
  UserPromptSubmitDelta,
  OnDemandContext,
  ContextMetadata,
  OsInfo,
  UserInfo,
  ShellInfo,
  EnvInfo,
  DateTimeInfo,
  ResourceInfo,
  RuntimeInfo,
  ToolInfo,
  PythonInfo,
  GitInfo,
  StructureInfo,
  PlatformInfo,
  SecurityInfo,
  EntryPointsInfo,
  ProjectContextInfo,
  CollectionPolicyInfo,
  NetworkInfo,
  ProcessInfo,
  FailureTracesInfo,
} from "./startup-context-types.js";
