/*
 * .pi/lib/agent/prompt-stack.ts
 * system prompt への注入要素をレイヤ付きで統合する。
 * 分散した before_agent_start 注入を共通ルールで合成するために存在する。
 * 関連ファイル: .pi/lib/agent/runtime-notifications.ts, .pi/extensions/append-system-loader.ts, .pi/extensions/startup-context.ts, .pi/extensions/plan.ts
 */

import { createHash } from "node:crypto";

import { recordInjection } from "../context-breakdown-utils.js";

/**
 * @abdd.meta
 * path: .pi/lib/agent/prompt-stack.ts
 * role: Prompt Stack の統一的な合成ロジックを提供する
 * why: 複数の拡張が個別に system prompt を追記すると順序と重複が壊れやすいため
 * related: .pi/lib/agent/runtime-notifications.ts, .pi/extensions/append-system-loader.ts, .pi/extensions/startup-context.ts, .pi/extensions/plan.ts
 * public_api: PromptStackLayer, PromptStackEntry, applyPromptStack, hasPromptStackMarker
 * invariants: entry ごとに安定した marker を生成する、runtime-notification は最後段に並ぶ
 * side_effects: recordInjection による注入記録
 * failure_modes: 空コンテンツの entry は無視される
 * @abdd.explain
 * overview: tool description, system policy, startup context, runtime notification を一つの規則で合成する
 * what_it_does:
 *   - レイヤごとの優先順位で entry を並び替える
 *   - marker により重複注入を防ぐ
 *   - 注入内容を context breakdown へ記録する
 *   - 既存 prompt の末尾へ整形済みブロックを追加する
 * why_it_exists:
 *   - before_agent_start の追記処理を使い回せるようにするため
 *   - 分散した注入の順序を固定するため
 *   - 追加元ごとの可観測性を持たせるため
 * scope:
 *   in: basePrompt, PromptStackEntry[]
 *   out: systemPrompt, appliedEntries
 */

/**
 * Prompt Stack レイヤ。
 * @summary プロンプト層
 */
export type PromptStackLayer =
  | "tool-description"
  | "system-policy"
  | "startup-context"
  | "runtime-notification";

/**
 * Prompt Stack の 1 エントリ。
 * @summary プロンプト項目
 */
export interface PromptStackEntry {
  source: string;
  layer: PromptStackLayer;
  content: string;
  priority?: number;
  markerId?: string;
  recordSource?: string;
}

/**
 * Prompt Stack の適用結果。
 * @summary 適用結果
 */
export interface PromptStackApplyResult {
  systemPrompt: string;
  appliedEntries: PromptStackEntry[];
}

/**
 * Prompt Stack の描画結果。
 * @summary 描画結果
 */
export interface PromptStackRenderResult {
  prompt: string;
  renderedEntries: PromptStackEntry[];
}

const LAYER_WEIGHT: Record<PromptStackLayer, number> = {
  "tool-description": 100,
  "system-policy": 200,
  "startup-context": 300,
  "runtime-notification": 400,
};

/**
 * 文字列を正規化する。
 * @summary 文字列正規化
 * @param value 入力文字列
 * @returns 正規化後の文字列
 */
function normalizeContent(value: string): string {
  return value.trim();
}

/**
 * marker 用の識別子を作る。
 * @summary marker 作成
 * @param entry Prompt Stack entry
 * @returns marker 識別子
 */
function buildMarkerId(entry: PromptStackEntry): string {
  if (entry.markerId?.trim()) {
    return entry.markerId.trim();
  }

  const hash = createHash("sha256")
    .update(`${entry.source}:${entry.layer}:${normalizeContent(entry.content)}`)
    .digest("hex")
    .slice(0, 12);
  return `${entry.source}:${entry.layer}:${hash}`;
}

/**
 * marker 文字列を作る。
 * @summary marker 文字列
 * @param entry Prompt Stack entry
 * @returns marker
 */
function buildMarker(entry: PromptStackEntry): string {
  return `<!-- prompt-stack:${buildMarkerId(entry)} -->`;
}

/**
 * entry が既に prompt に含まれるかを判定する。
 * @summary 重複判定
 * @param prompt 現在の prompt
 * @param entry Prompt Stack entry
 * @returns 含まれる場合 true
 */
export function hasPromptStackMarker(prompt: string, entry: PromptStackEntry): boolean {
  return prompt.includes(buildMarker(entry));
}

/**
 * entry を marker 付きブロックへ変換する。
 * @summary ブロック化
 * @param entry Prompt Stack entry
 * @returns marker 付きブロック
 */
function formatEntryBlock(entry: PromptStackEntry): string {
  return `\n\n${buildMarker(entry)}\n${normalizeContent(entry.content)}`;
}

/**
 * 適用対象をソートする。
 * @summary 順序決定
 * @param entries entry 配列
 * @returns ソート済み entry 配列
 */
function sortEntries(entries: PromptStackEntry[]): PromptStackEntry[] {
  return [...entries].sort((left, right) => {
    const byLayer = LAYER_WEIGHT[left.layer] - LAYER_WEIGHT[right.layer];
    if (byLayer !== 0) {
      return byLayer;
    }
    return (left.priority ?? 0) - (right.priority ?? 0);
  });
}

/**
 * Prompt Stack を marker なしで描画する。
 * @summary Prompt Stack 描画
 * @param entries 描画対象
 * @returns 描画結果
 */
export function renderPromptStack(
  entries: PromptStackEntry[],
): PromptStackRenderResult {
  const seen = new Set<string>();
  const renderedEntries: PromptStackEntry[] = [];
  const blocks: string[] = [];

  for (const entry of sortEntries(entries)) {
    const content = normalizeContent(entry.content);
    if (!content) {
      continue;
    }

    const key = `${entry.source}:${entry.layer}:${content}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    renderedEntries.push({ ...entry, content });
    blocks.push(content);
  }

  return {
    prompt: blocks.join("\n\n"),
    renderedEntries,
  };
}

/**
 * Prompt Stack を適用する。
 * @summary Prompt Stack 適用
 * @param basePrompt 元の system prompt
 * @param entries 適用する entry 配列
 * @returns 適用結果
 */
export function applyPromptStack(
  basePrompt: string,
  entries: PromptStackEntry[],
): PromptStackApplyResult {
  let systemPrompt = basePrompt;
  const appliedEntries: PromptStackEntry[] = [];

  for (const entry of sortEntries(entries)) {
    const content = normalizeContent(entry.content);
    if (!content) {
      continue;
    }
    if (hasPromptStackMarker(systemPrompt, entry)) {
      continue;
    }

    const block = formatEntryBlock({ ...entry, content });
    systemPrompt += block;
    recordInjection(entry.recordSource ?? entry.source, block);
    appliedEntries.push({ ...entry, content });
  }

  return {
    systemPrompt,
    appliedEntries,
  };
}
