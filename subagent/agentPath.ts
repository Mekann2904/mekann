/**
 * Subagent Extension — Agent path resolution and validation.
 *
 * Root is always `/root`.
 * Task names are relative to the current agent's path.
 * Paths are canonical and used as dedup keys in the registry.
 */

export const ROOT_PATH = "/root";

/**
 * Validate a single path segment. Rejects `.`, `..`, empty, and `/`.
 */
export function isValidSegment(seg: string): boolean {
  return seg.length > 0 && seg !== "." && seg !== ".." && !seg.includes("/");
}

/**
 * Join segments into a canonical path.
 * Returns the canonical path or throws on invalid segments.
 */
export function joinSegments(base: string, segments: string[]): string {
  for (const seg of segments) {
    if (!isValidSegment(seg)) {
      throw new Error(
        `Invalid path segment: "${seg}". Segments must not be empty, ".", "..", or contain "/".`,
      );
    }
  }
  const parts = base.split("/").filter(Boolean);
  return "/" + [...parts, ...segments].join("/");
}

/**
 * Resolve a task_name relative to the current agent's path.
 *
 * - Absolute path: must start with `/root/...`
 * - Relative path: joined to currentPath
 *
 * Returns the canonical path or throws.
 */
export function resolveTaskPath(
  taskName: string,
  currentPath: string,
): string {
  const trimmed = taskName.trim();
  if (!trimmed) {
    throw new Error("task_name must not be empty.");
  }

  if (trimmed.startsWith("/")) {
    // Absolute path — must be under /root
    if (trimmed === ROOT_PATH) {
      throw new Error(`Cannot spawn at root path "${ROOT_PATH}".`);
    }
    if (!trimmed.startsWith(ROOT_PATH + "/")) {
      throw new Error(
        `Absolute task_name must start with "${ROOT_PATH}/". Got: "${trimmed}".`,
      );
    }
    // Validate segments
    const segments = trimmed.slice(ROOT_PATH.length + 1).split("/");
    for (const seg of segments) {
      if (!isValidSegment(seg)) {
        throw new Error(
          `Invalid path segment in absolute path: "${seg}".`,
        );
      }
    }
    return trimmed;
  }

  // Relative path
  const segments = trimmed.split("/");
  return joinSegments(currentPath, segments);
}

/**
 * Check if `candidatePath` starts with `prefix` at a segment boundary.
 *
 * Example:
 *   pathPrefix("/root/research", "/root/research/api_scan") → true
 *   pathPrefix("/root/research", "/root/research2") → false
 */
export function pathPrefix(prefix: string, candidatePath: string): boolean {
  if (prefix === candidatePath) return true;
  if (!candidatePath.startsWith(prefix + "/")) return false;
  return true;
}

/**
 * Get the parent path of a canonical agent path.
 * Returns ROOT_PATH for direct children of root.
 * Returns null for ROOT_PATH itself.
 */
export function parentPath(path: string): string | null {
  if (path === ROOT_PATH) return null;
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash === 0) return ROOT_PATH;
  return path.slice(0, lastSlash);
}

/**
 * Get the depth of a path (number of segments below root).
 * ROOT_PATH → 0, /root/foo → 1, /root/foo/bar → 2
 */
export function pathDepth(path: string): number {
  if (path === ROOT_PATH) return 0;
  return path.split("/").length - 2; // -1 for leading /, -1 for "root"
}
