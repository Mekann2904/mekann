import type { SubagentResultV1 } from "./types.js";

export type ParseResult = { ok: true; result: SubagentResultV1 } | { ok: false; error: string };

function isObj(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function isStr(v: unknown): v is string { return typeof v === "string"; }
function isArr(v: unknown): v is unknown[] { return Array.isArray(v); }
function isStrArr(v: unknown): v is string[] { return Array.isArray(v) && v.every(isStr); }
function oneOf<T extends string>(v: unknown, values: readonly T[]): v is T { return typeof v === "string" && (values as readonly string[]).includes(v); }
const targetKinds = ["symbol", "type", "api_route", "graphql_field", "db_table", "db_column", "config_key", "feature", "event_payload", "cli_command", "file_format", "test_contract", "file"] as const;
function validTarget(v: unknown): boolean { return isObj(v) && oneOf(v.kind, targetKinds) && isStr(v.name); }
function validFileFingerprint(v: unknown): boolean { return isObj(v) && isStr(v.path) && isStr(v.hash); }
function validValidationCommand(v: unknown): boolean { return isObj(v) && ((v.kind === "npm_script" && isStr(v.script) && (v.args === undefined || isStrArr(v.args))) || (v.kind === "shell_allowlisted" && isStr(v.command_id) && (v.args === undefined || isStrArr(v.args)))); }
function validRequiredCheck(v: unknown): boolean { return isObj(v) && oneOf(v.kind, ["typecheck", "unit_test", "affected_test", "contract_test", "public_surface_diff", "invariant"] as const) && (v.target === undefined || isStr(v.target)) && (v.command === undefined || validValidationCommand(v.command)); }
const surfaceKinds = ["typescript_export", "rest_api", "graphql_schema", "database_schema", "config_schema", "cli", "event_payload", "file_format"] as const;
const assumptionKinds = ["symbol_signature", "data_shape", "behavior", "config_value", "dependency_version", "feature_flag", "test_contract"] as const;
function validPublicSurfaceDelta(v: unknown): boolean { return isObj(v) && oneOf(v.surface, surfaceKinds) && isStr(v.name) && oneOf(v.change, ["add", "remove", "modify"] as const) && oneOf(v.compatibility, ["compatible", "breaking", "unknown"] as const); }
function validAssumption(v: unknown): boolean { return isObj(v) && oneOf(v.kind, assumptionKinds) && validTarget(v.target) && isStr(v.expected) && (v.fingerprint === undefined || isStr(v.fingerprint)); }
function validEffect(v: unknown): boolean {
  if (!isObj(v) || !oneOf(v.kind, ["api_contract", "data_model", "behavior", "config", "side_effect", "test_expectation"] as const) || !validTarget(v.target)) return false;
  if (v.kind === "api_contract") return oneOf(v.change, ["add", "remove", "modify"] as const) && oneOf(v.compatibility, ["backward_compatible", "breaking", "unknown"] as const);
  if (v.kind === "data_model") return oneOf(v.change, ["add", "remove", "rename", "type_change", "semantic_change"] as const) && oneOf(v.compatibility, ["backward_compatible", "breaking", "unknown"] as const);
  if (v.kind === "behavior") return isStr(v.description) && oneOf(v.compatibility, ["backward_compatible", "breaking", "unknown"] as const);
  if (v.kind === "config") return oneOf(v.change, ["add", "remove", "modify"] as const) && oneOf(v.compatibility, ["backward_compatible", "breaking", "unknown"] as const);
  if (v.kind === "side_effect") return oneOf(v.operation, ["read", "write", "delete", "network", "db"] as const);
  return oneOf(v.change, ["add", "modify", "remove"] as const);
}

/**
 * Extract a JSON object from text that may be wrapped in markdown code blocks
 * or surrounded by prose.  LLMs frequently wrap JSON output in ```json ... ```
 * even when instructed not to.
 */
function balancedJsonObjects(text: string): string[] {
  const out: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) out.push(text.slice(start, i + 1));
    }
  }
  return out;
}

function looksLikeSubagentResult(candidate: string): boolean {
  try {
    const raw = JSON.parse(candidate) as unknown;
    return isObj(raw) && raw.schema === "subagent.result.v1";
  } catch { return false; }
}

function extractJSON(text: string): string {
  const trimmed = text.trim();

  // Try direct parse first (fast path)
  if (trimmed.startsWith("{") && looksLikeSubagentResult(trimmed)) return trimmed;

  // Look for markdown code blocks anywhere in the text. Prefer the block that
  // actually contains the subagent result; models sometimes include other JSON
  // snippets before the final structured result.
  const codeBlocks = [...trimmed.matchAll(/```(?:\w*)\s*\n([\s\S]*?)\n?```/g)].map((m) => m[1].trim());
  for (const block of codeBlocks) {
    if (block.startsWith("{") && looksLikeSubagentResult(block)) return block;
    const nested = balancedJsonObjects(block).find(looksLikeSubagentResult);
    if (nested) return nested;
  }

  // Fallback: scan balanced JSON objects and choose the one with the expected
  // schema. This avoids the old "first { to last }" behaviour, which failed
  // when prose or logs contained another JSON object before/after the result.
  const candidate = balancedJsonObjects(trimmed).find(looksLikeSubagentResult);
  if (candidate) return candidate;

  return trimmed;
}

export function tryParseSubagentResult(text: string): ParseResult {
  let raw: unknown;
  try { raw = JSON.parse(extractJSON(text)); } catch (err) { return { ok: false, error: `invalid_json: ${err instanceof Error ? err.message : String(err)}` }; }
  if (!isObj(raw)) return { ok: false, error: "result must be a JSON object" };
  if (raw.schema !== "subagent.result.v1") return { ok: false, error: "schema must be subagent.result.v1" };
  if (!isStr(raw.outcome)) return { ok: false, error: "outcome is required" };
  if (!["no_change", "patch", "blocked", "needs_decision", "observation"].includes(raw.outcome)) return { ok: false, error: `unsupported outcome: ${raw.outcome}` };
  if (raw.outcome === "no_change") {
    if (!isStr(raw.summary)) return { ok: false, error: "summary is required" };
  } else if (raw.outcome === "patch") {
    if (!isStr(raw.summary)) return { ok: false, error: "summary is required" };
    if (!isObj(raw.patch) || raw.patch.format !== "unified_diff") return { ok: false, error: "patch.format must be unified_diff" };
    if (isStr(raw.patch.ref)) return { ok: false, error: "patch.ref is not accepted from subagents; include patch.body" };
    if (!isStr(raw.patch.body)) return { ok: false, error: "patch.body is required" };
    if (!isObj(raw.base) || !isArr(raw.base.files) || !raw.base.files.every(validFileFingerprint)) return { ok: false, error: "base.files is required and must contain path/hash strings" };
    if (!isObj(raw.scope) || !isStrArr(raw.scope.allowed_paths) || !isStrArr(raw.scope.touched_paths)) return { ok: false, error: "scope allowed/touched paths are required string arrays" };
    if (!isObj(raw.semantic) || !isArr(raw.semantic.reads) || !raw.semantic.reads.every(validTarget) || !isArr(raw.semantic.writes) || !raw.semantic.writes.every(validTarget) || !isArr(raw.semantic.assumptions) || !raw.semantic.assumptions.every(validAssumption) || !isArr(raw.semantic.effects) || !raw.semantic.effects.every(validEffect) || !isArr(raw.semantic.public_surface_delta) || !raw.semantic.public_surface_delta.every(validPublicSurfaceDelta) || !isObj(raw.semantic.risk) || !oneOf(raw.semantic.risk.level, ["low", "medium", "high"] as const)) return { ok: false, error: "valid semantic metadata is required" };
    if (!isObj(raw.validation) || !isArr(raw.validation.suggested) || !raw.validation.suggested.every(validValidationCommand) || (raw.validation.required !== undefined && (!isArr(raw.validation.required) || !raw.validation.required.every(validRequiredCheck)))) return { ok: false, error: "validation must contain valid suggested commands and required checks" };
  } else if (raw.outcome === "blocked") {
    if (!isStr(raw.reason)) return { ok: false, error: "reason is required" };
  } else if (raw.outcome === "needs_decision") {
    if (!isStr(raw.question) || !isArr(raw.options)) return { ok: false, error: "question/options are required" };
  } else if (raw.outcome === "observation") {
    if (!isStr(raw.summary) || !isArr(raw.findings)) return { ok: false, error: "summary/findings are required" };
  }
  return { ok: true, result: raw as unknown as SubagentResultV1 };
}
