import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, appendFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentDisplayRef } from "./types.js";
import { KittyControl } from "../../utils/terminal/kitty/index.js";

const execFile = promisify(execFileCb);

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
  modelId?: string;
  thinkingLevel?: string;
  nonce?: string;
  /** PI_SUBAGENT_ROLE value. Defaults to "child" for subagents. */
  subagentRole?: string;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export class KittyController {
  private readonly kitty: KittyControl;

  /** Max initialMessage size before writing to a temp file instead of env var. */
  static readonly ENV_VAR_MSG_LIMIT = 32_000;

  constructor(private readonly kittenBin = "kitten") {
    this.kitty = new KittyControl(kittenBin);
  }

  private buildChildScript(params: LaunchPiWindowParams): string {
    const piCommand = (params.piCommand ?? "pi").trim() || "pi";
    const extensionArgs = params.extensionPath ? ` -e ${shellQuote(params.extensionPath)}` : "";
    const subModeArgs = " --sub";
    const modelArgs = params.modelId ? ` --model ${shellQuote(params.modelId)}` : "";
    const thinkingArgs = params.thinkingLevel ? ` --thinking ${shellQuote(params.thinkingLevel)}` : "";
    const logPath = params.logPath;
    const logFn = logPath ? `log(){ printf '%s\\n' "$*" >> ${shellQuote(logPath)}; }` : `log(){ :; }`;
    const command = `${piCommand}${extensionArgs}${subModeArgs}${modelArgs}${thinkingArgs}`;
    const role = params.subagentRole ?? "child";

    // Keep the child Pi attached directly to the kitty TTY. Piping through tee
    // makes stdout non-TTY, which breaks Pi's interactive TUI rendering/input.
    // Log structured lifecycle lines via log()/IPC instead of capturing raw TUI.
    const runCommand = `${command}; rc=$?`;
    return [
      logFn,
      `log ${shellQuote(`[launch] ${new Date().toISOString()} agent=${params.agentId} path=${params.agentPath} role=${role}`)}`,
      `export PI_SUBAGENT_ROLE=${shellQuote(role)}`,
      `export PI_SUBAGENT_ID=${shellQuote(params.agentId)}`,
      `export PI_SUBAGENT_PATH=${shellQuote(params.agentPath)}`,
      `export PI_SUBAGENT_PARENT_SOCKET=${shellQuote(params.socketPath)}`,
      // initialMessage exported inline — will be overwritten below if too large
      `export PI_SUBAGENT_INITIAL_MESSAGE=${shellQuote(params.initialMessage)}`,
      ...(params.nonce ? [`export PI_SUBAGENT_NONCE=${shellQuote(params.nonce)}`] : []),
      ...(params.modelId ? [`export PI_SUBAGENT_MODEL=${shellQuote(params.modelId)}`] : []),
      ...(params.thinkingLevel ? [`export PI_SUBAGENT_THINKING=${shellQuote(params.thinkingLevel)}`] : []),
      `export PATH=${shellQuote(path.dirname(process.execPath))}:$PATH`,
      `log ${shellQuote("[launch] node: ")}$(command -v node) $(node -v 2>/dev/null || true)`,
      `log ${shellQuote("[launch] command: " + command)}`,
      runCommand,
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
    const { script, cleanup } = await this.prepareScript(params);
    try {
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
    } finally {
      cleanup();
    }
  }

  async launchPiSplit(params: LaunchPiWindowParams): Promise<AgentDisplayRef> {
    const title = params.title ?? `pi subagent ${params.agentPath}`;
    const logPath = params.logPath;
    if (logPath) {
      await mkdir(path.dirname(logPath), { recursive: true });
      await writeFile(logPath, "", { flag: "a" });
    }
    const { script, cleanup } = await this.prepareScript(params);
    const location = params.splitDirection
      ? params.splitDirection === "horizontal" ? "vsplit" : "hsplit"
      : await this.kitty.longerSideSplitLocation();
    try {
      const { windowId } = await this.kitty.launchWindow({
        cwd: params.cwd,
        location,
        title,
        vars: {
          PI_SUBAGENT_ID: params.agentId,
          PI_SUBAGENT_PATH: params.agentPath,
        },
        copyEnv: true,
        allowRemoteControl: true,
        matchCurrentWindow: true,
        argv: ["sh", "-lc", script],
      });
      return { kind: "kitty-split", status: "open", windowId, agentId: params.agentId, title, cwd: params.cwd, socketPath: params.socketPath, logPath };
    } finally {
      cleanup();
    }
  }

  /**
   * Prepare the launch script, writing large initial messages to a temp file
   * to avoid exceeding shell/env-var size limits.
   */
  private async prepareScript(params: LaunchPiWindowParams): Promise<{ script: string; cleanup: () => void }> {
    const cleanup = () => {};

    if (params.initialMessage.length > KittyController.ENV_VAR_MSG_LIMIT) {
      // Write the message to a temp file, then have the child script read it.
      const msgFile = path.join(os.tmpdir(), `pi-msg-${params.agentId}.txt`);
      await writeFile(msgFile, params.initialMessage, "utf-8");
      const patchedParams = {
        ...params,
        // Replace the huge inline message with a small marker; the script
        // below points the child at the temp file instead.
        initialMessage: `__FILE__:${msgFile}`,
      };
      const baseScript = this.buildChildScript(patchedParams);
      // Do not cat the file back into an env var here: that reintroduces
      // environment-size risk at exec time. Child mode reads this file directly.
      const script = baseScript.replace(
        `export PI_SUBAGENT_INITIAL_MESSAGE='__FILE__:${msgFile}'`,
        `export PI_SUBAGENT_INITIAL_MESSAGE_FILE=${shellQuote(msgFile)}`,
      );
      return { script, cleanup };
    }

    return { script: this.buildChildScript(params), cleanup };
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
