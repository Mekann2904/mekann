export interface IssueArgs {
	mode: "interactive" | "direct" | "cleanup" | "orchestrate" | "autopilot";
	issueNumber?: number;
	resultPath?: string;
}

export function parseIssueArgs(argv: string[]): { ok: true; value: IssueArgs } | { ok: false; error: string } {
	let resultPath: string | undefined;

	// Extract --result flag first
	const filtered: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--result") {
			if (i + 1 >= argv.length) {
				return { ok: false, error: "Usage: mekann-issue --result <path>" };
			}
			resultPath = argv[++i];
		} else {
			filtered.push(argv[i]);
		}
	}

	if (filtered.length === 0) {
		return { ok: true, value: { mode: "interactive", resultPath } };
	}

	if (filtered[0] === "cleanup") {
		return { ok: true, value: { mode: "cleanup", resultPath } };
	}

	if (filtered[0] === "autopilot") {
		// `autopilot` subcommand: run the sequential autopilot supervisor to
		// completion (issue #112).
		return { ok: true, value: { mode: "autopilot", resultPath } };
	}

	if (filtered[0] === "--issue") {
		if (filtered.length < 2) {
			return { ok: false, error: "Usage: mekann-issue --issue <number>" };
		}
		const num = parseInt(filtered[1], 10);
		if (isNaN(num) || num <= 0) {
			return { ok: false, error: `Invalid issue number: ${filtered[1]}` };
		}
		return { ok: true, value: { mode: "direct", issueNumber: num, resultPath } };
	}

	// Bare numeric argument → orchestrate mode (treat the number as a parent
	// PRD/epic issue and drive its sub-issues). See issue #71.
	const maybeParent = parseInt(filtered[0], 10);
	if (!isNaN(maybeParent) && maybeParent > 0 && filtered.length === 1) {
		return { ok: true, value: { mode: "orchestrate", issueNumber: maybeParent, resultPath } };
	}

	return { ok: false, error: "Usage: mekann-issue [autopilot | <parent-number> | --issue <number> | cleanup]" };
}
