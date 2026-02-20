// path: .pi/lib/pi-coding-agent-compat.ts
// what: pi-coding-agent / pi-agent-core の型差分を吸収する互換レイヤーを提供する。
// why: 既存拡張コードを最小変更で TypeScript 0.53 系APIへ適合させるため。
// related: tsconfig-check.json, .pi/extensions, node_modules/@mariozechner/pi-coding-agent

declare module "@mariozechner/pi-coding-agent" {
  interface ExtensionUIContext {
    notify(message: string, type?: "info" | "warning" | "error" | "success"): void;
    getTitle?(): string | undefined;
  }

  interface ContextUsage {
    usageTokens?: number;
    trailingTokens?: number;
  }

  interface ExtensionAPI {
    // 旧コード互換: ExtensionAPI["context"] を型参照で使っている拡張がある。
    context: import("@mariozechner/pi-coding-agent").ExtensionContext;
    on(
      event: "session_end",
      handler: import("@mariozechner/pi-coding-agent").ExtensionHandler<
        import("@mariozechner/pi-coding-agent").SessionShutdownEvent
      >,
    ): void;
  }

  interface SessionStartEvent {
    sessionId?: string;
  }

  interface BashToolResultEvent {
    error?: string;
    result?: unknown;
  }
  interface ReadToolResultEvent {
    error?: string;
    result?: unknown;
  }
  interface EditToolResultEvent {
    error?: string;
    result?: unknown;
  }
  interface WriteToolResultEvent {
    error?: string;
    result?: unknown;
  }
  interface GrepToolResultEvent {
    error?: string;
    result?: unknown;
  }
  interface FindToolResultEvent {
    error?: string;
    result?: unknown;
  }
  interface LsToolResultEvent {
    error?: string;
    result?: unknown;
  }
  interface CustomToolResultEvent {
    error?: string;
    result?: unknown;
  }
}

export {};
