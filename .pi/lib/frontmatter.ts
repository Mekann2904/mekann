/**
 * path: .pi/lib/frontmatter.ts
 * role: Markdown frontmatter parsing utility shared across extensions.
 * why: Avoid runtime dependency on non-exported parser APIs in pi-coding-agent.
 * related: .pi/extensions/agent-teams/definition-loader.ts, .pi/extensions/skill-inspector.ts, .pi/lib/skill-registry.ts
 */

import { parse as parseYaml } from "yaml";

/**
 * Parse YAML frontmatter from markdown text.
 *
 * If frontmatter is missing or invalid, returns an empty frontmatter object
 * and the original content as body so callers can continue safely.
 */
export function parseFrontmatter<TFrontmatter extends Record<string, unknown>>(
  content: string,
): { frontmatter: TFrontmatter; body: string } {
  const source = String(content ?? "");
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {} as TFrontmatter, body: source };
  }

  const frontmatterText = match[1];
  const body = match[2] ?? "";

  try {
    const parsed = parseYaml(frontmatterText);
    const frontmatter =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as TFrontmatter)
        : ({} as TFrontmatter);
    return { frontmatter, body };
  } catch {
    return { frontmatter: {} as TFrontmatter, body };
  }
}

