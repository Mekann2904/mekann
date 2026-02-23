/**
 * @abdd.meta
 * path: .pi/lib/pi-coding-agent-compat.ts
 * role: 既存拡張機能とTypeScript 0.53系API間の型互換性を提供するモジュール宣言ファイル
 * why: pi-coding-agentとpi-agent-core間の型定義の差分を吸収し、既存拡張コードの変更を最小限に抑えるため
 * related: tsconfig-check.json, .pi/extensions, node_modules/@mariozechner/pi-coding-agent
 * public_api: 型定義の拡張（ExtensionUIContext, ContextUsage, ExtensionAPI, 各種イベント型）
 * invariants: 宣言モジュールは "@mariozechner/pi-coding-agent" に固定される
 * side_effects: 宣言マージによる型定義の上書きまたは拡張
 * failure_modes: 型定義の構造的不一致によるコンパイルエラー、または実行時エラー
 * @abdd.explain
 * overview: pi-coding-agentのモジュールに対する宣言マージを通じて、不足または差分のある型定義を補完し、互換性を確保する
 * what_it_does:
 *   - ExtensionUIContextにnotifyメソッドとgetTitleメソッドを追加する
 *   - ContextUsageにusageTokensとtrailingTokensを追加する
 *   - ExtensionAPIのcontextプロパティの型参照を明示的にする
 *   - SessionStartEventおよび各種ToolResultEvent（Bash, Read, Edit, Write, Grep, Find, Ls, Custom）の型定義を追加または再定義する
 * why_it_exists:
 *   - APIアップデートによる型シグネチャの変更に既存コードを追随させる
 *   - 型参照の解決を行い、型チェックを正常に通過させる
 * scope:
 *   in: なし（純粋な型定義ファイル）
 *   out: "@mariozechner/pi-coding-agent" モジュールのグローバル型定義空間への変更
 */

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
