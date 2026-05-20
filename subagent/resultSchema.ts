import type { SubagentResultV1 } from "./types.js";

export type ParseResult = { ok: true; result: SubagentResultV1 } | { ok: false; error: string };

function isObj(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function isStr(v: unknown): v is string { return typeof v === "string"; }
function isArr(v: unknown): v is unknown[] { return Array.isArray(v); }
function isStrArr(v: unknown): v is string[] { return Array.isArray(v) && v.every(isStr); }
function oneOf<T extends string>(v: unknown, values: readonly T[]): v is T { return typeof v === "string" && (values as readonly string[]).includes(v); }
function validTarget(v: unknown): boolean { return isObj(v) && isStr(v.kind) && isStr(v.name); }
function validFileFingerprint(v: unknown): boolean { return isObj(v) && isStr(v.path) && isStr(v.hash); }
function validValidationCommand(v: unknown): boolean { return isObj(v) && ((v.kind === "npm_script" && isStr(v.script) && (v.args === undefined || isStrArr(v.args))) || (v.kind === "shell_allowlisted" && isStr(v.command_id) && (v.args === undefined || isStrArr(v.args)))); }
function validPublicSurfaceDelta(v: unknown): boolean { return isObj(v) && isStr(v.surface) && isStr(v.name) && oneOf(v.change, ["add", "remove", "modify"] as const) && oneOf(v.compatibility, ["compatible", "breaking", "unknown"] as const); }

export function tryParseSubagentResult(text: string): ParseResult {
  let raw: unknown;
  try { raw = JSON.parse(text.trim()); } catch (err) { return { ok: false, error: `invalid_json: ${err instanceof Error ? err.message : String(err)}` }; }
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
    if (!isObj(raw.semantic) || !isArr(raw.semantic.reads) || !raw.semantic.reads.every(validTarget) || !isArr(raw.semantic.writes) || !raw.semantic.writes.every(validTarget) || !isArr(raw.semantic.assumptions) || !isArr(raw.semantic.effects) || !isArr(raw.semantic.public_surface_delta) || !raw.semantic.public_surface_delta.every(validPublicSurfaceDelta) || !isObj(raw.semantic.risk) || !oneOf(raw.semantic.risk.level, ["low", "medium", "high"] as const)) return { ok: false, error: "valid semantic metadata is required" };
    if (!isObj(raw.validation) || !isArr(raw.validation.suggested) || !raw.validation.suggested.every(validValidationCommand)) return { ok: false, error: "validation.suggested must contain valid validation commands" };
  } else if (raw.outcome === "blocked") {
    if (!isStr(raw.reason)) return { ok: false, error: "reason is required" };
  } else if (raw.outcome === "needs_decision") {
    if (!isStr(raw.question) || !isArr(raw.options)) return { ok: false, error: "question/options are required" };
  } else if (raw.outcome === "observation") {
    if (!isStr(raw.summary) || !isArr(raw.findings)) return { ok: false, error: "summary/findings are required" };
  }
  return { ok: true, result: raw as unknown as SubagentResultV1 };
}
