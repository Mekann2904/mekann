/**
 * TUI関連の型定義
 * @module lib/tui/types
 */

// Re-export Theme and ThemeColor from pi-coding-agent for compatibility
export type { Theme, ThemeColor } from "@mariozechner/pi-coding-agent";

/**
 * TUIカスタムコールバックのパラメータ
 */
export interface TUICustomCallbackParams {
  tui: unknown;
  theme: import("@mariozechner/pi-coding-agent").Theme;
  keybindings: unknown;
  done: () => void;
}

/**
 * TUIコンポーネントの基本オプション
 */
export interface TUIBaseOptions {
  width?: number;
  height?: number;
  border?: boolean;
  label?: string;
}
