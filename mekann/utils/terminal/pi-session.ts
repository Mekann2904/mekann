import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { KittyControl } from "./kitty/control.js";

const execFile = promisify(execFileCb);

/**
 * Env marker set on every Pi session launched by {@link launchPiSessionInKittySplit}.
 *
 * That function is the sole launcher for issue-work Pi sessions (direct `/issue`,
 * bulk launch, and orchestration children all flow through it). The marker lets
 * issue-only tools — currently `issue_workflow` — scope themselves to the Issue
 * Pi and stay out of the Main Pi / other sessions. Shared as a constant so the
 * launcher and the tool reader cannot drift on the name.
 */
export const ISSUE_PI_ENV = "MEKANN_ISSUE_PI";

export interface PiSessionLaunchRequest {
	cwd: string;
	title: string;
	/** Node binary used by the currently running Pi process. Avoids shell PATH/version drift. */
	nodeBin?: string;
	/** Additional system prompt for the launched Pi session. */
	appendSystemPrompt?: string;
	/** Initial user message sent to the launched Pi session. */
	initialMessage?: string;
	/** Keep the window open after Pi exits. Intended for debugging only. */
	hold?: boolean;
	/** Parent issue number when this Work Pi is part of an orchestration (issue #71). */
	orchestrationParent?: number;
	/** Child issue number the Work Pi was started for (issue #71). */
	orchestrationChild?: number;
}

function quoteShell(value: string): string {
	return JSON.stringify(value);
}

async function resolveBin(command: string): Promise<string> {
	try {
		const { stdout } = await execFile("which", [command], { timeout: 3000 });
		return stdout.trim() || command;
	} catch {
		return command;
	}
}

export async function launchPiSessionInKittySplit(request: PiSessionLaunchRequest): Promise<{ windowId?: string }> {
	const nodeBin = request.nodeBin || await resolveBin("node");
	const piBin = await resolveBin("pi");
	const shell = process.env.SHELL || "/bin/sh";
	const piArgs = [quoteShell(piBin), "--name", quoteShell(request.title)];
	if (request.appendSystemPrompt) {
		piArgs.push("--append-system-prompt", quoteShell(request.appendSystemPrompt));
	}
	if (request.initialMessage) {
		// Positional argument becomes the first user message in interactive mode.
		// Placed last so it follows options and @file arguments.
		piArgs.push(quoteShell(request.initialMessage));
	}
	const command = `exec ${quoteShell(nodeBin)} ${piArgs.join(" ")}`;

	const args = [
		"@", "launch",
		"--type=window",
		"--location", "vsplit",
		"--cwd", request.cwd,
		"--title", request.title,
		"--copy-env",
	];
	if (request.hold) args.push("--hold");
	// This function exclusively launches issue-work Pi sessions, so every launch
	// is marked ISSUE_PI_ENV=1 (see ADR-0023). issue-only tools read this marker
	// to stay scoped to the Issue Pi and out of the Main Pi.
	args.push("--env", `${ISSUE_PI_ENV}=1`);
	// Issue #71 orchestration markers: propagated as explicit env so a Work Pi can
	// detect at session_shutdown that it was started as part of an orchestration
	// and which child it was. Explicit --env is more robust than relying solely
	// on the launcher process environment.
	if (typeof request.orchestrationParent === "number") {
		args.push("--env", `MEKANN_ORCHESTRATION_PARENT=${request.orchestrationParent}`);
	}
	if (typeof request.orchestrationChild === "number") {
		args.push("--env", `MEKANN_ORCHESTRATION_CHILD=${request.orchestrationChild}`);
	}

	// ADR-0021: protect the Main Pi region. When an Issue Pi pane already exists,
	// split from the widest one instead of the focused window (Main Pi). On the
	// first /issue call (or when the lookup fails) this is a no-op and kitty
	// splits the focused window, preserving the original 1st-call behaviour.
	const kitty = new KittyControl();
	const anchorWindowId = await kitty.findIssuePiAnchorWindowId();
	if (typeof anchorWindowId === "number") {
		args.push("--source-window", `id:${anchorWindowId}`);
	}

	args.push(shell, "-lc", command);

	const { stdout } = await execFile("kitten", args, { timeout: 10000 });
	return { windowId: stdout.trim() || undefined };
}
