import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { featureBooleanValue } from "../settings/enabled.js";
import { registerPromptProvider } from "../core/prompt-core/index.js";
import { SKILL_SURFACE_DEFINITIONS, skillSettingKey } from "./skills.js";

type SkillMeta = { name: string; description: string };

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
			const fm = parseFrontmatter(readFileSync(join(skillsDir, entry.name, "SKILL.md"), "utf8"));
			return { name: fm.name || entry.name, description: fm.description || "" };
		})
		.filter((skill) => skill.description.length > 0)
		.sort((a, b) => a.name.localeCompare(b.name));
}

function visibleSkills(cwd: string, skills: SkillMeta[]): SkillMeta[] {
	const defaults = new Map(SKILL_SURFACE_DEFINITIONS.map((skill) => [skill.name, skill.defaultSurface === "on"]));
	return skills.filter((skill) => featureBooleanValue("skills", skillSettingKey(skill.name), defaults.get(skill.name) ?? false, cwd));
}

function renderSkillSurface(skills: SkillMeta[]): string {
	if (skills.length === 0) return "";
	return `<available_mekann_skills>\n${skills
		.map((skill) => `<skill name="${skill.name}">${skill.description}</skill>`)
		.join("\n")}\n</available_mekann_skills>\n\nIf a task matches one of these Mekann skills, load it with the read tool from mekann/skills/<name>/SKILL.md before following it. Users can also force it with /skill:<name>.`;
}

export default function skillSurface(): void {
	const skills = discoverSkills();
	registerPromptProvider({
		id: "skill-surface",
		getFragments(ctx) {
			const prompt = renderSkillSurface(visibleSkills(ctx.cwd, skills));
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
