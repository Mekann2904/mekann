import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export interface PiSessionLaunchRequest {
	cwd: string;
	title: string;
	/** Node binary used by the currently running Pi process. Avoids shell PATH/version drift. */
	nodeBin?: string;
	/** Keep the window open after Pi exits. Intended for debugging only. */
	hold?: boolean;
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
	const command = `exec ${quoteShell(nodeBin)} ${quoteShell(piBin)} --name ${quoteShell(request.title)}`;

	const args = [
		"@", "launch",
		"--type=window",
		"--location", "vsplit",
		"--cwd", request.cwd,
		"--title", request.title,
		"--copy-env",
	];
	if (request.hold) args.push("--hold");
	args.push(shell, "-lc", command);

	const { stdout } = await execFile("kitten", args, { timeout: 10000 });
	return { windowId: stdout.trim() || undefined };
}
