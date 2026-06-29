// @ts-check
/**
 * ESLint flat config for the mekann monorepo.
 *
 * Scope of this config (issue #141): introduce `@typescript-eslint/no-explicit-any`
 * as a project-wide **warning** (non-blocking, surfaces the existing `as any` /
 * `: any` debt) and promote it to an **error** for the files already cleaned to
 * zero explicit-any, so they cannot regress. The non-test `as any` count is also
 * gated by `scripts/check-as-any-baseline.sh` (a baseline guard) in CI.
 *
 * Only the `no-explicit-any` rule is enabled — it is a syntactic rule that needs
 * no type information, so this config does not spin up a TS program (fast, no
 * tsconfig coupling). Broader `typescript-eslint` recommended rules are
 * intentionally out of scope for this incremental rollout.
 */
import tseslint from "typescript-eslint";

/**
 * Files cleaned to zero explicit-any (no `as any`, no `: any`) as part of #141.
 * They are held at `error` so the cleanup cannot regress. Add a file here only
 * after it reaches zero explicit-any; otherwise CI fails.
 */
const ERROR_TIER = [
	"mekann/utils/typed-params.ts",
	"mekann/context/output-gate/index.ts",
	"mekann/context/ledger/index.ts",
	"mekann/autonomy/autoresearch/toolsRegistration.ts",
	"mekann/autonomy/goal/state.ts",
];

export default tseslint.config(
		{
			ignores: [
				"**/node_modules/**",
				"**/coverage/**",
				"**/dist/**",
				"**/build/**",
				"vendor/**",
				"**/*.d.ts",
				"**/*.d.mts",
				// Tests use `any` for mocks/stubs by design; scope this rule to
				// production sources (matches the `as any` baseline in CI).
				"**/*.test.ts",
				"**/*.spec.ts",
				"**/tests/**",
				"**/__tests__/**",
				"benchmark-startup.*",
				"scripts/**",
			],
		},
	{
		files: ["mekann/**/*.ts"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: "module",
			},
		},
		plugins: {
			"@typescript-eslint": tseslint.plugin,
		},
		rules: {
			// Stage 1 (this issue): warn everywhere so the 80 remaining `as any` /
			// `: any` instances are visible without blocking CI. Files in ERROR_TIER
			// are promoted below.
			"@typescript-eslint/no-explicit-any": "warn",
		},
	},
	{
		files: ERROR_TIER,
		rules: {
			"@typescript-eslint/no-explicit-any": "error",
		},
	},
);
