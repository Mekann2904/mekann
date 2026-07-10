export type SkillSurfaceDefault = "on" | "off";

export type SkillSurfaceDefinition = {
	name: string;
	defaultSurface: SkillSurfaceDefault;
};

export const SKILL_SURFACE_DEFINITIONS: SkillSurfaceDefinition[] = [
	{ name: "ask-matt", defaultSurface: "off" },
	{ name: "autoresearch-create", defaultSurface: "off" },
	{ name: "cli-for-agents", defaultSurface: "on" },
	{ name: "code-review", defaultSurface: "off" },
	{ name: "codebase-design", defaultSurface: "on" },
	{ name: "diagnose", defaultSurface: "on" },
	{ name: "domain-modeling", defaultSurface: "on" },
	{ name: "grill-with-docs", defaultSurface: "on" },
	{ name: "gsap-core", defaultSurface: "off" },
	{ name: "gsap-frameworks", defaultSurface: "off" },
	{ name: "gsap-performance", defaultSurface: "off" },
	{ name: "gsap-plugins", defaultSurface: "off" },
	{ name: "gsap-react", defaultSurface: "off" },
	{ name: "gsap-scrolltrigger", defaultSurface: "off" },
	{ name: "gsap-timeline", defaultSurface: "off" },
	{ name: "gsap-utils", defaultSurface: "off" },
	{ name: "implement", defaultSurface: "off" },
	{ name: "improve-codebase-architecture", defaultSurface: "on" },
	{ name: "mekann-pi-skill-dev", defaultSurface: "off" },
	{ name: "prototype", defaultSurface: "on" },
	{ name: "research", defaultSurface: "off" },
	{ name: "resolving-merge-conflicts", defaultSurface: "off" },
	{ name: "setup-matt-pocock-skills", defaultSurface: "on" },
	{ name: "tdd", defaultSurface: "on" },
	{ name: "teach", defaultSurface: "off" },
	{ name: "thermo-nuclear-code-quality-review", defaultSurface: "on" },
	{ name: "to-issues", defaultSurface: "on" },
	{ name: "to-prd", defaultSurface: "on" },
	{ name: "triage", defaultSurface: "on" },
];

export function skillSettingKey(name: string): string {
	return `show.${name}`;
}
