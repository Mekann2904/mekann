import type { SubagentResultV1 } from "./types.js";

export type ParseResult = { ok: true; result: SubagentResultV1 } | { ok: false; error: string };

function isObj(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function isStr(v: unknown): v is string { return typeof v === "string"; }
function isArr(v: unknown): v is unknown[] { return Array.isArray(v); }

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
    if (!isObj(raw.base) || !isArr(raw.base.files)) return { ok: false, error: "base.files is required" };
    if (!isObj(raw.scope) || !isArr(raw.scope.allowed_paths) || !isArr(raw.scope.touched_paths)) return { ok: false, error: "scope allowed/touched paths are required" };
    if (!isObj(raw.semantic) || !isArr(raw.semantic.reads) || !isArr(raw.semantic.writes) || !isArr(raw.semantic.assumptions) || !isArr(raw.semantic.effects) || !isArr(raw.semantic.public_surface_delta) || !isObj(raw.semantic.risk) || !isStr(raw.semantic.risk.level)) return { ok: false, error: "semantic metadata is required" };
    if (!isObj(raw.validation) || !isArr(raw.validation.suggested)) return { ok: false, error: "validation.suggested is required" };
  } else if (raw.outcome === "blocked") {
    if (!isStr(raw.reason)) return { ok: false, error: "reason is required" };
  } else if (raw.outcome === "needs_decision") {
    if (!isStr(raw.question) || !isArr(raw.options)) return { ok: false, error: "question/options are required" };
  } else if (raw.outcome === "observation") {
    if (!isStr(raw.summary) || !isArr(raw.findings)) return { ok: false, error: "summary/findings are required" };
  }
  return { ok: true, result: raw as unknown as SubagentResultV1 };
}
