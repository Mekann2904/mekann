// Path: .pi/extensions/autonomous-loop-prompt.ts
// What: 自律ループ規約を全エージェントの system prompt に注入する拡張機能。
// Why: Ralph系の運用規律を通常時の標準動作として mekann に組み込むため。
// Related: .pi/lib/agent/autonomous-loop-policy.ts, .pi/lib/agent/prompt-stack.ts, package.json
/**
 * @abdd.meta
 * path: .pi/extensions/autonomous-loop-prompt.ts
 * role: 自律ループ規約の system prompt 注入
 * why: lead agent と subagent の両方に同じ運用規約を安定適用するため
 * related: .pi/lib/agent/autonomous-loop-policy.ts, .pi/lib/agent/prompt-stack.ts, package.json
 * public_api: default function
 * invariants: 同じ marker は二重注入しない、空の system prompt でも動く
 * side_effects: before_agent_start で systemPrompt を追記する
 * failure_modes: prompt stack entry が既に存在する場合は何もしない
 * @abdd.explain
 * overview: 自律ループ規約を prompt stack 経由で system prompt に追加する
 * what_it_does:
 *   - before_agent_start で規約を生成する
 *   - prompt stack marker で重複注入を防ぐ
 *   - 既存の system prompt の末尾に規約を足す
 * why_it_exists:
 *   - 通常時からの高自律挙動を拡張として有効化するため
 *   - APPEND_SYSTEM に依存しない実行時保証を持たせるため
 * scope:
 *   in: before_agent_start event
 *   out: 追記済み systemPrompt
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { buildAutonomousLoopPolicy } from "../lib/agent/autonomous-loop-policy.js";
import { applyPromptStack } from "../lib/agent/prompt-stack.js";

let isInitialized = false;

/**
 * 自律ループ規約注入を登録する。
 * @summary 規約注入登録
 * @param pi 拡張API
 * @returns void
 */
export default function registerAutonomousLoopPrompt(pi: ExtensionAPI): void {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  pi.on("before_agent_start", async (event, _ctx) => {
    const result = applyPromptStack(event.systemPrompt ?? "", [
      {
        source: "autonomous-loop-policy",
        recordSource: "autonomous-loop-policy",
        layer: "system-policy",
        markerId: "autonomous-loop-policy:lead",
        content: buildAutonomousLoopPolicy("lead"),
        priority: 25,
      },
    ]);

    if (result.appliedEntries.length === 0) {
      return undefined;
    }

    return {
      systemPrompt: result.systemPrompt,
    };
  });

  pi.on("session_shutdown", async () => {
    isInitialized = false;
  });
}
