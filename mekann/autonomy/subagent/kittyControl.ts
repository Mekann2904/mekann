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

/**
 * Content-free wrapper run by `sh -c` in the child pane. It contains NO user
 * content — only static shell plus double-quoted expansions of `PI_SUBAGENT_*`
 * env vars (which kitty sets via `--env`, so they are never shell-parsed) and
 * `"$@"` (the forwarded pi argv). Keeping boot/IPC stderr capture in a wrapper
 * is what made review_fixer's 3x-failure diagnosable; making the wrapper
 * content-free removes the shell-string-injection vector that pi-session.ts
 * already abandoned (backticks / `$` / quotes in a system prompt, model id, or
 * message can no longer be re-parsed by a shell because they never appear in
 * the script body — they are separate argv tokens forwarded by `"$@"`).
 *
 * Layout: a no-op-when-unset log helper, the launch log line (incl. the pi
 * command via `$*`), the forwarded pi argv with stderr appended to the log (or
 * /dev/null), then the exit log line. Window persistence is handled by kitty
 * `--hold` (no `exec "$SHELL"` residual — IC-112; no manual PATH override —
 * IC-111, `--copy-env` propagates the launcher's PATH).
 */
const CHILD_WRAPPER =
  "pi_sub_log(){ [ -n \"${PI_SUBAGENT_LOG:-}\" ] && printf '%s\\n' \"$*\" >> \"${PI_SUBAGENT_LOG:-/dev/null}\" 2>/dev/null; }; " +
  "pi_sub_log \"[launch] $(date -u +%FT%TZ) agent=${PI_SUBAGENT_ID:-} path=${PI_SUBAGENT_PATH:-} cmd=$*\"; " +
  "\"$@\" 2>> \"${PI_SUBAGENT_LOG:-/dev/null}\"; rc=$?; " +
  "pi_sub_log \"[exit] pi exited with code $rc\"";

export class KittyController {
  private readonly kitty: KittyControl;

  constructor(private readonly kittenBin = "kitten") {
    this.kitty = new KittyControl(kittenBin);
  }

  /**
   * Build the child pane's argv + env without inlining any user content.
   *
   * Mirrors `launchPiSessionInKittySplit` (terminal/pi-session.ts): every pi
   * option (--model, --thinking, -e, @file) is a separate argv token, and every
   * `PI_SUBAGENT_*` marker is passed via kitty `--env`. `kitten @ launch` execs
   * the trailing argv directly in the new pane, so content tokens are never
   * re-parsed by a shell. The trailing argv is `sh -c <CHILD_WRAPPER> pi-subagent
   * <pi tokens>`; the wrapper forwards `<pi tokens>` via `"$@"` and is itself
   * content-free (see {@link CHILD_WRAPPER}).
   */
  private buildChildTokens(params: LaunchPiWindowParams & { initialMessagePath?: string }): { env: Record<string, string>; argv: string[] } {
    const piCommand = (params.piCommand ?? "pi").trim() || "pi";
    const piArgv = [piCommand, "--sub"];
    if (params.extensionPath) piArgv.push("-e", params.extensionPath);
    if (params.modelId) piArgv.push("--model", params.modelId);
    if (params.thinkingLevel) piArgv.push("--thinking", params.thinkingLevel);
    // The initial prompt is always delivered as a pi @file positional (written
    // by prepareLaunchFiles), never via a shell env export, so backticks / `$` /
    // quotes in the message can never be shell-parsed.
    if (params.initialMessagePath) piArgv.push(`@${params.initialMessagePath}`);

    const env: Record<string, string> = {
      PI_SUBAGENT_ROLE: "child",
      PI_SUBAGENT_ID: params.agentId,
      PI_SUBAGENT_PATH: params.agentPath,
      PI_SUBAGENT_PARENT_SOCKET: params.socketPath,
      // Empty by design: the prompt is delivered as the @file argv above, so the
      // child extension must NOT also inject it via sendUserMessage.
      PI_SUBAGENT_INITIAL_MESSAGE: "",
    };
    if (params.nonce) env.PI_SUBAGENT_NONCE = params.nonce;
    if (params.logPath) env.PI_SUBAGENT_LOG = params.logPath;

    // `pi-subagent` is the wrapper's `$0`; `"$@"` forwards the pi argv verbatim.
    const argv = ["sh", "-c", CHILD_WRAPPER, "pi-subagent", ...piArgv];
    return { env, argv };
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
    const { env, argv } = this.buildChildTokens(prepared);

    const args = [
      "@", "launch",
      "--type=os-window",
      "--cwd", params.cwd,
      "--title", title,
      "--os-window-title", title,
      // --var backs the `var:PI_SUBAGENT_ID=` focus/close fallback; --env (set
      // below) is the reliable kitty @ ls identification signal AND what the
      // child process reads. Every value is a separate argv token, never
      // shell-parsed, so backticks/`$`/quotes are preserved verbatim.
      "--var", `PI_SUBAGENT_ID=${params.agentId}`,
      "--var", `PI_SUBAGENT_PATH=${params.agentPath}`,
      "--copy-env",
      // No --allow-remote-control here: child Pi sessions do not need to drive
      // the parent kitty window, and granting it would let a compromised child
      // manipulate sibling panes (IC-110).
      // Hold the pane open after pi exits (replaces `exec "$SHELL"`, which
      // depended on an unvalidated SHELL — IC-112).
      "--hold",
    ];
    for (const [key, value] of Object.entries(env)) {
      args.push("--env", `${key}=${value}`);
    }
    args.push(...argv);

    const { stdout } = await execFile(this.kittenBin, args);
    const windowId = stdout.trim() || undefined;
    return { kind: "kitty-pi", status: "open", windowId, agentId: params.agentId, title, cwd: params.cwd, socketPath: params.socketPath, logPath: params.logPath };
  }

  async launchPiSplit(params: LaunchPiWindowParams): Promise<AgentDisplayRef> {
    const title = params.title ?? `pi subagent ${params.agentPath}`;
    const prepared = await this.prepareLaunchFiles(params);
    const { env, argv } = this.buildChildTokens(prepared);

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
      // Every value is a separate argv token, never shell-parsed.
      env,
      copyEnv: true,
      // Intentionally omit allowRemoteControl: child Pi sessions should not be
      // able to control the parent/sibling kitty panes (IC-110).
      // Hold the pane open after pi exits (replaces `exec "$SHELL"`, IC-112).
      hold: true,
      sourceWindowId: anchor?.windowId,
      matchCurrentWindow: true,
      argv,
    });
    return { kind: "kitty-split", status: "open", windowId, agentId: params.agentId, title, cwd: params.cwd, socketPath: params.socketPath, logPath: params.logPath };
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
