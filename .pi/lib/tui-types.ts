/**
 * @abdd.meta
 * path: .pi/lib/tui-types.ts
 * role: TUI（Terminal User Interface）関連の型定義を提供するモジュール
 * why: live-monitor.ts等の拡張機能で使用されるTUIコールバックの型安全性を確保するため
 * related: .pi/extensions/subagents/live-monitor.ts, .pi/extensions/agent-teams/live-monitor.ts
 * public_api: TuiInstance, KeybindingMap, LiveMonitorContext
 * invariants: 型定義はTUIライブラリのインターフェースと整合している
 * side_effects: なし（型定義のみ）
 * failure_modes: なし
 * @abdd.explain
 * overview: TUIライブラリの型定義を提供し、any型の使用を排除する
 * what_it_does:
 *   - TUIコンテキストのインターフェースを定義する
 *   - キーバインドマップの型を定義する
 *   - テーマ型を定義する
 * why_it_exists:
 *   - any型の使用を排除し、型安全性を確保するため
 *   - 複数の拡張機能で共通の型を使用するため
 * scope:
 *   in: なし
 *   out: 型定義（TuiInstance, KeybindingMap, LiveMonitorContext）
 */

// Re-export Theme and ThemeColor from pi-coding-agent for compatibility
export type { Theme, ThemeColor } from "@mariozechner/pi-coding-agent";

/**
 * キーバインドの定義
 * @summary キーバインド定義
 */
export interface Keybinding {
  key: string;
  action: string;
  description?: string;
}

/**
 * キーバインドマップの型
 * @summary キーバインドマップ
 * @description pi-coding-agentのKeybindingsManager型を使用
 */
export type KeybindingMap = import("@mariozechner/pi-coding-agent").KeybindingsManager;

/**
 * TUIインスタンスのインターフェース
 * @summary TUIインスタンス
 * @description live-monitor等で使用されるTUIコールバックの最小限の型定義
 */
export interface TuiInstance {
  /** 端末の行数 */
  terminal: {
    rows: number;
    columns: number;
  };
  /** 再描画を要求する */
  requestRender: () => void;
}

/**
 * TUIオーバーレイオプション
 * @summary オーバーレイオプション
 */
export interface TuiOverlayOptions {
  width?: string | number;
  maxHeight?: string | number;
  row?: number;
  col?: number;
  margin?: number;
}

/**
 * TUIカスタムレンダラーの戻り値
 * @summary カスタムレンダラー
 */
export interface TuiCustomRenderResult {
  render: (width: number) => string[];
  invalidate: () => void;
  handleInput: (rawInput: string) => void;
}

/**
 * TUIカスタムコールバック関数の型
 * @summary カスタムコールバック型
 */
export type TuiCustomCallback = (
  tui: TuiInstance,
  theme: import("@mariozechner/pi-coding-agent").Theme,
  keybindings: KeybindingMap,
  done: () => void
) => TuiCustomRenderResult;

/**
 * TUI UIインターフェース
 * @summary TUI UI型
 * @description ExtensionContext.uiと互換性を持つため、柔軟な型定義を使用
 */
export interface TuiUI {
  /** カスタムオーバーレイを表示 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ExtensionContext.ui.custom has complex generic signature
  custom: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ExtensionContext.ui.custom has complex generic signature
    callback: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ExtensionContext.ui.custom options have complex type
    options?: any
  ) => Promise<unknown>;
  /** 通知を表示 */
  notify: (message: string, type: "info" | "warning" | "error" | "success") => void;
  /** ステータスを設定 */
  setStatus?: (key: string, value?: string) => void;
}

/**
 * ライブモニター用コンテキストの最小限の型定義
 * @summary ライブモニターコンテキスト型
 * @description createSubagentLiveMonitor/createAgentTeamLiveMonitorで使用されるctxパラメータの型
 */
export interface LiveMonitorContext {
  /** UIが利用可能かどうか */
  hasUI?: boolean;
  /** TUI UIインターフェース */
  ui?: TuiUI;
}
