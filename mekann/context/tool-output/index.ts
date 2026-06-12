/**
 * context/tool-output — tool 出力整形の共通 module。
 *
 * sandbox / output-gate が共有する redaction と LLM 出力 gating の facade。
 * artifact 保存の implementation は output-gate feature に残す。
 */

export { redactSecrets, SECRET_REDACTION_PATTERNS, type RedactionPattern } from "./redact.js";
export { gateTextForLlm, shouldGateOutput, buildStoredOutputStub, buildPreview } from "../output-gate/store.js";
