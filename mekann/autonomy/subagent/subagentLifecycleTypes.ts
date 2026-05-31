/**
 * Shared types for the SubagentLifecycle module family.
 *
 * These types were previously defined inline in subagentLifecycle.ts.
 * They are extracted here so spawnQueue.ts, subagentFinalizer.ts,
 * subagentSpawner.ts, and subagentLifecycle.ts can all import them
 * without circular dependencies.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AgentDisplayRef, AgentDisplayResult, AgentRuntime, AgentStatus, ResultContract, SpawnParams, SpawnResult, SubagentAuthority } from "./types.js";
import type { SubagentHub } from "./ipc.js";
import { KittyController } from "./kittyControl.js";

// ─── Queued spawn delegation ────────────────────────────────────

export interface QueuedSpawnDelegation {
  params: SpawnParams;
  ctx: ExtensionContext;
  callerPath: string;
  canonicalPath: string;
  depth: number;
  agentId: string;
  queuedMessages: string[];
}

// ─── Spawn delegation adapters ──────────────────────────────────

export interface SpawnDelegationAdapters {
  pi: import("@earendil-works/pi-coding-agent").ExtensionAPI;
  displayMode: "none" | "kitty-pi" | "kitty-split";
  logDir?: string;
  kitty: KittyController;
  hubFactory: (socketPath: string, expectedAgentId?: string, expectedNonce?: string) => SubagentHub;
  piCommand: string;
  extensionPath?: string;
  helloTimeoutMs: number;
  allowUnsafeExternalPi: boolean;
  maxQueuedSubagents: number;
  maxExternalPiSubagents: number;
  externalPiSlots: Set<string>;
  normalizeAuthority: (authority?: SubagentAuthority) => SubagentAuthority;
  authorityPreamble: (authority: SubagentAuthority, resultContract?: ResultContract) => string | undefined;
  filterToolsByAuthority: (tools: any[], authority: SubagentAuthority) => any[];
  resolveModel: (modelOverride: string | undefined, ctx: ExtensionContext) => Promise<any>;
  resolveThinkingLevel: (reasoningEffort: string | undefined) => ThinkingLevel | undefined;
  displayResult: (display?: AgentDisplayRef) => AgentDisplayResult | undefined;
}

// ─── Spawn delegation input ─────────────────────────────────────

export interface SpawnDelegationInput {
  params: SpawnParams;
  ctx: ExtensionContext;
  callerPath: string;
  agentId: string;
  adapters: SpawnDelegationAdapters;
}

// ─── Finalization input ─────────────────────────────────────────

export interface FinalizeSubagentInput {
  agentId: string;
  agentPath: string;
  callerPath: string;
  finalText?: string;
  status: AgentStatus;
  cwd?: string;
}
