/**
 * cli-args — shared mini argument parser for mekann commands.
 *
 * Provides a small, predictable parser for the `args` strings received by pi
 * `registerCommand` handlers. It is intentionally NOT a shell parser: it does
 * not expand globs, environment variables, or shell operators. For raw bash
 * command tokenisation use `context/command-normalization`.
 *
 * Capabilities:
 *   - quote stripping (single and double quotes) during tokenisation
 *   - `--flag value`, `--flag=value`
 *   - `-f value`, `-f=value`
 *   - `-abc` boolean clusters (only when no `known` filter is set)
 *   - `--` terminator: everything after a bare `--` is positional
 *   - optional `known` filter so free-form text (e.g. a goal objective) is not
 *     eaten by unknown dash-prefixed words
 */

/** Strip a single pair of matching surrounding quotes, if present. */
export function stripQuotes(token: string): string {
	return token.replace(/^(['"])(.*)\1$/, "$2");
}

/**
 * Split a raw command-arg string into tokens, honouring single/double quotes
 * and stripping the surrounding quotes from each token.
 *
 * Mirrors the tokeniser in `context/command-normalization` but without the
 * shell-operator rejection — this is for command args, not bash commands.
 */
export function tokenizeArgs(input: string): string[] {
	const trimmed = input.trim();
	if (!trimmed) return [];
	const parts = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
	return parts.map(stripQuotes);
}

export interface ParseFlagsOptions {
	/** Map a single short letter to a canonical long flag name, e.g. `{ b: "budget" }`. */
	aliases?: Record<string, string>;
	/**
	 * When set, only these canonical flag names are parsed as flags; any other
	 * dash-prefixed token is preserved as a positional. Leave unset to treat
	 * every `--x`/`-x` as a flag (suitable for fixed-grammar commands).
	 */
	known?: readonly string[];
}

export interface ParsedArgs {
	/** Non-flag tokens, in order. Unknown dash-tokens are included here when `known` is set. */
	positionals: string[];
	/** Canonical flag name → raw values in encounter order. Boolean flags store `""`. */
	flags: Map<string, string[]>;
}

/** Whether a token is a flag form (`-x` or `--x`), excluding a bare `-`. */
function isFlagToken(token: string): boolean {
	return token.startsWith("-") && token !== "-";
}

/** Whether a token may be consumed as a flag value (excludes flag forms). */
function canBeValue(token: string): boolean {
	return !isFlagToken(token);
}

function isKnown(name: string, known: readonly string[] | undefined): boolean {
	return known === undefined || known.includes(name);
}

/**
 * Parse tokenised args into positional tokens and a flag map.
 *
 * Value consumption: a space-separated flag takes the following token as its
 * value unless that token itself looks like a flag. Use `--flag=value` (or
 * quote the value) to force a value that starts with `-`.
 */
export function parseFlags(tokens: readonly string[], options?: ParseFlagsOptions): ParsedArgs {
	const aliases = options?.aliases ?? {};
	const known = options?.known;
	const positionals: string[] = [];
	const flags = new Map<string, string[]>();

	const pushFlag = (name: string, value: string): void => {
		const list = flags.get(name);
		if (list) list.push(value);
		else flags.set(name, [value]);
	};

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];

		// `--` terminator: the rest are positional, unfiltered.
		if (token === "--") {
			positionals.push(...tokens.slice(i + 1));
			break;
		}

		// Long flag: --name or --name=value
		if (token.startsWith("--")) {
			const eq = token.indexOf("=");
			const name = eq === -1 ? token.slice(2) : token.slice(2, eq);
			if (!name || !isKnown(name, known)) {
				positionals.push(token);
				continue;
			}
			const inline = eq === -1 ? undefined : token.slice(eq + 1);
			if (inline !== undefined) {
				pushFlag(name, inline);
				continue;
			}
			const next = tokens[i + 1];
			if (next !== undefined && canBeValue(next)) {
				pushFlag(name, next);
				i++;
			} else {
				pushFlag(name, "");
			}
			continue;
		}

		// Short flag: -f, -f=value, -abc cluster
		if (isFlagToken(token)) {
			const eq = token.indexOf("=");
			if (eq !== -1) {
				const letter = token.slice(1, eq);
				const value = token.slice(eq + 1);
				if (letter.length === 1) {
					const name = aliases[letter] ?? letter;
					if (isKnown(name, known)) {
						pushFlag(name, value);
						continue;
					}
				}
				positionals.push(token);
				continue;
			}
			const letters = token.slice(1);
			if (letters.length === 1) {
				const name = aliases[letters] ?? letters;
				if (isKnown(name, known)) {
					const next = tokens[i + 1];
					if (next !== undefined && canBeValue(next)) {
						pushFlag(name, next);
						i++;
					} else {
						pushFlag(name, "");
					}
					continue;
				}
				positionals.push(token);
				continue;
			}
			// Multi-letter cluster: boolean flags (only without a `known` filter,
			// so free-form text starting with `-abc` is preserved verbatim).
			if (known === undefined) {
				for (const ch of letters) pushFlag(aliases[ch] ?? ch, "");
			} else {
				positionals.push(token);
			}
			continue;
		}

		positionals.push(token);
	}

	return { positionals, flags };
}
