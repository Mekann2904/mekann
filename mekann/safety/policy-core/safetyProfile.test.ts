import { describe, expect, it } from "vitest";
import { SafetyProfileState, modeForCapabilityProfile } from "./safetyProfile.js";

describe("SafetyProfileState", () => {
	it("maps read-only capability profiles to read_only", () => {
		expect(modeForCapabilityProfile("read_only")).toBe("read_only");
		expect(modeForCapabilityProfile("sandbox_read_only")).toBe("read_only");
	});

	it("applies restrict-only overrides to effective mode", () => {
		const state = new SafetyProfileState("workspace_write");
		expect(state.effectiveMode()).toBe("workspace_write");
		expect(state.pushProfile("modes", "t1", "read_only")).toMatchObject({ ok: true, mode: "read_only" });
		expect(state.effectiveMode()).toBe("read_only");
		state.popProfile("modes", "t1");
		expect(state.effectiveMode()).toBe("workspace_write");
	});

	it("rejects event overrides that would loosen base mode", () => {
		const state = new SafetyProfileState("read_only");
		expect(state.pushProfile("test", "t1", "workspace_write")).toMatchObject({ ok: false, reason: "unsupported-profile-for-event-override" });
		expect(state.pushProfile("test", "t2", "yolo")).toMatchObject({ ok: false, reason: "unsupported-profile-for-event-override" });
	});

	it("ignores overrides while explicitly disabled", () => {
		const state = new SafetyProfileState("yolo");
		state.pushProfile("modes", "t1", "read_only");
		expect(state.effectiveMode()).toBe("read_only");
		state.setExplicitlyDisabled(true);
		expect(state.effectiveMode()).toBe("yolo");
	});
});
