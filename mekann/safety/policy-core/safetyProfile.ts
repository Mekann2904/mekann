import type { CapabilityProfileName, SandboxMode } from "./modes.js";

export interface SafetyProfileEntry {
	owner: string;
	token: string;
	mode: SandboxMode;
}

export type SafetyProfilePushDecision =
	| { ok: true; mode: SandboxMode }
	| { ok: false; reason: "unsupported-profile-for-event-override" | "override-escalation-rejected"; requestedMode?: SandboxMode };

const MODE_RANK: Record<SandboxMode, number> = { read_only: 0, workspace_write: 1, yolo: 2 };

export function modeForCapabilityProfile(profile: CapabilityProfileName): SandboxMode | undefined {
	switch (profile) {
		case "read_only":
		case "sandbox_read_only":
			return "read_only";
		case "workspace_write":
			return "workspace_write";
		case "yolo":
			return "yolo";
	}
}

export class SafetyProfileState {
	private profileOverrideStack: SafetyProfileEntry[] = [];
	private disabled = false;
	private baseMode: SandboxMode;
	planModeStatus: "main" | "plan" | "read_only" | "sub" | undefined;
	rightStatus: string | undefined;

	constructor(baseMode: SandboxMode) {
		this.baseMode = baseMode;
	}

	setBaseMode(mode: SandboxMode): void { this.baseMode = mode; }
	getBaseMode(): SandboxMode { return this.baseMode; }
	setExplicitlyDisabled(disabled: boolean): void { this.disabled = disabled; }
	isExplicitlyDisabled(): boolean { return this.disabled; }
	overrideCount(): number { return this.profileOverrideStack.length; }

	effectiveMode(): SandboxMode {
		if (this.disabled) return this.baseMode;
		return this.profileOverrideStack.length > 0 ? this.profileOverrideStack[this.profileOverrideStack.length - 1].mode : this.baseMode;
	}

	canPushProfile(profile: CapabilityProfileName): SafetyProfilePushDecision {
		const mode = modeForCapabilityProfile(profile);
		if (mode !== "read_only") return { ok: false, reason: "unsupported-profile-for-event-override", requestedMode: mode };
		if (MODE_RANK[mode] > MODE_RANK[this.baseMode]) return { ok: false, reason: "override-escalation-rejected", requestedMode: mode };
		return { ok: true, mode };
	}

	pushProfile(owner: string, token: string, profile: CapabilityProfileName): SafetyProfilePushDecision {
		const decision = this.canPushProfile(profile);
		if (!decision.ok) return decision;
		this.removeProfile((entry) => entry.token === token);
		this.profileOverrideStack.push({ owner, token, mode: decision.mode });
		return decision;
	}

	popProfile(owner: string, token: string): void {
		this.removeProfile((entry) => entry.owner === owner && entry.token === token);
	}

	clearProfiles(): void {
		this.profileOverrideStack.length = 0;
	}

	private removeProfile(predicate: (entry: SafetyProfileEntry) => boolean): void {
		const idx = this.profileOverrideStack.findIndex(predicate);
		if (idx >= 0) this.profileOverrideStack.splice(idx, 1);
	}
}
