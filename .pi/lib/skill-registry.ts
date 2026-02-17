/**
 * Skill Registry Module
 * Handles skill loading, resolution, and merging for subagents and agent teams.
 *
 * Key features:
 * - Load skills from pi-core skill system
 * - Resolve skills by name or ID
 * - Merge skills with inheritance rules (parent->child, team common + member individual)
 * - Format skill content for prompt injection
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// ============================================================================
// Types
// ============================================================================

/**
 * Skill definition matching pi-core Skill interface
 */
export interface SkillDefinition {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: string;
  disableModelInvocation: boolean;
}

/**
 * Skill reference - can be a skill name or path
 */
export type SkillReference = string;

/**
 * Resolved skill with content loaded
 */
export interface ResolvedSkill extends SkillDefinition {
  content: string;
}

/**
 * Skill resolution options
 */
export interface ResolveSkillsOptions {
  /** Working directory for resolving relative paths */
  cwd: string;
  /** Agent directory for global skills (default: ~/.pi/agent) */
  agentDir?: string;
  /** Additional skill paths to search */
  skillPaths?: string[];
}

/**
 * Skill merge configuration for inheritance
 */
export interface SkillMergeConfig {
  /** Parent skills (inherited from team/subagent level) */
  parentSkills?: SkillReference[];
  /** Child skills (member-specific) */
  childSkills?: SkillReference[];
  /** Strategy: "replace" ignores parent, "merge" combines both */
  strategy?: "replace" | "merge";
}

/**
 * Result of skill resolution
 */
export interface ResolveSkillsResult {
  skills: ResolvedSkill[];
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Constants
// ============================================================================

const CONFIG_DIR_NAME = ".pi";
const SKILL_FILE_NAME = "SKILL.md";

// ============================================================================
// Skill Loading Utilities
// ============================================================================

/**
 * Get the default agent directory (~/.pi/agent)
 */
function getDefaultAgentDir(): string {
  const envDir = process.env.PI_CODING_AGENT_DIR;
  if (envDir && envDir.trim()) {
    const trimmed = envDir.trim();
    if (trimmed === "~") return homedir();
    if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
    return trimmed;
  }
  return join(homedir(), ".pi", "agent");
}

/**
 * Get candidate skill directories to search
 */
function getSkillSearchPaths(cwd: string, agentDir?: string): string[] {
  const resolvedAgentDir = agentDir ?? getDefaultAgentDir();
  const paths: string[] = [];

  // Project-local skills (in .pi/lib/skills, not .pi/skills to avoid Pi auto-loading)
  paths.push(join(cwd, CONFIG_DIR_NAME, "lib", "skills"));

  // Global skills
  paths.push(join(resolvedAgentDir, "skills"));

  return paths;
}

/**
 * Parse YAML frontmatter from skill content
 */
function parseSkillFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content.trim() };
  }

  const frontmatterText = match[1];
  const body = match[2].trim();
  const frontmatter: Record<string, unknown> = {};

  // Simple YAML parsing for flat key-value pairs
  const lines = frontmatterText.split("\n");
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value: string | boolean | number = line
      .slice(colonIndex + 1)
      .trim();

    // Remove quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Convert boolean strings
    if (value === "true") value = true;
    else if (value === "false") value = false;

    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

/**
 * Load a single skill from its SKILL.md file
 */
function loadSkillFromFile(
  filePath: string,
  source: string,
): { skill: SkillDefinition | null; error?: string } {
  try {
    if (!existsSync(filePath)) {
      return { skill: null, error: `Skill file not found: ${filePath}` };
    }

    const content = readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseSkillFrontmatter(content);

    const name = String(frontmatter.name || "");
    const description = String(frontmatter.description || "");

    if (!name) {
      return { skill: null, error: `Skill missing name: ${filePath}` };
    }

    if (!description) {
      return { skill: null, error: `Skill missing description: ${filePath}` };
    }

    const baseDir = dirname(filePath);
    const disableModelInvocation =
      frontmatter["disable-model-invocation"] === true ||
      frontmatter["disable-model-invocation"] === "true";

    return {
      skill: {
        name,
        description,
        filePath,
        baseDir,
        source,
        disableModelInvocation,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error loading skill";
    return { skill: null, error: `${message}: ${filePath}` };
  }
}

/**
 * Discover skills from a directory
 */
function discoverSkillsFromDir(
  skillsDir: string,
  source: string,
): { skills: SkillDefinition[]; errors: string[] } {
  const skills: SkillDefinition[] = [];
  const errors: string[] = [];

  if (!existsSync(skillsDir)) {
    return { skills, errors };
  }

  try {
    const entries = require("fs").readdirSync(skillsDir, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.name.endsWith(".md")) continue;
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules") continue;

      if (entry.isDirectory()) {
        // Look for SKILL.md in subdirectory
        const skillPath = join(skillsDir, entry.name, SKILL_FILE_NAME);
        if (existsSync(skillPath)) {
          const result = loadSkillFromFile(skillPath, source);
          if (result.skill) {
            skills.push(result.skill);
          } else if (result.error) {
            errors.push(result.error);
          }
        }
      } else if (entry.name.endsWith(".md")) {
        // Direct .md file in skills root
        const skillPath = join(skillsDir, entry.name);
        const result = loadSkillFromFile(skillPath, source);
        if (result.skill) {
          skills.push(result.skill);
        } else if (result.error) {
          errors.push(result.error);
        }
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error scanning skills";
    errors.push(`${message}: ${skillsDir}`);
  }

  return { skills, errors };
}

// ============================================================================
// Skill Resolution
// ============================================================================

/**
 * Build a skill index for fast lookup
 */
function buildSkillIndex(
  cwd: string,
  agentDir?: string,
  additionalPaths?: string[],
): Map<string, SkillDefinition> {
  const index = new Map<string, SkillDefinition>();
  const searchPaths = getSkillSearchPaths(cwd, agentDir);

  // Add additional paths
  if (additionalPaths) {
    for (const path of additionalPaths) {
      const resolved = path.startsWith("~")
        ? join(homedir(), path.slice(1))
        : path;
      if (!searchPaths.includes(resolved)) {
        searchPaths.push(resolved);
      }
    }
  }

  // Load skills from all paths
  for (const skillsDir of searchPaths) {
    const { skills } = discoverSkillsFromDir(skillsDir, "project");
    for (const skill of skills) {
      // First skill wins (project overrides global)
      if (!index.has(skill.name)) {
        index.set(skill.name, skill);
      }
    }
  }

  return index;
}

/**
 * Resolve skill content from file
 */
function resolveSkillContent(skill: SkillDefinition): {
  content: string;
  error?: string;
} {
  try {
    if (!existsSync(skill.filePath)) {
      return { content: "", error: `Skill file not found: ${skill.filePath}` };
    }

    const content = readFileSync(skill.filePath, "utf-8");
    return { content };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error reading skill";
    return { content: "", error: message };
  }
}

/**
 * Resolve multiple skills by reference
 */
export function resolveSkills(
  references: SkillReference[],
  options: ResolveSkillsOptions,
): ResolveSkillsResult {
  const skills: ResolvedSkill[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!references || references.length === 0) {
    return { skills, errors, warnings };
  }

  const index = buildSkillIndex(options.cwd, options.agentDir, options.skillPaths);
  const resolvedNames = new Set<string>();

  for (const ref of references) {
    if (!ref || ref.trim() === "") continue;

    const trimmedRef = ref.trim();

    // Check if already resolved (deduplication)
    if (resolvedNames.has(trimmedRef)) {
      warnings.push(`Duplicate skill reference: ${trimmedRef}`);
      continue;
    }

    // Try to find skill by name
    const skill = index.get(trimmedRef);

    if (!skill) {
      warnings.push(`Skill not found: ${trimmedRef}`);
      continue;
    }

    // Load skill content
    const { content, error } = resolveSkillContent(skill);

    if (error) {
      errors.push(error);
      continue;
    }

    if (!content.trim()) {
      warnings.push(`Skill content is empty: ${trimmedRef}`);
      continue;
    }

    skills.push({
      ...skill,
      content,
    });
    resolvedNames.add(trimmedRef);
  }

  return { skills, errors, warnings };
}

// ============================================================================
// Skill Merging
// ============================================================================

/**
 * Merge skills according to inheritance rules
 *
 * Rules:
 * - Empty array [] is ignored (treated as "not specified")
 * - Parent skills are inherited by default
 * - Child skills are merged with parent skills
 * - "replace" strategy ignores parent skills
 */
export function mergeSkills(
  config: SkillMergeConfig,
  options: ResolveSkillsOptions,
): ResolveSkillsResult {
  const { parentSkills = [], childSkills = [], strategy = "merge" } = config;

  // Normalize empty arrays
  const normalizedParent =
    parentSkills && parentSkills.length > 0 ? parentSkills : [];
  const normalizedChild =
    childSkills && childSkills.length > 0 ? childSkills : [];

  // Determine final skill list based on strategy
  let finalReferences: SkillReference[];

  if (strategy === "replace" && normalizedChild.length > 0) {
    // Replace strategy: only use child skills if specified
    finalReferences = normalizedChild;
  } else {
    // Merge strategy: combine parent and child (child can override parent)
    // Deduplication happens in resolveSkills
    finalReferences = [...normalizedParent, ...normalizedChild];
  }

  // If no skills specified, return empty
  if (finalReferences.length === 0) {
    return { skills: [], errors: [], warnings: [] };
  }

  return resolveSkills(finalReferences, options);
}

/**
 * Merge skill arrays handling the inheritance pattern
 * Used by subagents and agent teams
 */
export function mergeSkillArrays(
  parentSkills: SkillReference[] | undefined,
  childSkills: SkillReference[] | undefined,
): SkillReference[] {
  // If child is explicitly empty array, treat as "not specified"
  // If child has skills, those are used
  // If child is undefined, inherit from parent

  if (childSkills !== undefined && childSkills.length > 0) {
    return childSkills;
  }

  if (parentSkills && parentSkills.length > 0) {
    return parentSkills;
  }

  return [];
}

// ============================================================================
// Skill Formatting
// ============================================================================

/**
 * Format resolved skills for prompt injection
 */
export function formatSkillsForPrompt(skills: ResolvedSkill[]): string {
  if (!skills || skills.length === 0) {
    return "";
  }

  const lines: string[] = [
    "",
    "The following skills provide specialized instructions for specific tasks.",
    "Use the read tool to load a skill's file when the task matches its description.",
    "When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
    "",
    "<available_skills>",
  ];

  for (const skill of skills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
    lines.push("  </skill>");
  }

  lines.push("</available_skills>");

  return lines.join("\n");
}

/**
 * Format resolved skills with full content for immediate use
 */
export function formatSkillsWithContent(skills: ResolvedSkill[]): string {
  if (!skills || skills.length === 0) {
    return "";
  }

  const sections: string[] = [];

  for (const skill of skills) {
    sections.push(`<skill name="${escapeXml(skill.name)}">`);
    sections.push(skill.content);
    sections.push("</skill>");
    sections.push("");
  }

  return sections.join("\n");
}

/**
 * Escape special characters for XML
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Load and resolve skills for a subagent or team member
 */
export function loadSkillsForAgent(
  skillReferences: SkillReference[] | undefined,
  parentSkillReferences: SkillReference[] | undefined,
  cwd: string,
): { promptSection: string; skills: ResolvedSkill[]; errors: string[] } {
  const mergedRefs = mergeSkillArrays(parentSkillReferences, skillReferences);

  if (mergedRefs.length === 0) {
    return { promptSection: "", skills: [], errors: [] };
  }

  const result = resolveSkills(mergedRefs, { cwd });

  return {
    promptSection: formatSkillsForPrompt(result.skills),
    skills: result.skills,
    errors: [...result.errors, ...result.warnings],
  };
}

/**
 * Validate skill references without loading content
 */
export function validateSkillReferences(
  references: SkillReference[],
  cwd: string,
): { valid: string[]; invalid: string[] } {
  const index = buildSkillIndex(cwd);
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const ref of references) {
    if (!ref || ref.trim() === "") continue;

    if (index.has(ref.trim())) {
      valid.push(ref.trim());
    } else {
      invalid.push(ref.trim());
    }
  }

  return { valid, invalid };
}
