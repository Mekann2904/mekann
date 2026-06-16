/**
 * orchestration/autopilot/markers.ts — env markers for autopilot-managed Work Pis.
 *
 * Distinguished from the parent/child orchestration markers
 * (`MEKANN_ORCHESTRATION_*`, issue #71) so the two supervision styles never
 * interfere: an autopilot Work Pi carries `MEKANN_AUTOPILOT_*` and never
 * `MEKANN_ORCHESTRATION_*`, so the orchestration continuation hook stays inert
 * and the autopilot auto-close hook takes over instead.
 *
 * - {@link AUTOPILOT_SUPERVISOR_ENV}: present (=1) on every Work Pi that the
 *   autopilot supervisor started. Gates the Work-Pi auto-close behavior.
 * - {@link AUTOPILOT_CHILD_ENV}: the issue number the Work Pi was started for.
 */

/** Env var marking a Work Pi as part of an autopilot run. */
export const AUTOPILOT_SUPERVISOR_ENV = "MEKANN_AUTOPILOT_SUPERVISOR";
/** Env var carrying the issue number an autopilot Work Pi was started for. */
export const AUTOPILOT_CHILD_ENV = "MEKANN_AUTOPILOT_CHILD";

/** Canonical triage labels consumed by the autopilot (ADR-0025 slice A/C). */
export const READY_FOR_AGENT_LABEL = "ready-for-agent";
export const READY_FOR_HUMAN_LABEL = "ready-for-human";

/** Read the autopilot child number from the environment, or null when absent/invalid. */
export function readAutopilotChildEnv(env: NodeJS.ProcessEnv = process.env): number | null {
	const raw = env[AUTOPILOT_CHILD_ENV];
	const supervisor = env[AUTOPILOT_SUPERVISOR_ENV];
	if (!raw || supervisor !== "1") return null;
	const num = Number(raw);
	return Number.isFinite(num) && num > 0 ? num : null;
}
