export type ContextObservationPhase =
  | "session_start"
  | "prompt"
  | "context"
  | "provider_request"
  | "tool_end"
  | "session_compact"
  | "cacheable_context";

export interface ContextScope {
  cwd?: string;
  sessionId?: string;
  /** strict excludes observations missing requested scope fields. include-global allows unscoped observations to participate explicitly. */
  mode?: "strict" | "include-global";
}

export interface ContextObservationBase {
  cwd?: string;
  sessionId?: string;
  at?: number;
}

export interface MessageBreakdownItem {
  index?: number;
  rank?: number;
  role?: string;
  type?: string;
  source?: string;
  bytes: number;
  estimatedTokens?: number;
}

export interface PromptObservation extends ContextObservationBase {
  phase: "prompt";
  summary: {
    promptBytes?: number;
    systemPromptBytes?: number;
    systemPromptParts?: Array<Record<string, unknown>>;
    toolCount?: number;
    tools?: string[];
    contextFileCount?: number;
    skillCount?: number;
    contextTokens?: number;
    contextPercent?: number;
  };
}

export interface MessageContextObservation extends ContextObservationBase {
  phase: "context";
  summary: { messageCount: number; messageBytes: number; messageBreakdown?: MessageBreakdownItem[]; contextTokens?: number; contextPercent?: number };
}

export interface ProviderRequestObservation extends ContextObservationBase {
  phase: "provider_request";
  summary: { payloadBytes: number; contextTokens?: number; contextPercent?: number };
}

export interface ToolExecutionObservation extends ContextObservationBase {
  phase: "tool_end";
  summary: { toolCallId?: string; toolName?: string; argsBytes?: number; resultBytes: number; isError?: boolean; contextTokens?: number; contextPercent?: number };
}

export interface CacheableContextObservation extends ContextObservationBase {
  phase: "cacheable_context";
  summary: Record<string, unknown>;
}

export interface SessionObservation extends ContextObservationBase {
  phase: "session_start" | "session_compact";
  summary: { contextTokens?: number; contextPercent?: number } & Record<string, unknown>;
}

export type ContextObservation =
  | PromptObservation
  | MessageContextObservation
  | ProviderRequestObservation
  | ToolExecutionObservation
  | CacheableContextObservation
  | SessionObservation;

export interface StoredContextObservation extends Omit<ContextObservation, "at"> {
  id: number;
  at: number;
}
