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

/** How bash commands are handled in this profile. */
export type BashMode = "none" | "read_only" | "workspace_write" | "unsandboxed";

/** A complete capability profile. */
export interface CapabilityProfile {
	/** Profile identifier. */
	name: CapabilityProfileName;
	/** Whether file mutation tools (edit, write) are visible. */
	allowFileMutationTools: boolean;
	/** How bash commands are restricted. */
	bashMode: BashMode;
	/** Whether network access is permitted. */
	network: boolean;
	/** Whether explicit user approval is required to activate this profile. */
	requiresUserApproval: boolean;
}

// ─── Profile definitions ──────────────────────────────────────────

/** The canonical set of capability profiles. */
export const CAPABILITY_PROFILES: Record<CapabilityProfileName, CapabilityProfile> = {
	plan_read_only: {
		name: "plan_read_only",
		allowFileMutationTools: false,
		bashMode: "read_only",
		network: false,
		requiresUserApproval: false,
	},
	sandbox_read_only: {
		name: "sandbox_read_only",
		allowFileMutationTools: false,
		bashMode: "read_only",
		network: false,
		requiresUserApproval: false,
	},
	workspace_write: {
		name: "workspace_write",
		allowFileMutationTools: true,
		bashMode: "workspace_write",
		network: false,
		requiresUserApproval: false,
	},
	yolo: {
		name: "yolo",
		allowFileMutationTools: true,
		bashMode: "unsandboxed",
		network: true,
		requiresUserApproval: true,
	},
};

/**
 * Look up a capability profile by name.
 * Returns undefined for unknown names.
 */
export function getCapabilityProfile(name: string): CapabilityProfile | undefined {
	return CAPABILITY_PROFILES[name as CapabilityProfileName];
}

/**
 * Map a capability profile to the corresponding sandbox mode.
 * Returns undefined for profiles that don't correspond to a sandbox mode.
 */
export function profileToSandboxMode(name: CapabilityProfileName): "read_only" | "workspace_write" | "yolo" | undefined {
	switch (name) {
		case "plan_read_only":
		case "sandbox_read_only":
			return "read_only";
		case "workspace_write":
			return "workspace_write";
		case "yolo":
			return "yolo";
		default:
			return undefined;
	}
}
