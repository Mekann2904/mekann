/**
 * Policy Core — Capability Profiles.
 *
 * Defines the shared vocabulary for sandbox / plan-mode capability levels.
 * Each profile describes what tools and bash modes are permitted.
 */

// ─── Types ────────────────────────────────────────────────────────

/** Well-known capability profile names. */
export type CapabilityProfileName =
	| "plan_read_only"
	| "sandbox_read_only"
	| "workspace_write"
	| "yolo";

