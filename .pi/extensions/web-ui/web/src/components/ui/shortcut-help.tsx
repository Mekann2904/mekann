/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/ui/shortcut-help.tsx
 * @role Keyboard shortcut help dialog with categorized display
 * @why Provide organized, searchable shortcut reference for power users
 * @related ../../hooks/useKeyboardShortcuts.ts, ../app.tsx
 * @public_api ShortcutHelpDialog
 * @invariants Dialog is modal and dismissible via Escape or click outside
 * @side_effects None (pure presentation)
 * @failure_modes None
 *
 * @abdd.explain
 * @overview Categorized keyboard shortcut help dialog
 * @what_it_does Displays all available shortcuts grouped by category with search
 * @why_it_exists Better UX than simple list - users can find shortcuts faster
 * @scope(in) Shortcut configurations, visibility state
 * @scope(out) Rendered help dialog
 */

import { useState, useMemo } from "preact/hooks";
import { X, Search, Keyboard, Command, Navigation, CheckSquare, Eye } from "lucide-preact";
import { cn } from "@/lib/utils";
import type { ShortcutConfig, ShortcutCategory } from "../../hooks/useKeyboardShortcuts";

export interface ShortcutHelpDialogProps {
  /** Whether dialog is visible */
  open: boolean;
  /** Callback when dialog should close */
  onClose: () => void;
  /** All available shortcuts to display */
  shortcuts: ShortcutConfig[];
}

const CATEGORY_CONFIG: Record<ShortcutCategory, { label: string; icon: typeof Command; color: string }> = {
  general: { label: "General", icon: Command, color: "text-blue-500" },
  navigation: { label: "Navigation", icon: Navigation, color: "text-green-500" },
  task: { label: "Task Management", icon: CheckSquare, color: "text-purple-500" },
  view: { label: "View", icon: Eye, color: "text-orange-500" },
};

/**
 * Format shortcut key combination for display
 */
function formatShortcut(config: ShortcutConfig): string {
  const parts: string[] = [];
  if (config.ctrl) parts.push("Ctrl");
  if (config.shift) parts.push("Shift");
  if (config.alt) parts.push("Alt");
  parts.push(config.key === "Escape" ? "Esc" : config.key);
  return parts.join(" + ");
}

/**
 * Group shortcuts by category
 */
function groupByCategory(shortcuts: ShortcutConfig[]): Record<ShortcutCategory, ShortcutConfig[]> {
  const grouped: Record<ShortcutCategory, ShortcutConfig[]> = {
    general: [],
    navigation: [],
    task: [],
    view: [],
  };

  for (const shortcut of shortcuts) {
    const category = shortcut.category || "general";
    grouped[category].push(shortcut);
  }

  return grouped;
}

/**
 * Shortcut help dialog with search and categorization
 * @summary ショートカットヘルプダイアログ
 */
export function ShortcutHelpDialog({ open, onClose, shortcuts }: ShortcutHelpDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter shortcuts based on search
  const filteredShortcuts = useMemo(() => {
    if (!searchQuery.trim()) return shortcuts;
    const query = searchQuery.toLowerCase();
    return shortcuts.filter(
      (s) =>
        s.description.toLowerCase().includes(query) ||
        s.key.toLowerCase().includes(query) ||
        (s.category && s.category.toLowerCase().includes(query))
    );
  }, [shortcuts, searchQuery]);

  // Group filtered shortcuts
  const grouped = useMemo(() => groupByCategory(filteredShortcuts), [filteredShortcuts]);

  if (!open) return null;

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        class={cn(
          "bg-card border border-border rounded-xl shadow-2xl",
          "w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col",
          "animate-in fade-in zoom-in-95 duration-200"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="flex items-center justify-between p-4 border-b border-border">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Keyboard class="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 class="text-lg font-semibold">Keyboard Shortcuts</h2>
              <p class="text-xs text-muted-foreground">
                Press <kbd class="px-1.5 py-0.5 bg-muted rounded text-[10px]">?</kbd> anytime to open this dialog
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            class="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X class="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Search */}
        <div class="p-4 border-b border-border">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
              placeholder="Search shortcuts..."
              class={cn(
                "w-full pl-9 pr-4 py-2 text-sm rounded-lg",
                "bg-muted/50 border border-transparent",
                "focus:bg-background focus:border-primary/50 focus:outline-none",
                "placeholder:text-muted-foreground/60"
              )}
            />
          </div>
        </div>

        {/* Content */}
        <div class="flex-1 overflow-y-auto p-4 space-y-6">
          {(Object.keys(grouped) as ShortcutCategory[]).map((category) => {
            const categoryShortcuts = grouped[category];
            if (categoryShortcuts.length === 0) return null;

            const config = CATEGORY_CONFIG[category];
            const Icon = config.icon;

            return (
              <div key={category} class="space-y-3">
                <div class="flex items-center gap-2">
                  <Icon class={cn("h-4 w-4", config.color)} />
                  <h3 class="text-sm font-medium text-foreground">{config.label}</h3>
                  <span class="text-xs text-muted-foreground">({categoryShortcuts.length})</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {categoryShortcuts.map((shortcut, index) => (
                    <div
                      key={`${shortcut.key}-${index}`}
                      class={cn(
                        "flex items-center justify-between p-3 rounded-lg",
                        "bg-muted/30 hover:bg-muted/50 transition-colors"
                      )}
                    >
                      <span class="text-sm text-foreground">{shortcut.description}</span>
                      <kbd
                        class={cn(
                          "px-2 py-1 text-xs font-mono rounded",
                          "bg-background border border-border shadow-sm",
                          "text-muted-foreground whitespace-nowrap"
                        )}
                      >
                        {formatShortcut(shortcut)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {filteredShortcuts.length === 0 && (
            <div class="text-center py-8 text-muted-foreground">
              <p>No shortcuts found matching &quot;{searchQuery}&quot;</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div class="p-4 border-t border-border bg-muted/20 rounded-b-xl">
          <p class="text-xs text-muted-foreground text-center">
            Tip: Shortcuts are disabled when typing in input fields. Press{" "}
            <kbd class="px-1.5 py-0.5 bg-background rounded border">Esc</kbd> to close any dialog.
          </p>
        </div>
      </div>
    </div>
  );
}
