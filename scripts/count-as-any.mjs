#!/usr/bin/env node
/**
 * Deterministic non-test `as any` counter + baseline gate for issue #141.
 *
 * Why a Node script (not ripgrep/grep)?
 * -------------------------------------
 * The previous `check-as-any-baseline.sh` shelled out to `rg --type ts`. That
 * made the gate *environment-sensitive*: different ripgrep versions (and the
 * grep fallback) resolve the `ts` file-type and globs slightly differently, so
 * the same commit counted 76 locally but 77 on the GitHub Actions runner,
 * flapping the gate red for no real regression. Node is already installed in
 * every CI job that runs this gate (`actions/setup-node`), so doing the walk in
 * Node makes the count byte-for-byte identical across macOS / Linux / runner.
 *
 * Counting methodology
 * --------------------
 * Line count of the literal string `as any` across production TypeScript
 * sources under `mekann/` (`.ts`/`.tsx`/`.cts`/`.mts`), excluding:
 *   - `*.test.ts` / `*.spec.ts` (and the `.tsx`/`.cts`/`.mts` variants)
 *   - any file under a `tests/` or `__tests__/` directory
 *   - `.d.ts` / `.d.mts` declaration files
 *   - `node_modules`, `dist`, `build`, `coverage`, `vendor`
 * This matches the ESLint scope in `eslint.config.mjs` (`ignores` block), so the
 * baseline gate and the lint gate police exactly the same set of files.
 *
 * Exit codes
 *   0  current count <= baseline (CI green; notices when it dropped)
 *   1  current count  > baseline (regression — CI red)
 *   2  misconfiguration (baseline file missing/malformed)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASELINE_FILE = join(__dirname, "as-any-baseline.json");

const SOURCE_EXTS = [".ts", ".tsx", ".cts", ".mts"];

// Directories that never contain production sources (matched by segment name).
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage", "vendor", ".git"]);

/**
 * Is `rel` (repo-relative POSIX path) a test or declaration file?
 * Mirrors eslint.config.mjs `ignores` for the no-explicit-any rule.
 */
function isTestOrDecl(rel) {
	// Declaration files: *.d.ts, *.d.mts, *.d.cts, *.d.tsx
	if (/\.[cm]?\.d\.tsx?$/.test(rel)) return true;
	// Test/spec files by basename: *.test.ts, *.spec.ts (+ variants)
	if (/[\\/][^\\/]+\.(test|spec)\.[cm]?tsx?$/.test(rel)) return true;
	// Anything inside a tests/ or __tests__/ directory
	if (/(^|[\\/])(tests|__tests__)[\\/]/.test(rel)) return true;
	return false;
}

function listSources(dir, out = []) {
	for (const name of readdirSync(dir)) {
		if (SKIP_DIRS.has(name)) continue;
		const p = join(dir, name);
		const s = statSync(p);
		if (s.isDirectory()) {
			listSources(p, out);
		} else if (s.isFile()) {
			const dot = name.slice(name.lastIndexOf("."));
			if (SOURCE_EXTS.includes(dot)) out.push(p);
		}
	}
	return out;
}

function countAsAny(file) {
	const text = readFileSync(file, "utf8");
	// Split conserves all lines; a trailing newline yields a final "" element
	// that never contains "as any", so it does not inflate the count.
	let n = 0;
	for (const line of text.split("\n")) if (line.includes("as any")) n++;
	return n;
}

function main() {
	let baseline;
	try {
		baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8")).as_any_count;
	} catch (err) {
		console.error(`::error::Cannot read baseline from ${relative(ROOT, BASELINE_FILE)}: ${err.message}`);
		process.exit(2);
	}
	if (typeof baseline !== "number" || !Number.isFinite(baseline)) {
		console.error(`::error::Baseline as_any_count is not a number in ${relative(ROOT, BASELINE_FILE)}.`);
		process.exit(2);
	}

	const mekannDir = join(ROOT, "mekann");
	const files = listSources(mekannDir);
	let current = 0;
	const offenders = [];
	for (const f of files) {
		const rel = relative(ROOT, f);
		if (isTestOrDecl(rel)) continue;
		const n = countAsAny(f);
		if (n > 0) {
			current += n;
			offenders.push([rel, n]);
		}
	}

	console.log(`Non-test 'as any' count: ${current} (baseline: ${baseline})`);

	if (current > baseline) {
		console.error(`::error::'as any' count increased from ${baseline} to ${current}.`);
		console.error(`::error::Use parseParams()/typed access instead of 'as any' (see mekann/utils/typed-params.ts).`);
		console.error("::error::If the increase is intentional, lower is fine — but raising requires justification.");
		process.exit(1);
	}

	if (current < baseline) {
		console.log(`::notice::'as any' count dropped from ${baseline} to ${current}. Consider lowering as_any_count in ${relative(ROOT, BASELINE_FILE)} to lock in the gain.`);
	}

	// Print the top offenders at info level so regressions are easy to locate.
	if (offenders.length) {
		offenders.sort((a, b) => b[1] - a[1]);
		const top = offenders.slice(0, 10)
			.map(([f, n]) => `  ${String(n).padStart(3)}  ${f}`)
			.join("\n");
		console.log(`Top offenders:\n${top}`);
	}

	process.exit(0);
}

main();
