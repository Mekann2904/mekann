import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, appendFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentDisplayRef, SplitAnchorPolicy } from "./types.js";
import { KittyControl, type IssuePaneSplit, type KittySplitLocation } from "../../utils/terminal/kitty/index.js";

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
  /** @deprecated retained for backward compatibility; ignored when an anchor
   * resolves via {@link anchorPolicy}. Prefer `anchorPolicy`. */
  splitDirection?: "vertical" | "horizontal";
  /** Where to anchor the split (ADR-0021 extension). Defaults to `nonMain`. */
  anchorPolicy?: SplitAnchorPolicy;
  modelId?: string;
  thinkingLevel?: string;
  nonce?: string;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export class KittyController {
  private readonly kitty: KittyControl;

  constructor(private readonly kittenBin = "kitten") {
    this.kitty = new KittyControl(kittenBin);
  }

  private buildChildScript(params: LaunchPiWindowParams & { initialMessagePath?: string }): string {
    const piCommand = (params.piCommand ?? "pi").trim() || "pi";
    const extensionArgs = params.extensionPath ? ` -e ${shellQuote(params.extensionPath)}` : "";
    const subModeArgs = " --sub";
    const modelArgs = params.modelId ? ` --model ${shellQuote(params.modelId)}` : "";
    const thinkingArgs = params.thinkingLevel ? ` --thinking ${shellQuote(params.thinkingLevel)}` : "";
    const initialPromptArg = params.initialMessagePath ? ` ${shellQuote(`@${params.initialMessagePath}`)}` : "";
    const logPath = params.logPath;
    const logFn = logPath ? `log(){ printf '%s\\n' "$*" >> ${shellQuote(logPath)}; }` : `log(){ :; }`;
    const command = `${piCommand}${extensionArgs}${subModeArgs}${modelArgs}${thinkingArgs}${initialPromptArg}`;
    // Keep the child Pi attached directly to the kitty TTY. Piping stdout
    // through tee makes stdout non-TTY, which breaks Pi's interactive TUI
    // rendering/input. stdout therefore stays on the TTY. stderr, however, is
    // redirected to the log when available so boot/IPC errors (e.g.
    // "subagent child IPC error: connect ENOENT") are recoverable post-mortem —
    // they otherwise only hit the kitty TTY and vanish when the window closes,
    // which is exactly why the review_fixer 3x-failure was un-diagnosable from
    // the log alone. stderr is not used for TUI rendering, so this does not
    // affect the child Pi's interactive display.
    const runCommand = logPath ? `${command} 2>> ${shellQuote(logPath)}; rc=$?` : `${command}; rc=$?`;
    return [
      logFn,
      `log ${shellQuote(`[launch] ${new Date().toISOString()} agent=${params.agentId} path=${params.agentPath}`)}`,
      `export PI_SUBAGENT_ROLE=child`,
      `export PI_SUBAGENT_ID=${shellQuote(params.agentId)}`,
      `export PI_SUBAGENT_PATH=${shellQuote(params.agentPath)}`,
      `export PI_SUBAGENT_PARENT_SOCKET=${shellQuote(params.socketPath)}`,
      `export PI_SUBAGENT_INITIAL_MESSAGE=${shellQuote(params.initialMessagePath ? "" : params.initialMessage)}`,
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

  private async prepareLaunchFiles(params: LaunchPiWindowParams): Promise<LaunchPiWindowParams & { initialMessagePath?: string }> {
    const logPath = params.logPath;
    if (logPath) {
      await mkdir(path.dirname(logPath), { recursive: true });
      await writeFile(logPath, "", { flag: "a" });
    }
    if (!params.initialMessage) return params;
    const initialMessagePath = logPath
      ? path.join(path.dirname(logPath), `${path.basename(logPath, path.extname(logPath))}.prompt.md`)
      : path.join(os.tmpdir(), `pi-subagent-${params.agentId}.prompt.md`);
    await mkdir(path.dirname(initialMessagePath), { recursive: true });
    await writeFile(initialMessagePath, params.initialMessage, "utf8");
    return { ...params, initialMessagePath };
  }

  async launchPiWindow(params: LaunchPiWindowParams): Promise<AgentDisplayRef> {
    const title = params.title ?? `pi subagent ${params.agentPath}`;
    const prepared = await this.prepareLaunchFiles(params);
    const logPath = params.logPath;
    const script = this.buildChildScript(prepared);
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
    const prepared = await this.prepareLaunchFiles(params);
    const logPath = params.logPath;
    const script = this.buildChildScript(prepared);

    // ADR-0021 extension: anchor the split to a chosen non-Main pane (or the
    // parent Issue Pi for review-fixer) so the child opens next to it instead
    // of re-splitting the focused window (Main Pi). Falls back to the focused
    // window when no anchor resolves (first split only — see ADR-0021).
    const anchor = await this.resolveSplitAnchor(params.anchorPolicy);
    const location: KittySplitLocation = anchor?.location
      ?? (params.splitDirection
        ? (params.splitDirection === "horizontal" ? "vsplit" : "hsplit")
        : await this.kitty.longerSideSplitLocation());

    const { windowId } = await this.kitty.launchWindow({
      cwd: params.cwd,
      location,
      title,
      vars: {
        PI_SUBAGENT_ID: params.agentId,
        PI_SUBAGENT_PATH: params.agentPath,
      },
      // --env (not --var) is the reliable `kitty @ ls` identification signal,
      // so other splits can recognise this pane as a non-Main anchor candidate.
      env: {
        PI_SUBAGENT_ID: params.agentId,
        PI_SUBAGENT_PATH: params.agentPath,
      },
      copyEnv: true,
      allowRemoteControl: true,
      sourceWindowId: anchor?.windowId,
      matchCurrentWindow: true,
      argv: ["sh", "-lc", script],
    });
    return { kind: "kitty-split", status: "open", windowId, agentId: params.agentId, title, cwd: params.cwd, socketPath: params.socketPath, logPath };
  }

  /** Resolve the split anchor for {@link launchPiSplit} (ADR-0021 extension).
   *
   * review-fixer anchors to its own Issue Pi pane (per-issue); everything else
   * (including the default) anchors to the largest non-Main pane so generic
   * subagents group together. Returns `undefined` when no candidate pane exists
   * yet, in which case `launchPiSplit` falls back to the focused window. */
  private async resolveSplitAnchor(policy?: SplitAnchorPolicy): Promise<IssuePaneSplit | undefined> {
    if (policy?.kind === "issue") {
      return this.kitty.findIssuePiPaneSplitForIssue(policy.issueNumber);
    }
    return this.kitty.findNonMainPaneSplit();
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
