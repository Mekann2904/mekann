/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/hooks/useKeyboardShortcuts.ts
 * @role Global keyboard shortcuts management
 * @why Provide keyboard navigation and quick actions
 * @related app.tsx, tasks-page.tsx
 * @public_api useKeyboardShortcuts, useGlobalShortcuts, ShortcutConfig
 * @invariants Shortcuts are disabled when typing in input fields
 * @side_effects Registers global event listeners
 * @failure_modes None (graceful handling)
 *
 * @abdd.explain
 * @overview Keyboard shortcuts hook with form detection
 * @what_it_does Manages keyboard shortcuts with auto-disable in forms
 * @why_it_exists Power user features for faster navigation
 * @scope(in) Keyboard events
 * @scope(out) Action callbacks
 */

import { useEffect, useCallback, useRef } from "preact/hooks";

export type ShortcutCategory = "general" | "navigation" | "task" | "view";

/**
 * Keyboard shortcut configuration
 */
export interface ShortcutConfig {
  /** Key to listen for (e.g., 'k', 'n', '?') */
  key: string;
  /** Require Ctrl/Cmd key */
  ctrl?: boolean;
  /** Require Shift key */
  shift?: boolean;
  /** Require Alt/Option key */
  alt?: boolean;
  /** Action to execute */
  action: () => void;
  /** Description for help display */
  description: string;
  /** Category for help dialog grouping */
  category?: ShortcutCategory;
  /** Whether to prevent default behavior */
  preventDefault?: boolean;
}

/**
 * Check if event target is an input element
 */
function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  const isEditable = target.isContentEditable;

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    isEditable ||
    target.closest("[contenteditable]") !== null
  );
}

/**
 * Check if shortcut matches keyboard event
 */
function matchesShortcut(event: KeyboardEvent, config: ShortcutConfig): boolean {
  // Key match (case-insensitive)
  if (event.key.toLowerCase() !== config.key.toLowerCase()) {
    return false;
  }

  // Modifier match
  const ctrlMatch = config.ctrl ? (event.ctrlKey || event.metaKey) : true;
  const shiftMatch = config.shift ? event.shiftKey : !event.shiftKey;
  const altMatch = config.alt ? event.altKey : !event.altKey;

  // If ctrl is required, ensure it's pressed
  if (config.ctrl && !(event.ctrlKey || event.metaKey)) {
    return false;
  }

  return ctrlMatch && shiftMatch && altMatch;
}

/**
 * Hook for managing keyboard shortcuts
 * @summary キーボードショートカットフック
 * @param shortcuts - Array of shortcut configurations
 * @param options - Hook options
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutConfig[],
  options: {
    /** Whether shortcuts are enabled (default: true) */
    enabled?: boolean;
    /** Whether to disable in input fields (default: true) */
    disableInInput?: boolean;
    /** Additional condition to disable shortcuts */
    disabled?: boolean;
  } = {}
) {
  const { enabled = true, disableInInput = true, disabled = false } = options;
  const shortcutsRef = useRef(shortcuts);

  // Keep shortcuts ref updated
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Skip if disabled
      if (!enabled || disabled) {
        return;
      }

      // Skip if in input field and disableInInput is true
      if (disableInInput && isInputElement(event.target)) {
        // Exception: Escape key always works
        if (event.key !== "Escape") {
          return;
        }
      }

      // Find matching shortcut
      for (const config of shortcutsRef.current) {
        if (matchesShortcut(event, config)) {
          if (config.preventDefault !== false) {
            event.preventDefault();
          }
          config.action();
          return;
        }
      }
    },
    [enabled, disableInInput, disabled]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * Predefined shortcut configurations for common actions
 */
export const COMMON_SHORTCUTS = {
  /** Command palette (Ctrl+K) */
  commandPalette: (action: () => void): ShortcutConfig => ({
    key: "k",
    ctrl: true,
    action,
    description: "コマンドパレットを開く",
  }),

  /** New task (Ctrl+N) */
  newTask: (action: () => void): ShortcutConfig => ({
    key: "n",
    ctrl: true,
    action,
    description: "新規タスクを作成",
  }),

  /** Escape - close panels/modals */
  escape: (action: () => void): ShortcutConfig => ({
    key: "Escape",
    action,
    description: "閉じる",
    preventDefault: false,
  }),

  /** Help (?) */
  help: (action: () => void): ShortcutConfig => ({
    key: "?",
    shift: true,
    action,
    description: "ショートカットヘルプを表示",
  }),

  /** Search (/) */
  search: (action: () => void): ShortcutConfig => ({
    key: "/",
    action,
    description: "検索バーにフォーカス",
  }),
};

/**
 * Hook for global shortcuts (used in app.tsx)
 * @summary グローバルショートカットフック
 * @param onCommandPalette - Command palette callback
 * @param onHelp - Help callback
 */
export function useGlobalShortcuts(
  onCommandPalette: () => void,
  onHelp: () => void
) {
  const shortcuts: ShortcutConfig[] = [
    COMMON_SHORTCUTS.commandPalette(onCommandPalette),
    COMMON_SHORTCUTS.help(onHelp),
  ];

  useKeyboardShortcuts(shortcuts);
}

/**
 * Hook for page-specific shortcuts
 * @summary ページ別ショートカットフック
 * @param shortcuts - Additional shortcuts
 * @param isActive - Whether the page is active
 */
export function usePageShortcuts(
  shortcuts: ShortcutConfig[],
  isActive: boolean = true
) {
  useKeyboardShortcuts(shortcuts, { enabled: isActive });
}
