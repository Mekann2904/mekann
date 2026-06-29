/**
 * Path-containment helpers for stored patch refs.
 *
 * Patch refs are the security boundary between untrusted subagent output and
 * the working tree: a stored result's `patch.ref` is read and fed to
 * `git apply`, so it must not escape the result-store directory. Four call
 * sites previously each kept their own lexical `isUnderDir` copy, which (a)
 * drifted and (b) did not resolve symlinks — a `patch.ref` that is (or
 * traverses) a symlink pointing outside the store dir would pass the lexical
 * check yet read an external file (issue #152 / IC-160).
 */
import { realpathSync } from "node:fs";
import path from "node:path";

/**
 * Resolve `p` via realpath when it exists, falling back to a lexical absolute
 * path otherwise (e.g. a ref whose target has not been written yet). The
 * fallback is safe because a missing target cannot be read to escape.
 */
function resolveReal(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * Security-boundary containment check for stored patch refs. Resolves symlinks
 * via realpath on both `file` and `dir` so a `patch.ref` that points (or
 * traverses) outside `dir` is rejected even when the lexical path looks
 * in-bounds (issue #152 / IC-160).
 */
export function isPatchRefUnderDir(file: string, dir: string): boolean {
  const rel = path.relative(resolveReal(dir), resolveReal(file));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}
