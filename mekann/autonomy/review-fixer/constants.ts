/**
 * Review fixer constants.
 *
 * Centralizes the skill name that review_fixer relies on so the child Pi
 * prompt (childPrompt.ts) and the parent failure fallback message (index.ts)
 * stay in sync. The skill is intentionally hidden from the Issue Work Pi skill
 * surface (ADR-0023) but remains force-loadable via `/skill:<name>`.
 */

/**
 * The skill review_fixer runs in its child Pi, and that the parent Pi falls
 * back to force-loading when the child review errors.
 *
 * This is the single source of truth for the skill name. Both call sites
 * construct `/skill:${REVIEW_FIXER_FALLBACK_SKILL}`, so renaming the skill
 * only requires editing this constant (see issue #82).
 */
export const REVIEW_FIXER_FALLBACK_SKILL = "thermo-nuclear-code-quality-review";
