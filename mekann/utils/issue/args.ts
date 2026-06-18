export interface IssueArgs {
	mode: "interactive" | "direct" | "cleanup" | "open" | "autopilot";
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

	// Bare numeric argument → open mode. Mirrors the interactive list's
	// single-select: orchestrate when the issue is a parent (has sub-issues,
	// issue #71), otherwise open it directly (worktree + Work Pi). Previously
	// this was hardwired to orchestrate-only, so `/issue <number>` did nothing
	// for leaf issues ("nothing to orchestrate").
	const maybeNumber = parseInt(filtered[0], 10);
	if (!isNaN(maybeNumber) && maybeNumber > 0 && filtered.length === 1) {
		return { ok: true, value: { mode: "open", issueNumber: maybeNumber, resultPath } };
	}

	return { ok: false, error: "Usage: mekann-issue [autopilot | <number> | --issue <number> | cleanup]" };
}
