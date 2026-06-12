import { getWorkspaceMekannSettingsPath, loadSettings, saveSettingsChecked, setFeatureValue } from "../../settings/store.js";
import { featureRawConfig } from "../../settings/enabled.js";

export type BashMode = "off" | "ask" | "sandboxed" | "yolo";

export function getBashMode(cwd = process.cwd()): BashMode {
	const value = featureRawConfig("sandbox", cwd).bashMode;
	return value === "off" || value === "ask" || value === "sandboxed" || value === "yolo" ? value : "sandboxed";
}

export function parseBashAllowlist(value: unknown): string[] {
	if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
	if (typeof value !== "string") return [];
	return value.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
}

export function getBashAllowlist(cwd = process.cwd()): string[] {
	return parseBashAllowlist(featureRawConfig("sandbox", cwd).bashAllowlist);
}

export function isBashCommandAllowed(command: string, allowlist: string[]): boolean {
	const normalized = normalizeBashCommand(command);
	return allowlist.some((allowed) => normalizeBashCommand(allowed) === normalized);
}

export function normalizeBashCommand(command: string): string {
	return command.trim().replace(/\s+/g, " ");
}

export function setWorkspaceBashMode(cwd: string, mode: BashMode): void {
	const path = getWorkspaceMekannSettingsPath(cwd);
	const loaded = loadSettings(path);
	const next = setFeatureValue(loaded.settings, "sandbox", "bashMode", mode);
	saveSettingsChecked(path, next, loaded.hash);
}

export function appendWorkspaceBashAllowlistCommand(cwd: string, command: string): void {
	const path = getWorkspaceMekannSettingsPath(cwd);
	const loaded = loadSettings(path);
	const existing = parseBashAllowlist(loaded.settings.features.sandbox?.bashAllowlist);
	const normalized = normalizeBashCommand(command);
	if (existing.some((item) => normalizeBashCommand(item) === normalized)) return;
	const nextList = [...existing, normalized].join("\n");
	const next = setFeatureValue(loaded.settings, "sandbox", "bashAllowlist", nextList);
	saveSettingsChecked(path, next, loaded.hash);
}
