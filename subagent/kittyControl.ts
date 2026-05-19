import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentDisplayRef } from "./types.js";

const execFile = promisify(execFileCb);

export interface LaunchLogWindowParams {
  agentId: string;
  agentPath: string;
  cwd: string;
  logPath: string;
  title?: string;
}

export interface LaunchPiWindowParams {
  agentId: string;
  agentPath: string;
  cwd: string;
  socketPath: string;
  initialMessage: string;
  logPath?: string;
  title?: string;
  piCommand?: string;
  extensionPath?: string;
  splitDirection?: "vertical" | "horizontal";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export class KittyController {
  constructor(private readonly kittenBin = "kitten") {}

  async launchLogWindow(params: LaunchLogWindowParams): Promise<AgentDisplayRef> {
    await mkdir(path.dirname(params.logPath), { recursive: true });
    await writeFile(params.logPath, "", { flag: "a" });
    const title = params.title ?? `pi subagent ${params.agentPath}`;
    const script = [
      'logPath="$1"',
      'agentPath="$2"',
      'printf "== pi subagent log: %s ==\\n" "$agentPath"',
      'tail -n +1 -f "$logPath"',
      'exec "${SHELL:-sh}" -l',
    ].join("; ");
    const { stdout } = await execFile(this.kittenBin, [
      "@", "launch",
      "--type=os-window",
      "--cwd", params.cwd,
      "--title", title,
      "--os-window-title", title,
      "--var", `PI_SUBAGENT_ID=${params.agentId}`,
      "--var", `PI_SUBAGENT_PATH=${params.agentPath}`,
      "--copy-env",
      "--allow-remote-control",
      "sh", "-lc", script, "sh", params.logPath, params.agentPath,
    ]);
    const windowId = stdout.trim() || undefined;
    return { kind: "kitty-log", status: "open", windowId, agentId: params.agentId, title, cwd: params.cwd, logPath: params.logPath };
  }

  private buildChildScript(params: LaunchPiWindowParams): string {
    const piCommand = (params.piCommand ?? "pi").trim() || "pi";
    const extensionArgs = params.extensionPath ? ` -e ${shellQuote(params.extensionPath)}` : "";
    const logPath = params.logPath;
    const logFn = logPath ? `log(){ printf '%s\\n' "$*" >> ${shellQuote(logPath)}; }` : `log(){ :; }`;
    return [
      logFn,
      `log ${shellQuote(`[launch] ${new Date().toISOString()} agent=${params.agentId} path=${params.agentPath}`)}`,
      `export PI_SUBAGENT_ROLE=child`,
      `export PI_SUBAGENT_ID=${shellQuote(params.agentId)}`,
      `export PI_SUBAGENT_PATH=${shellQuote(params.agentPath)}`,
      `export PI_SUBAGENT_PARENT_SOCKET=${shellQuote(params.socketPath)}`,
      `export PI_SUBAGENT_INITIAL_MESSAGE=${shellQuote(params.initialMessage)}`,
      `export PATH=${shellQuote(path.dirname(process.execPath))}:$PATH`,
      `log ${shellQuote("[launch] node: ")}$(command -v node) $(node -v 2>/dev/null || true)`,
      `log ${shellQuote("[launch] command: " + piCommand + extensionArgs)}`,
      `${piCommand}${extensionArgs}`,
      `rc=$?`,
      `log "[exit] pi exited with code $rc"`,
      `printf '\\n[pi subagent exited with code %s — press Ctrl-D or close this window]\\n' "$rc"`,
      'exec "${SHELL:-sh}" -l',
    ].join("; ");
  }

  async launchPiWindow(params: LaunchPiWindowParams): Promise<AgentDisplayRef> {
    const title = params.title ?? `pi subagent ${params.agentPath}`;
    const logPath = params.logPath;
    if (logPath) {
      await mkdir(path.dirname(logPath), { recursive: true });
      await writeFile(logPath, "", { flag: "a" });
    }
    const script = this.buildChildScript(params);
    const { stdout } = await execFile(this.kittenBin, [
      "@", "launch",
      "--type=os-window",
      "--cwd", params.cwd,
      "--title", title,
      "--os-window-title", title,
      "--var", `PI_SUBAGENT_ID=${params.agentId}`,
      "--var", `PI_SUBAGENT_PATH=${params.agentPath}`,
      "--copy-env",
      "--allow-remote-control",
      "sh", "-lc", script,
    ]);
    const windowId = stdout.trim() || undefined;
    return { kind: "kitty-pi", status: "open", windowId, agentId: params.agentId, title, cwd: params.cwd, socketPath: params.socketPath, logPath };
  }

  async launchPiSplit(params: LaunchPiWindowParams): Promise<AgentDisplayRef> {
    const title = params.title ?? `pi subagent ${params.agentPath}`;
    const logPath = params.logPath;
    if (logPath) {
      await mkdir(path.dirname(logPath), { recursive: true });
      await writeFile(logPath, "", { flag: "a" });
    }
    const script = this.buildChildScript(params);
    const splitLocation = params.splitDirection === "horizontal" ? "vsplit" : "hsplit";
    const { stdout } = await execFile(this.kittenBin, [
      "@", "launch",
      "--type=window",
      "--location", splitLocation,
      "--cwd", params.cwd,
      "--title", title,
      "--var", `PI_SUBAGENT_ID=${params.agentId}`,
      "--var", `PI_SUBAGENT_PATH=${params.agentPath}`,
      "--copy-env",
      "--allow-remote-control",
      "sh", "-lc", script,
    ]);
    const windowId = stdout.trim() || undefined;
    return { kind: "kitty-split", status: "open", windowId, agentId: params.agentId, title, cwd: params.cwd, socketPath: params.socketPath, logPath };
  }

  async appendLog(display: AgentDisplayRef, line: string): Promise<void> {
    if (!display.logPath) return;
    await mkdir(path.dirname(display.logPath), { recursive: true });
    await appendFile(display.logPath, line.endsWith("\n") ? line : `${line}\n`, "utf8");
  }

  async focus(display: AgentDisplayRef): Promise<void> {
    await execFile(this.kittenBin, ["@", "focus-window", "--match", this.match(display)]);
  }

  async close(display: AgentDisplayRef): Promise<void> {
    await execFile(this.kittenBin, ["@", "close-window", "--match", this.match(display)]);
  }

  async setTitle(display: AgentDisplayRef, title: string): Promise<void> {
    await execFile(this.kittenBin, ["@", "set-window-title", "--match", this.match(display), title]);
  }

  private match(display: AgentDisplayRef): string {
    if (display.windowId) return `id:${display.windowId}`;
    return `var:PI_SUBAGENT_ID=${display.agentId ?? ""}`;
  }
}
