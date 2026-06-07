import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { featureBooleanValue } from "../settings/enabled.js";
import { registerPromptProvider } from "../core/prompt-core/index.js";
import { SKILL_SURFACE_DEFINITIONS, skillSettingKey } from "./skills.js";

type SkillMeta = { name: string; description: string; filePath: string };

function parseFrontmatter(text: string): Record<string, string> {
	const match = text.match(/^---\n([\s\S]*?)\n---\n/);
	if (!match) return {};
	const out: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const idx = line.indexOf(":");
		if (idx === -1) continue;
		out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
	}
	return out;
}

function discoverSkills(): SkillMeta[] {
	const here = dirname(fileURLToPath(import.meta.url));
	const skillsDir = join(here, "..", "skills");
	return readdirSync(skillsDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => {
			const filePath = join(skillsDir, entry.name, "SKILL.md");
			const fm = parseFrontmatter(readFileSync(filePath, "utf8"));
			return { name: fm.name || entry.name, description: fm.description || "", filePath };
		})
		.filter((skill) => skill.description.length > 0)
		.sort((a, b) => a.name.localeCompare(b.name));
}

function visibleSkills(cwd: string, skills: SkillMeta[]): SkillMeta[] {
	const defaults = new Map(SKILL_SURFACE_DEFINITIONS.map((skill) => [skill.name, skill.defaultSurface === "on"]));
	return skills.filter((skill) => featureBooleanValue("skills", skillSettingKey(skill.name), defaults.get(skill.name) ?? false, cwd));
}

const MAX_DESCRIPTION_CHARS = 160;

function compactDescription(description: string): string {
	const normalized = description.replace(/\s+/g, " ").trim();
	if (normalized.length <= MAX_DESCRIPTION_CHARS) return normalized;
	return `${normalized.slice(0, MAX_DESCRIPTION_CHARS - 1).trimEnd()}…`;
}

function displaySkillPath(cwd: string, filePath: string): string {
	const rel = relative(cwd, filePath);
	return rel && !rel.startsWith("..") && !rel.startsWith("/") ? rel : filePath;
}

function renderSkillSurface(cwd: string, skills: SkillMeta[]): string {
	if (skills.length === 0) return "";
	return [
		"Enabled Mekann skills. Load the listed SKILL.md with read when the task matches; resolve relative references from that skill directory. /skill:<name> can force-load.",
		"",
		...skills.map((skill) =>
			`- ${skill.name}: ${compactDescription(skill.description)} (${displaySkillPath(cwd, skill.filePath)})`,
		),
	].join("\n");
}

export default function skillSurface(): void {
	const skills = discoverSkills();
	registerPromptProvider({
		id: "skill-surface",
		getFragments(ctx) {
			const prompt = renderSkillSurface(ctx.cwd, visibleSkills(ctx.cwd, skills));
			return prompt ? [{
				id: "skill-surface:visible-skills",
				source: "mekann/skill-surface",
				kind: "project_instruction",
				stability: "semi_stable",
				scope: "session",
				priority: 60,
				version: "v1",
				cacheIntent: "prefer_cache",
				content: prompt,
			}] : [];
		},
	});
}
