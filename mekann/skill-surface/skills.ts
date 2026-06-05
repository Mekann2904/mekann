export type SkillSurfaceDefault = "on" | "off";

export type SkillSurfaceDefinition = {
	name: string;
	defaultSurface: SkillSurfaceDefault;
};

export const SKILL_SURFACE_DEFINITIONS: SkillSurfaceDefinition[] = [
	{ name: "autoresearch-create", defaultSurface: "off" },
	{ name: "diagnose", defaultSurface: "on" },
	{ name: "grill-with-docs", defaultSurface: "on" },
	{ name: "gsap-core", defaultSurface: "off" },
	{ name: "gsap-frameworks", defaultSurface: "off" },
	{ name: "gsap-performance", defaultSurface: "off" },
	{ name: "gsap-plugins", defaultSurface: "off" },
	{ name: "gsap-react", defaultSurface: "off" },
	{ name: "gsap-scrolltrigger", defaultSurface: "off" },
	{ name: "gsap-timeline", defaultSurface: "off" },
	{ name: "gsap-utils", defaultSurface: "off" },
	{ name: "improve-codebase-architecture", defaultSurface: "on" },
	{ name: "mekann-pi-skill-dev", defaultSurface: "off" },
	{ name: "prototype", defaultSurface: "on" },
	{ name: "setup-matt-pocock-skills", defaultSurface: "on" },
	{ name: "tdd", defaultSurface: "on" },
	{ name: "thermo-nuclear-code-quality-review", defaultSurface: "on" },
	{ name: "to-issues", defaultSurface: "on" },
	{ name: "to-prd", defaultSurface: "on" },
	{ name: "triage", defaultSurface: "on" },
	{ name: "zoom-out", defaultSurface: "on" },
];

export function skillSettingKey(name: string): string {
	return `show.${name}`;
}
